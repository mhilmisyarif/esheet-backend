const express = require('express');
const router = express.Router();
const controller = require('./reports.controller');
const { protect, authorize } = require('../../middleware/auth.middleware');

// Nested routers
const clauseTablesNestedRouter = require('../clause-tables/clause-tables-nested.routes');
const tableInstancesNestedRouter = require('../table-instances/table-instances-nested.routes');
const tableTemplatesReportRouter = require('../table-templates/table-templates-report.routes');

router.use('/:reportId/clause-tables', clauseTablesNestedRouter);
router.use('/:reportId/table-instances', tableInstancesNestedRouter);
router.use('/:reportId/table-templates', tableTemplatesReportRouter);

// ── Technician routes ─────────────────────────────────────────────────────────
router.post('/',
    protect, authorize('TECHNICIAN', 'ADMIN'),
    controller.createReport);

router.patch('/:reportId/data',
    protect, authorize('TECHNICIAN', 'ADMIN'),
    controller.updateReportData);

// NEW: Technician submits specific klausuls (partial or full)
router.post('/:reportId/submit-klausuls',
    protect, authorize('TECHNICIAN', 'ADMIN'),
    controller.submitKlausuls);

// ── Engineer routes ───────────────────────────────────────────────────────────
// NEW: Engineer approves klausuls (with optional inline corrections)
router.post('/:reportId/approve-klausuls',
    protect, authorize('ENGINEER', 'ADMIN'),
    controller.approveKlausuls);

// ── Drafter routes ────────────────────────────────────────────────────────────
// Drafter fills document metadata before downloading Draft
router.patch('/:reportId/doc-metadata',
    protect, authorize('DRAFTER', 'ENGINEER', 'ADMIN'),
    controller.updateDocMetadata);

// ── Shared read routes ────────────────────────────────────────────────────────
router.get('/by-sample/:sampleId', protect, controller.getReportBySampleId);
router.get('/:reportId', protect, controller.getReport);
router.get('/:reportId/klausul-statuses', protect, controller.getKlausulStatuses);

// ── Downloads — role-gated ────────────────────────────────────────────────────
// Draft → Engineer + Drafter (any stage, does not require full approval)
router.get('/:reportId/download/draft',
    protect, authorize('ENGINEER', 'DRAFTER', 'ADMIN'),
    controller.downloadDraft);

// Datasheet → Technician only (requires at least one approved klausul)
router.get('/:reportId/download/datasheet',
    protect, authorize('TECHNICIAN', 'ADMIN'),
    controller.downloadDatasheet);

// NOTE: Old routes removed:
//   POST /:id/submit    → replaced by POST /:reportId/submit-klausuls
//   POST /:id/approve   → replaced by POST /:reportId/approve-klausuls
//   POST /:id/reject    → REMOVED (no rejection flow)
//   GET  /:id/download  → split into /download/draft and /download/datasheet

module.exports = router;
