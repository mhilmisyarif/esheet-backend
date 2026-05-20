const express = require('express');
const router = express.Router();
const controller = require('./table-instances.controller');
const { protect, authorize } = require('../../middleware/auth.middleware');

const allowedRoles = authorize('TECHNICIAN', 'ENGINEER', 'ADMIN');

router.put('/:id', protect, allowedRoles, controller.saveInstance);
router.delete('/:id', protect, allowedRoles, controller.deleteInstance);

module.exports = router;
