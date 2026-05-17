const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@libsql/client');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_123';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.static(path.join(__dirname)));

// Turso client
const db = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN,
});

async function initDB() {
    await db.executeMultiple(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            health_score INTEGER,
            temperature REAL,
            cpu_cores INTEGER,
            memory INTEGER,
            browser TEXT,
            os TEXT,
            network_status TEXT,
            security_status TEXT,
            scan_date DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS temperatures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            temperature REAL,
            status TEXT,
            risk_level TEXT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS speed_tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            download_speed REAL,
            upload_speed REAL,
            latency INTEGER,
            tested_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    const existing = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ?',
        args: ['admin@diagnostic.com']
    });

    if (existing.rows.length === 0) {
        const hashed = await bcrypt.hash('admin123', 10);
        await db.execute({
            sql: 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            args: ['Admin', 'admin@diagnostic.com', hashed]
        });
        console.log('Demo user created: admin@diagnostic.com / admin123');
    }
    console.log('Database ready');
}

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Server is running' }));

app.post('/api/users/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
        if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
        const hashed = await bcrypt.hash(password, 10);
        await db.execute({
            sql: 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            args: [name, email, hashed]
        });
        res.json({ message: 'Registration successful! Please login.' });
    } catch { res.status(400).json({ error: 'Email already exists' }); }
});

app.post('/api/users/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
        const result = await db.execute({
            sql: 'SELECT * FROM users WHERE email = ?',
            args: [email]
        });
        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ error: 'Invalid email or password' });
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/users/guest', (req, res) => {
    const token = jwt.sign({ id: 0, email: 'guest' }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: 0, name: 'Guest User', email: 'guest@diagnostic.com' } });
});

app.post('/api/users/logout', (req, res) => res.json({ message: 'Logged out' }));

app.post('/api/scans/save', authMiddleware, async (req, res) => {
    try {
        const { healthScore, temperature, cpuCores, memory, browser, os, networkStatus, securityStatus } = req.body;
        await db.execute({
            sql: `INSERT INTO scans (user_id, health_score, temperature, cpu_cores, memory, browser, os, network_status, security_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [req.user.id, healthScore, temperature, cpuCores, memory, browser, os, networkStatus, securityStatus]
        });
        res.json({ message: 'Scan saved' });
    } catch { res.status(500).json({ error: 'Failed to save scan' }); }
});

app.get('/api/scans/history', authMiddleware, async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM scans WHERE user_id = ? ORDER BY scan_date DESC LIMIT ?',
            args: [req.user.id, req.query.limit || 10]
        });
        res.json({ scans: result.rows });
    } catch { res.status(500).json({ error: 'Failed to load scans' }); }
});

app.get('/api/scans/stats', authMiddleware, async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT COUNT(*) as totalScans, AVG(health_score) as avgHealth FROM scans WHERE user_id = ?',
            args: [req.user.id]
        });
        res.json(result.rows[0]);
    } catch { res.status(500).json({ error: 'Failed to load stats' }); }
});

app.post('/api/temperature/record', authMiddleware, async (req, res) => {
    try {
        const { temperature, status, riskLevel } = req.body;
        await db.execute({
            sql: 'INSERT INTO temperatures (user_id, temperature, status, risk_level) VALUES (?, ?, ?, ?)',
            args: [req.user.id, temperature, status, riskLevel]
        });
        res.json({ message: 'Temperature recorded' });
    } catch { res.status(500).json({ error: 'Failed to record' }); }
});

app.post('/api/temperature/cooldown', authMiddleware, (req, res) => res.json({ message: 'Cooldown recorded' }));

app.post('/api/speedtests/save', authMiddleware, async (req, res) => {
    try {
        const { downloadSpeed, uploadSpeed, latency } = req.body;
        await db.execute({
            sql: 'INSERT INTO speed_tests (user_id, download_speed, upload_speed, latency) VALUES (?, ?, ?, ?)',
            args: [req.user.id, downloadSpeed, uploadSpeed, latency]
        });
        res.json({ message: 'Speed test saved' });
    } catch { res.status(500).json({ error: 'Failed to save' }); }
});

initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Open: http://localhost:${PORT}`);
    });
}).catch(err => console.error('DB init failed:', err));