// Nested under /api/standards/:standardId/table-templates
// mergeParams: true so req.params.standardId is available
const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('./table-templates.controller');
const { protect, authorize } = require('../../middleware/auth.middleware');

router.get('/', protect, controller.getTemplates);
router.post('/', protect, authorize('ENGINEER', 'ADMIN'), controller.createTemplate);

module.exports = router;
