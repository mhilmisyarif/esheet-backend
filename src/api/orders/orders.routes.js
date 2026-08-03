const express = require('express');
const router = express.Router();
const controller = require('./orders.controller');
const { protect } = require('../../middleware/auth.middleware');
const { validate, v } = require('../../middleware/validation.middleware');

router.post('/', protect, validate({
    order_no: v.string({ required: true, max: 100 }),
    applicant: v.string({ max: 300 }),
    address: v.string({ max: 500 }),
}), controller.createOrder);
router.get('/:id', protect, controller.getOrder);

module.exports = router;