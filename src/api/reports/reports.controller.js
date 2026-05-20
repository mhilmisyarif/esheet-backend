const service = require('./reports.service');
const klausulService = require('./klausul-status.service');
const { isKlausulComplete } = require('../../services/report.validator');
const { generateDraftDocx } = require('../../services/draft.generator');
const { generateDatasheetPdf } = require('../../services/datasheet.generator');

// ── Standard report CRUD (unchanged) ─────────────────────────────────────────

exports.createReport = async (req, res, next) => {
    const { sampleId, testingType, selectedClauses } = req.body;
    if (!sampleId || !testingType)
        return res.status(400).json({ error: 'sampleId and testingType are required.' });
    try {
        const report = await service.createReport({
            sampleId: parseInt(sampleId, 10),
            technicianId: req.user.id,
            testingType,
            selectedClauses,
        });
        res.status(201).json(report);
    } catch (e) { next(e); }
};

exports.getReport = async (req, res, next) => {
    try {
        const report = await service.getReportById(parseInt(req.params.reportId, 10));
        if (!report) return res.status(404).json({ error: 'Report not found.' });

        // Attach klausul statuses to the response
        const klausulStatuses = await klausulService.getKlausulStatuses(report.id);
        res.json({ ...report, klausulStatuses });
    } catch (e) { next(e); }
};

exports.getReportBySampleId = async (req, res, next) => {
    try {
        const report = await service.getReportBySampleId(parseInt(req.params.sampleId, 10));
        if (!report) return res.status(404).json({ error: 'Report not found for this sample.' });

        const klausulStatuses = await klausulService.getKlausulStatuses(report.id);
        res.json({ ...report, klausulStatuses });
    } catch (e) { next(e); }
};

exports.updateReportData = async (req, res, next) => {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'data field is required.' });
    try {
        await service.updateReportData({
            reportId: parseInt(req.params.reportId, 10),
            data,
            userId: req.user.id,
            userRole: req.user.role,
        });
        res.json({ message: 'Saved.' });
    } catch (e) { next(e); }
};

// ── NEW: Per-klausul submit ───────────────────────────────────────────────────

/**
 * POST /api/reports/:reportId/submit-klausuls
 * Body: { klausulCodes: ["6", "7"] }
 *
 * Technician submits one or more klausuls for engineer review.
 * Other klausuls remain as DRAFT and stay editable.
 */
exports.submitKlausuls = async (req, res, next) => {
    const { klausulCodes } = req.body;

    if (!Array.isArray(klausulCodes) || klausulCodes.length === 0) {
        return res.status(400).json({ error: 'klausulCodes must be a non-empty array.' });
    }

    const reportId = parseInt(req.params.reportId, 10);

    // Validate each klausul is complete before allowing submission
    try {
        const report = await service.getReportById(reportId);
        if (!report) return res.status(404).json({ error: 'Report not found.' });

        const incompleteKlausuls = klausulCodes.filter(code => {
            const klausul = (report.data || []).find(k => k.klausul === code);
            return klausul && !isKlausulComplete(klausul);
        });

        if (incompleteKlausuls.length > 0) {
            return res.status(400).json({
                error: `These klausuls have unfilled items: ${incompleteKlausuls.join(', ')}. Fill all test items before submitting.`,
                incompleteKlausuls,
            });
        }

        const statuses = await klausulService.submitKlausuls({
            reportId,
            klausulCodes,
            userId: req.user.id,
            userRole: req.user.role,
        });
        res.json({ message: 'Klausuls submitted successfully.', klausulStatuses: statuses });
    } catch (e) { next(e); }
};

// ── NEW: Per-klausul approve (with optional inline corrections) ───────────────

/**
 * POST /api/reports/:reportId/approve-klausuls
 * Body: {
 *   klausuls: [
 *     { klausulCode: "6", corrections: "Changed 6.1.a from TB to L", updatedData: { ...klausulObject } },
 *     { klausulCode: "7" }
 *   ]
 * }
 *
 * Engineer approves one or more submitted klausuls.
 * If updatedData is provided, the clause data is updated in report.data before approving.
 * If all klausuls are now approved, the report is locked (status = APPROVED).
 */
