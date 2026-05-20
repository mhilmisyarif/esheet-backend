const express = require('express');
const router = express.Router();
const controller = require('./table-templates.controller');
const { protect, authorize } = require('../../middleware/auth.middleware');

const engineerOnly = authorize('ENGINEER', 'ADMIN');

// Standalone routes (used for update/delete by templateId)
// /api/table-templates/:id
router.get('/:id', protect, controller.getTemplate);
router.put('/:id', protect, engineerOnly, controller.updateTemplate);
router.delete('/:id', protect, engineerOnly, controller.deleteTemplate);

module.exports = router;
