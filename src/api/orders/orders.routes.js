const express = require('express');
const router = express.Router();
const controller = require('./orders.controller');
const { protect } = require('../../middleware/auth.middleware');

router.post('/', protect, controller.createOrder);
router.get('/:id', protect, controller.getOrder);

module.exports = router;