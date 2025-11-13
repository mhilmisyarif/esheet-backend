const express = require('express');
const router = express.Router();
const controller = require('./samples.controller');

// GET /api/samples
router.get('/', controller.getAllSamples);

module.exports = router;