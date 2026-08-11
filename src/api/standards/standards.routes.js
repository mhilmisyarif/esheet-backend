const express = require('express');
const router = express.Router();
const controller = require('./standards.controller');
const { protect, authorize } = require('../../middleware/auth.middleware');
const tableTemplatesNestedRouter = require('../table-templates/table-templates-nested.routes');

// Nested: /api/standards/:standardId/table-templates
router.use('/:standardId/table-templates', tableTemplatesNestedRouter);

router.post('/', protect, authorize('ENGINEER', 'ADMIN'), controller.createStandard);
router.put('/:id', protect, authorize('ENGINEER', 'ADMIN'), controller.updateStandard);
router.delete('/:id', protect, authorize('ENGINEER', 'ADMIN'), controller.deleteStandard);
router.get('/:id', protect, controller.getStandard);

module.exports = router;
