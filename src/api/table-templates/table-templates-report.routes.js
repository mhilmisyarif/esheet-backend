// Nested under /api/reports/:reportId/table-templates
// Returns all templates for the report's TestStandard, grouped by subClauseCode
const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('../table-templates/table-templates.controller');
const { protect } = require('../../middleware/auth.middleware');

router.get('/', protect, controller.getTemplatesForReport);

module.exports = router;
