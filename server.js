const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'urls.db');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Setup
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        createTable();
    }
});

function createTable() {
    db.run(`CREATE TABLE IF NOT EXISTS urls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_url TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating table:', err.message);
        } else {
            console.log('urls table ready.');
        }
    });
}

// Helper to generate a short code
function generateCode(length = 6) {
    return crypto.randomBytes(length).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, length);
}

// Routes

// Shorten URL
app.post('/api/shorten', (req, res) => {
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

    const code = generateCode();

    // In a production app, we should check for code collision/uniqueness,
    // but with 6 base64 chars, it's rare for small scale. 
    // We'll trust the unique constraint to throw error if very unlucky, or just retry one time.

    const stmt = db.prepare('INSERT INTO urls (original_url, code) VALUES (?, ?)');
    stmt.run(originalUrl, code, function (err) {
        if (err) {
            console.error('Error inserting URL:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }

        const shortUrl = `${req.protocol}://${req.get('host')}/${code}`;
        res.json({ originalUrl, code, shortUrl });
    });
    stmt.finalize();
});

// Redirect
app.get('/:code', (req, res) => {
    const { code } = req.params;

    db.get('SELECT original_url FROM urls WHERE code = ?', [code], (err, row) => {
        if (err) {
            console.error('Error querying database:', err.message);
            return res.status(500).send('Database error');
        }

        if (row) {
            res.redirect(row.original_url);
        } else {
            // Check if it's a static file request that missed static middleware or just 404
            // Since static is strictly checking public folder, this is likely an invalid short code.
            res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
                if (err) res.status(404).send('URL not found');
            });
        }
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
