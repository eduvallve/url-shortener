require('dotenv').config();
const helmet = require('helmet');
const validator = require('validator');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@libsql/client');
const path = require('path');
const crypto = require('crypto');

const app = express();

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],                                // Allow content from own origin
            styleSrc: ["'self'", "https://fonts.googleapis.com"],  // Allow styles from Google Fonts
            fontSrc: ["'self'", "https://fonts.gstatic.com"],      // Allow fonts from Google Fonts
            scriptSrc: ["'self'"],                                 // Allow scripts from own origin
            imgSrc: ["'self'", "data:", "https://*"],              // Allow images from any origin
            connectSrc: ["'self'"],                                // Allow API calls
            objectSrc: ["'none'"],                                 // Prevent loading of plugins
            upgradeInsecureRequests: [],                           // Upgrade insecure requests to HTTPS
        },
    },
    hsts: {
        maxAge: 31536000,                                          // 1 year
        includeSubDomains: true,                                   // Include subdomains
        preload: true                                              // Preload HSTS in browser
    },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }  // Referrer policy
}));
app.use(express.json({ limit: '10kb' }));                          // DoS: Limit payload size
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
const ALLOWED_PROTOCOLS = ['http:', 'https:'];                    // Added http for local development
const MAX_URL_LENGTH = 2048;                                      // Maximum URL length (2048 characters)

// Rate Limiting Configuration
const shortenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,                                     // 15 minutes
    max: 20,                                                      // Limit each IP to 20 requests per windowMs
    standardHeaders: true,                                        // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,                                         // Disable the `X-RateLimit-*` headers
});

// Anti-Scraping Limiter for Redirects
const redirectLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,                                     // 15 minutes
    max: 100,                                                     // Limit each IP to 100 requests per 15 mins (more permissive than shorten)
    message: 'Too many redirection requests, please try again in 15 minutes.',
    standardHeaders: true,                                        // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,                                         // Disable the `X-RateLimit-*` headers
});

// Database Setup - Turso
const db = createClient({
    url: process.env.TURSO_DATABASE_URL,                          // Turso database URL
    authToken: process.env.TURSO_AUTH_TOKEN                       // Turso authentication token
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
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        throw new Error('Shortening local URLs is not allowed.');
    }

    // IP address validation for SSRF (matches direct IPs better)
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (ipRegex.test(hostname)) {
        const parts = hostname.split('.').map(Number);
        const first = parts[0];
        const second = parts[1];
        // 127.0.0.1 (Loopback), 10.0.0.0/8 (Private), 192.168.0.0/16 (Private), 172.16.0.0/12 (Private), 192.168.0.0/16 (Private)
        if (first === 127 || first === 10 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31)) {
            throw new Error('Shortening private IP addresses is not allowed.');
        }
    }

    // Block other shorteners to prevent chains
    if (BLOCKED_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
        throw new Error('Shortening other URL shorteners is not allowed to prevent redirect chains.');
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
            const shortUrl = `${req.protocol}://${req.get('host')}/${existingRow.code}`;
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

        const shortUrl = `${req.protocol}://${req.get('host')}/${code}`;
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

    // Validate code format (6 alphanumeric characters)
    if (!/^[a-zA-Z0-9]{6}$/.test(code)) {
        return res.status(400).json({ error: 'Invalid short code format' });
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
            <link rel="stylesheet" href="/style.warning.css">
        </head>
        <body>
            <div class="card">
                <h1>Security Warning</h1>
                <p>You are about to be redirected to a site that has been <b>reported</b> for malicious activity:<br><b>${escapedUrl}</b></p>
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
