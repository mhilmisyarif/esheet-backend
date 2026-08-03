const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRouter = require('./api/routes');
const errorHandler = require('./middleware/errorHandler');


const app = express();

// --- Core middleware ---
// CORS — when CORS_ORIGINS is set (comma-separated), only those frontend
// origins are allowed; when it is unset (development) all origins are allowed.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        // No Origin header (curl / server-to-server) or no allowlist → allow.
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
}));

// Security headers ("helmet-lite" — dependency-free; can be swapped for
// helmet() any time, its behaviour is a superset of these headers).
app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.removeHeader('X-Powered-By');
    next();
});

// JSON body cap — klausul trees are large but bounded in practice
app.use(express.json({ limit: '5mb' }));

// --- Serve uploaded images statically ---
// Files in /uploads are accessible at http://localhost:5000/uploads/<filename>
// Security headers: nosniff stops MIME-type guessing; the CSP blocks any
// script/style execution if a non-image file ever ends up in the folder.
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
    setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
    },
}));

// --- API routes ---
app.use('/api', apiRouter);

// --- Health check ---
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// --- Centralised error handler — MUST be registered last ---
app.use(errorHandler);

module.exports = app;