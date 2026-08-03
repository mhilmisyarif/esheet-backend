const express = require('express');
const router = express.Router();
const controller = require('./notifications.controller');
const { protect } = require('../../middleware/auth.middleware');

router.get('/', protect, controller.list);
router.patch('/read', protect, controller.markRead);

module.exports = router;
