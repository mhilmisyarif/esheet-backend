const express = require('express');
const router = express.Router();
const controller = require('./workflow.controller');
const { protect } = require('../../middleware/auth.middleware'); // <-- IMPORT

// POST /api/workflow/create-report
// Add the 'protect' middleware. This route now requires a valid token.
router.post('/create-report', protect, controller.createFullReportWorkflow);

module.exports = router;