const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import your main router
const mainRouter = require('./api/routes'); // We'll create this next
const path = require('path');

const app = express();

// --- Middleware ---
// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());
// Parse incoming JSON requests
app.use(express.json());

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// --- Main API Route ---
// All your routes will be prefixed with /api
app.use('/api', mainRouter);

// --- Health Check Route ---
// A simple route to check if the server is up
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP' });
});



module.exports = app;