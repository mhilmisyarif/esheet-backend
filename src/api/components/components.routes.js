const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const controller = require('./components.controller');

// DELETE /api/components/:id
router.delete('/:id', protect, controller.remove);

module.exports = router;
