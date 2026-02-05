require('dotenv').config();
const helmet = require('helmet');
const validator = require('validator');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@libsql/client');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Configuration: Define your production domain here
// In production, this should be set via environment variable
const APP_DOMAIN = process.env.APP_DOMAIN || 'edurl.vercel.app';
const TRUSTED_HOSTS = [APP_DOMAIN, 'localhost', `localhost:${PORT}`];

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https://*"],
        },
    },
}));
app.use(express.json({ limit: '10kb' })); // DoS: Limit payload size
app.use(express.static(path.join(__dirname, 'public')));

// Validate environment variables
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('ERROR: Missing required environment variables!');
    console.error('Required: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN');
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing Turso environment variables. Please configure them in Vercel dashboard.');
    }
}

// URL Validation Constants
const BLOCKED_DOMAINS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'edurl.vercel.app']; // Added own domain
const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const MAX_URL_LENGTH = 2048;

// Rate Limiting Configuration
const shortenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Anti-Scraping Limiter for Redirects
const redirectLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per 15 mins (more permissive than shorten)
    message: 'Too many redirection requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Database Setup - Turso
const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

// Database initialization flag
let dbInitialized = false;
let urlsTableInitialised = false;
let reportsTableInitialised = false;

// Initialize database table (lazy initialization)
async function ensureTableExists() {
    if (dbInitialized) return;

    try {
        await db.execute(`CREATE TABLE IF NOT EXISTS urls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_url TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Optimization: Add index for faster duplicate checks
        await db.execute(`CREATE INDEX IF NOT EXISTS idx_original_url ON urls(original_url)`);

        urlsTableInitialised = true;

        await db.execute(`CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url_code TEXT NOT NULL,
            reason TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (url_code) REFERENCES urls(code)
        )`);

        reportsTableInitialised = true;

        dbInitialized = urlsTableInitialised && reportsTableInitialised;
        console.log('Database tables ready.');
    } catch (err) {
        console.error('Error creating tables:', err.message);
        throw err;
    }
}


// Helper to generate a short code
function generateCode(length = 6) {
    return crypto.randomBytes(length).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, length);
}

// Enhanced URL Validation
function validateUrl(urlString) {
    if (!urlString || urlString.length > MAX_URL_LENGTH) {
        throw new Error('URL is too long or empty (max 2048 characters).');
    }

    let url;
    try {
        url = new URL(urlString);
    } catch (_) {
        throw new Error('Invalid URL format.');
    }

    // Validate protocol
    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
        throw new Error('Invalid protocol. Only HTTP and HTTPS are allowed.');
    }

    // Block local/private addresses
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.')) {
        throw new Error('Shortening local or private URLs is not allowed.');
    }

    // Block other shorteners to prevent chains
    if (BLOCKED_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
        throw new Error('Shortening other URL shorteners is not allowed to prevent redirect chains.');
    }

    // Strict own-domain recursion check
    if (hostname === APP_DOMAIN || hostname.endsWith('.' + APP_DOMAIN)) {
        throw new Error('You cannot shorten internal EdUrl links.');
    }

    return true;
}

// Routes

// Helper to check if URL already exists
async function checkExistingUrl(originalUrl) {
    try {
        const result = await db.execute({
            sql: 'SELECT code FROM urls WHERE original_url = ?',
            args: [originalUrl]
        });
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (err) {
        throw err;
    }
}

// Shorten URL
app.post('/api/shorten', shortenLimiter, async (req, res) => {
    const { originalUrl } = req.body;

    if (!originalUrl) {
        return res.status(400).json({ error: 'originalUrl is required' });
    }

    // Enhanced URL Validation
    try {
        validateUrl(originalUrl);
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    try {
        // Ensure database table exists
        await ensureTableExists();

        // Check if URL has already been shortened
        const existingRow = await checkExistingUrl(originalUrl);

        // If URL already exists, return the existing short URL
        if (existingRow) {
            // Fix Host Header Injection: Use APP_DOMAIN instead of req.get('host')
            // For local development, we fallback to host header if APP_DOMAIN is default
            const displayHost = (process.env.NODE_ENV === 'production') ? APP_DOMAIN : req.get('host');
            const shortUrl = `${req.protocol}://${displayHost}/${existingRow.code}`;
            return res.json({
                originalUrl,
                code: existingRow.code,
                shortUrl,
                existing: true // Flag to indicate this was already shortened
            });
        }

        // URL doesn't exist, create a new short URL with collision handling
        let code;
        let isUnique = false;
        let attempts = 0;
        const maxAttempts = 5;

        while (!isUnique && attempts < maxAttempts) {
            code = generateCode();
            const existingCode = await db.execute({
                sql: 'SELECT 1 FROM urls WHERE code = ?',
                args: [code]
            });
            if (existingCode.rows.length === 0) {
                isUnique = true;
            }
            attempts++;
        }

        if (!isUnique) {
            throw new Error('Failed to generate a unique short code. Please try again.');
        }

        // Sanitize URL before saving
        const sanitizedUrl = validator.trim(originalUrl);

        await db.execute({
            sql: 'INSERT INTO urls (original_url, code) VALUES (?, ?)',
            args: [sanitizedUrl, code]
        });

        const shortUrl = `${req.protocol}://${(process.env.NODE_ENV === 'production') ? APP_DOMAIN : req.get('host')}/${code}`;
        res.json({ originalUrl, code, shortUrl, existing: false });
    } catch (err) {
        console.error('Error processing URL:', err.message);
        return res.status(500).json({ error: 'Database error' });
    }
});

