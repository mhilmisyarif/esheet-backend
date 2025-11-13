const express = require('express');
const router = express.Router();
const controller = require('./reports.controller');
const { protect, authorize } = require('../../middleware/auth.middleware'); // <-- IMPORT authorize

// --- Technician routes ---
router.post('/', protect, authorize('TECHNICIAN'), controller.createReport);
router.patch('/:id/data', protect, authorize('TECHNICIAN'), controller.updateReportData);
router.post('/:id/submit', protect, authorize('TECHNICIAN'), controller.submitReport);

// --- Engineer/Shared routes ---
router.get('/:id', protect, controller.getReport); // Anyone logged in can read a report

// --- Engineer-only routes ---
router.post(
    '/:id/approve',
    protect,
    authorize('ENGINEER', 'ADMIN'), // <-- Only Engineers or Admins
    controller.approveReport
);
router.post(
    '/:id/reject',
    protect,
    authorize('ENGINEER', 'ADMIN'), // <-- Only Engineers or Admins
    controller.rejectReport
);

router.get(
    '/:id/download',
    protect, // Anyone logged in can download
    controller.downloadReport
);

module.exports = router;