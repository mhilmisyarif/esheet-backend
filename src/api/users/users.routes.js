const express = require('express');
const router = express.Router();
const controller = require('./users.controller');
const { protect, authorize } = require('../../middleware/auth.middleware');
const { validate, v } = require('../../middleware/validation.middleware');

// User management is ADMIN-only. Account creation itself lives at
// POST /api/auth/register (also ADMIN-only).
router.get('/', protect, authorize('ADMIN'), controller.listUsers);

router.patch('/:id/role',
    protect, authorize('ADMIN'),
    validate({ role: v.string({ required: true, enum: ['TECHNICIAN', 'ENGINEER', 'DRAFTER', 'ADMIN'] }) }),
    controller.updateUserRole);

module.exports = router;