// Report URL
app.post('/api/report', async (req, res) => {
    const { code, reason } = req.body;

    if (!code || !reason) {
        return res.status(400).json({ error: 'Code and reason are required' });
    }

    try {
        await ensureTableExists();

        // Check if the code exists
        const checkResult = await db.execute({
            sql: 'SELECT 1 FROM urls WHERE code = ?', // 
            args: [code]
        });

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Short URL not found' });
        }

        await db.execute({
            sql: 'INSERT INTO reports (url_code, reason) VALUES (?, ?)',
            args: [code, validator.escape(reason)]
        });

        res.json({ message: 'Report submitted successfully' });
    } catch (err) {
        console.error('Error submitting report:', err.message);
        return res.status(500).json({ error: 'Database error' });
    }
});

// Redirect Check Logic
app.get('/:code', redirectLimiter, async (req, res) => {
    const { code } = req.params;

    try {
        await ensureTableExists();

        const result = await db.execute({
            sql: 'SELECT original_url FROM urls WHERE code = ?',
            args: [code]
        });

        if (result.rows.length === 0) {
            return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
                if (err) res.status(404).send('URL not found');
            });
        }

        const targetUrl = result.rows[0].original_url;

        // Security Header: Prevent referrer leakage during redirect
        res.setHeader('Referrer-Policy', 'no-referrer');

        // Optimization: Use a quick check for reports
        const reports = await db.execute({
            sql: 'SELECT 1 FROM reports WHERE url_code = ? LIMIT 1',
            args: [code]
        });

        if (reports.rows.length > 0) {
            return res.send(generateWarningPage(targetUrl, code));
        }

        res.redirect(targetUrl);
    } catch (err) {
        console.error('Error querying database:', err.message);
        return res.status(500).send('Database error');
    }
});

/**
 * Generates a security warning page for external redirects
 */
function generateWarningPage(targetUrl, code) {
    const escapedUrl = validator.escape(targetUrl);
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EdUrl - Security Warning</title>
            <style>
                body { font-family: 'Inter', system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
                .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 400px; text-align: center; border: 1px solid #e5e7eb; }
                h1 { font-size: 1.5rem; margin-top: 0; margin-bottom: 1rem; color: #ef4444; }
                p { margin-bottom: 1.5rem; line-height: 1.6; color: #4b5563; word-break: break-all; }
                .btn { display: inline-block; padding: 0.75rem 1.5rem; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background 0.2s; }
                .btn:hover { background: #4f46e5; }
                .cancel { display: block; margin-top: 1rem; color: #6b7280; text-decoration: none; font-size: 0.875rem; }
                .cancel:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Security Warning</h1>
                <p>You are about to be redirected to a site<br>that has been <b>reported</b> for malicious activity:<br><b>${escapedUrl}</b></p>
                <p>Only proceed if you trust this link.</p>
                <a href="${targetUrl}" class="btn">Proceed to Site</a>
                <a href="/" class="cancel">Go Back to EdUrl</a>
            </div>
        </body>
        </html>
    `;
}

// Start Server (only for local development)
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log('Connected to Turso database');
    });
}

// Export for Vercel serverless
module.exports = app;
