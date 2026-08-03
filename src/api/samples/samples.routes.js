const express = require('express');
const router = express.Router();
const controller = require('./samples.controller');
const componentsController = require('../components/components.controller');
const { protect } = require('../../middleware/auth.middleware');

// GET /api/samples — was unprotected before, now requires login
router.get('/', protect, controller.getAllSamples);

// GET /api/samples/lookup?code=... — barcode scan resolver.
// MUST be registered before /:id so "lookup" isn't parsed as an id.
router.get('/lookup', protect, controller.lookupByCode);

// GET /api/samples/:id — full detail (Datasheet Detail page)
router.get('/:id', protect, controller.getSampleById);

// PATCH /api/samples/:id — edit datasheet-info fields
router.patch('/:id', protect, controller.updateSample);

// DELETE /api/samples/:id — delete a datasheet
router.delete('/:id', protect, controller.deleteSample);

// Components nested under a sample
router.get('/:sampleId/components', protect, componentsController.listBySample);
router.post('/:sampleId/components', protect, componentsController.create);

module.exports = router;