exports.approveKlausuls = async (req, res, next) => {
    const { klausuls } = req.body;

    if (!Array.isArray(klausuls) || klausuls.length === 0) {
        return res.status(400).json({ error: 'klausuls must be a non-empty array.' });
    }

    try {
        const statuses = await klausulService.approveKlausuls({
            reportId: parseInt(req.params.reportId, 10),
            klausuls,
            engineerId: req.user.id,
        });
        res.json({ message: 'Klausuls approved.', klausulStatuses: statuses });
    } catch (e) { next(e); }
};

// ── NEW: Get klausul statuses ────────────────────────────────────────────────

/**
 * GET /api/reports/:reportId/klausul-statuses
 * Returns { klausulCode: KlausulStatus } map for the report.
 */
exports.getKlausulStatuses = async (req, res, next) => {
    try {
        const statuses = await klausulService.getKlausulStatuses(
            parseInt(req.params.reportId, 10)
        );
        res.json(statuses);
    } catch (e) { next(e); }
};

// ── NEW: Update document metadata (Drafter) ──────────────────────────────────

/**
 * PATCH /api/reports/:reportId/doc-metadata
 * Body: { applicant, address, standard, location, notes }
 *
 * Drafter fills in document metadata before downloading the Draft.
 */
exports.updateDocMetadata = async (req, res, next) => {
    try {
        const updated = await klausulService.updateDocMetadata({
            reportId: parseInt(req.params.reportId, 10),
            metadata: req.body,
            userId: req.user.id,
            userRole: req.user.role,
        });
        res.json(updated);
    } catch (e) { next(e); }
};

// ── DOWNLOADS — two separate documents ──────────────────────────────────────

/**
 * GET /api/reports/:reportId/download/draft
 * Accessible by: ENGINEER, DRAFTER
 * Returns the Draft document (current Word format).
 * Does NOT require full approval — can be downloaded at any stage.
 */
exports.downloadDraft = async (req, res, next) => {
    try {
        const report = await service.getReportForDownload(parseInt(req.params.reportId, 10));
        if (!report) return res.status(404).json({ error: 'Report not found.' });

        const klausulStatuses = await klausulService.getKlausulStatuses(report.id);
        const buffer = await generateDraftDocx(report, klausulStatuses);

        res.setHeader('Content-Disposition',
            `attachment; filename="DRAFT-${report.sample.model}-${report.id}.docx"`);
        res.setHeader('Content-Type',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);
    } catch (e) { next(e); }
};

/**
 * GET /api/reports/:reportId/download/datasheet
 * Accessible by: TECHNICIAN only
 * Returns the Datasheet document — includes per-klausul barcodes and tester info.
 * Only approved klausuls are included.
 */
exports.downloadDatasheet = async (req, res, next) => {
    try {
        const report = await service.getReportForDownload(parseInt(req.params.reportId, 10));
        if (!report) return res.status(404).json({ error: 'Report not found.' });

        const klausulStatuses = await klausulService.getKlausulStatuses(report.id);

        // Must have at least one approved klausul
        const hasApproved = Object.values(klausulStatuses).some(s => s.status === 'APPROVED');
        if (!hasApproved) {
            return res.status(400).json({
                error: 'At least one klausul must be approved before downloading the datasheet.',
            });
        }

        const { buffer, password } = await generateDatasheetPdf(report, klausulStatuses);

        const filename = `DATASHEET-${report.sample.model}-${report.id}.pdf`;

        // Return password in response header so the frontend can show it to the user
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('X-Datasheet-Password', password);
        // Expose the custom header to the browser (CORS)
        res.setHeader('Access-Control-Expose-Headers', 'X-Datasheet-Password');

        res.send(buffer);
    } catch (e) {
        next(e);
    }
};
