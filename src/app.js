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
app.use(express.json());

// --- Serve uploaded images statically ---
// Files in /uploads are accessible at http://localhost:5000/uploads/<filename>
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// --- API routes ---
app.use('/api', apiRouter);

// --- Health check ---
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// --- Centralised error handler — MUST be registered last ---
app.use(errorHandler);

module.exports = app;