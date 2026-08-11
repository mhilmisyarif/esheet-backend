// Nested under /api/reports/:reportId/clause-tables
const express = require('express');
const router = express.Router({ mergeParams: true }); // gets req.params.reportId
const controller = require('./clause-tables.controller');
const { protect, authorize } = require('../../middleware/auth.middleware');

const allowedRoles = authorize('TECHNICIAN', 'ENGINEER', 'ADMIN');

router.get('/', protect, allowedRoles, controller.getClauseTables);
router.post('/', protect, allowedRoles, controller.createClauseTable);

module.exports = router;
