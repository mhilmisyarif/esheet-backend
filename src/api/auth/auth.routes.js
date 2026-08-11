const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const { protect, authorize } = require('../../middleware/auth.middleware');
const { validate, v } = require('../../middleware/validation.middleware');
const { rateLimit } = require('../../middleware/rateLimit.middleware');

// Brute-force guard: 10 login attempts per IP per 15 minutes
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// Registration is ADMIN-only — this is an internal lab system, not a public
// signup. The admin chooses the new user's role (validated in the service).
router.post('/register',
    protect, authorize('ADMIN'),
    validate({
        email: v.email({ required: true }),
        password: v.string({ required: true, min: 8, max: 128 }),
        name: v.string({ required: true, max: 150 }),
        role: v.string({ enum: ['TECHNICIAN', 'ENGINEER', 'DRAFTER', 'ADMIN'] }),
    }),
    controller.register);

router.post('/login',
    loginLimiter,
    validate({
        email: v.email({ required: true }),
        password: v.string({ required: true, max: 128 }),
    }),
    controller.login);

// Protected — verifies the current session token and returns fresh user data
router.get('/me', protect, controller.getMe);

module.exports = router;
