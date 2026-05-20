const express = require('express');
const router = express.Router();
const controller = require('./clause-tables.controller');
const { protect, authorize } = require('../../middleware/auth.middleware');

const allowedRoles = authorize('TECHNICIAN', 'ENGINEER', 'ADMIN');

// /api/clause-tables/:tableId
router.put('/:tableId', protect, allowedRoles, controller.updateClauseTable);
router.delete('/:tableId', protect, allowedRoles, controller.deleteClauseTable);

module.exports = router;