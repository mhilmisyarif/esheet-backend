const express = require('express');
const router = express.Router();
const controller = require('../samples/samples.controller');
const { protect } = require('../../middleware/auth.middleware');

// GET /api/samples — was unprotected before, now requires login
router.get('/', protect, controller.getAllSamples);

module.exports = router;