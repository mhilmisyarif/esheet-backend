const express = require('express');
const router = express.Router();
const controller = require('./orders.controller');

router.post('/', controller.createOrder);
router.get('/:id', controller.getOrder);

module.exports = router;