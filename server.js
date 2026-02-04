require('dotenv').config();
const express = require('express');
const { createClient } = require('@libsql/client');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Validate environment variables
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('ERROR: Missing required environment variables!');
    console.error('Required: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN');
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing Turso environment variables. Please configure them in Vercel dashboard.');
    }
}

// Database Setup - Turso
const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

// Database initialization flag
let dbInitialized = false;

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
        dbInitialized = true;
        console.log('urls table ready.');
    } catch (err) {
        console.error('Error creating table:', err.message);
        throw err;
    }
}


// Helper to generate a short code
function generateCode(length = 6) {
    return crypto.randomBytes(length).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, length);
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
app.post('/api/shorten', async (req, res) => {
    const { originalUrl } = req.body;

    if (!originalUrl) {
        return res.status(400).json({ error: 'originalUrl is required' });
    }

    // Check if valid URL (basic check)
    try {
        new URL(originalUrl);
    } catch (_) {
        return res.status(400).json({ error: 'Invalid URL format' });
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

        // URL doesn't exist, create a new short URL
        const code = generateCode();

        await db.execute({
            sql: 'INSERT INTO urls (original_url, code) VALUES (?, ?)',
            args: [originalUrl, code]
        });

        const shortUrl = `${req.protocol}://${req.get('host')}/${code}`;
        res.json({ originalUrl, code, shortUrl, existing: false });
    } catch (err) {
        console.error('Error processing URL:', err.message);
        return res.status(500).json({ error: 'Database error' });
    }
});

// Redirect
app.get('/:code', async (req, res) => {
    const { code } = req.params;

    try {
        // Ensure database table exists
        await ensureTableExists();

        const result = await db.execute({
            sql: 'SELECT original_url FROM urls WHERE code = ?',
            args: [code]
        });

        if (result.rows.length > 0) {
            res.redirect(result.rows[0].original_url);
        } else {
            // Check if it's a static file request that missed static middleware or just 404
            // Since static is strictly checking public folder, this is likely an invalid short code.
            res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
                if (err) res.status(404).send('URL not found');
            });
        }
    } catch (err) {
        console.error('Error querying database:', err.message);
        return res.status(500).send('Database error');
    }
});

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
