const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const { protect } = require('../../middleware/auth.middleware');

router.post('/register', controller.register);
router.post('/login', controller.login);

// Protected — verifies the current session token and returns fresh user data
router.get('/me', protect, controller.getMe);

module.exports = router;