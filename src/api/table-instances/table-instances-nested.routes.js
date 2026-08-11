const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('./table-instances.controller');
const { protect, authorize } = require('../../middleware/auth.middleware');

const allowedRoles = authorize('TECHNICIAN', 'ENGINEER', 'ADMIN');

router.get('/', protect, allowedRoles, controller.getInstances);
router.post('/autoprovision', protect, allowedRoles, controller.autoprovision);
router.post('/', protect, allowedRoles, controller.createInstance);

module.exports = router;
