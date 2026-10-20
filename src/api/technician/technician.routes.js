const express = require('express');
const router = express.Router();
const controller = require('./technician.controller');
// const { protect } = require('../../middleware/auth.middleware');

// Protect all technician routes with JWT authentication

router.get('/', controller.getTechnicians);
router.get('/:id', controller.getTechnicianById);
router.post('/', controller.createTechnician);
router.put('/:id', controller.updateTechnician);
router.delete('/:id', controller.deleteTechnician);

module.exports = router;