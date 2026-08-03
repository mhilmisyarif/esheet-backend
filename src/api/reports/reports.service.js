const prisma = require('../../lib/prisma');

/**
 * Creates a draft report from a sample's test standard template.
 * Filters clauses if testingType is VERIFICATION.
 */
async function createReport({ sampleId, technicianId, testingType, selectedClauses }) {
    const sample = await prisma.sample.findUnique({
        where: { id: sampleId },
        include: { testStandard: true },
    });

    if (!sample) {
        const err = new Error('Sample not found.');
        err.statusCode = 404;
        throw err;
    }

    const fullTemplate = sample.testStandard.template_data;
    if (!Array.isArray(fullTemplate)) {
        const err = new Error(`Template standar "${sample.testStandard.name}" rusak (bukan array klausul).`);
        err.statusCode = 422;
        throw err;
    }
    let reportData;

    if (testingType === 'VERIFICATION') {
        if (!Array.isArray(selectedClauses) || selectedClauses.length === 0) {
            const err = new Error('`selectedClauses` array is required for Verification testing.');
            err.statusCode = 400;
            throw err;
        }
        reportData = fullTemplate.filter(k => selectedClauses.includes(k.klausul));
    } else {
        reportData = fullTemplate;
    }

    return prisma.report.create({
        data: {
            sampleId: sample.id,
            technicianId,
            status: 'DRAFT',
            testing_type: testingType === 'VERIFICATION' ? 'VERIFICATION' : 'FULL',
            data: reportData,
        },
    });
}

/**
 * Fetches a report by its own ID, including sample and order info.
 */
async function getReportById(id) {
    return prisma.report.findUnique({
        where: { id },
        include: {
            sample: { include: { order: true } },
        },
    });
}

/**
 * Fetches a report by the associated sample's ID.
 * Returns null (not an error) if no report exists yet for the sample.
 */
async function getReportBySampleId(sampleId) {
    return prisma.report.findUnique({
        where: { sampleId },
        include: {
            sample: { include: { order: true } },
            ReportImages: true,
        },
    });
}

const { diffReportData } = require('./report-diff');

/**
 * Updates the JSON data payload of a report.
 *
 * Allowed roles:
 *   - TECHNICIAN — only on their own report (fills butir keputusan & catatan)
 *   - ENGINEER   — on any report (reviews & corrects keputusan; the
 *                  frontend tags corrections with original_keputusan /
 *                  is_corrected / corrected_by inside the JSON, which
 *                  is preserved here so it shows up across the app and
 *                  in the generated datasheet & draft documents)
 *   - ADMIN      — on any report
 *
 * Rejected if the report is APPROVED (locked).
 *
 * Every keputusan / hasil_catatan change is diffed server-side and written
 * to DecisionHistory in the same transaction (append-only audit trail).
 */
async function updateReportData({ reportId, data, userId, userRole }) {
    const report = await prisma.report.findUnique({ where: { id: reportId } });

    if (!report) {
        const err = new Error('Report not found.');
        err.statusCode = 404;
        throw err;
    }

    if (report.status === 'APPROVED') {
        const err = new Error('Report is locked (Approved) and cannot be edited.');
        err.statusCode = 403;
        throw err;
    }

    const editableRoles = ['TECHNICIAN', 'ENGINEER', 'ADMIN'];
    if (!editableRoles.includes(userRole)) {
        const err = new Error('Forbidden: your role cannot edit reports.');
        err.statusCode = 403;
        throw err;
    }
    // Technicians may only edit reports they own; engineers/admins can edit any.
    if (userRole === 'TECHNICIAN' && report.technicianId !== userId) {
        const err = new Error('Forbidden: This is not your report.');
        err.statusCode = 403;
        throw err;
    }

    const changes = diffReportData(report.data, data);

    // Tanggal pengujian dimulai = the first time actual test values are
    // saved on this report (not report creation, which is just registration).
    const startTestClock =
        changes.length > 0 && !report.test_started_at
            ? { test_started_at: new Date() }
            : {};

    const ops = [
        prisma.report.update({
            where: { id: reportId },
            data: { data, ...startTestClock },
        }),
    ];
    if (changes.length > 0) {
        ops.push(
            prisma.decisionHistory.createMany({
                data: changes.map((c) => ({ ...c, reportId, actorId: userId })),
            }),
        );
    }
    const [updated] = await prisma.$transaction(ops);
    return updated;
}

/**
 * Fetches the decision-change audit trail for a report, newest first.
 * Optionally filtered to one klausul.
 */
async function getDecisionHistory({ reportId, klausulCode }) {
    return prisma.decisionHistory.findMany({
        where: {
            reportId,
            ...(klausulCode ? { klausulCode } : {}),
        },
        include: {
            actor: { select: { id: true, name: true, role: true } },
        },
        orderBy: { timestamp: 'desc' },
    });
}

/**
 * Submits a report for engineer review.
 * REJECTED → REVISED, DRAFT → SUBMITTED.
 */
async function submitReport({ reportId, userId, isReportComplete }) {
    const report = await prisma.report.findUnique({ where: { id: reportId } });

    if (!report) {
        const err = new Error('Report not found.');
        err.statusCode = 404;
        throw err;
    }

    // Ownership check
    if (report.technicianId !== userId) {
        const err = new Error('Forbidden: This is not your report.');
        err.statusCode = 403;
        throw err;
    }

    if (!isReportComplete(report.data)) {
        const err = new Error('Report is incomplete. Please fill all required fields.');
        err.statusCode = 400;
        throw err;
    }

    let newStatus = 'SUBMITTED';
    let action = 'SUBMITTED';

    if (report.status === 'REJECTED') {
        newStatus = 'REVISED';
        action = 'RESUBMITTED_AS_REVISED';
    } else if (report.status === 'SUBMITTED' || report.status === 'REVISED') {
        newStatus = report.status;
        action = 'UPDATED_SUBMISSION';
    }

    const updated = await prisma.report.update({
        where: { id: reportId },
        data: { status: newStatus, submitted_at: new Date() },
    });

    await prisma.reportHistory.create({
        data: { reportId, actorId: userId, action },
    });

    return updated;
}

/**
 * Approves a report. Only valid from SUBMITTED or REVISED state.
 */
async function approveReport({ reportId, engineerId }) {
    const report = await prisma.report.findUnique({ where: { id: reportId } });

    if (!report) {
        const err = new Error('Report not found.');
        err.statusCode = 404;
        throw err;
    }

    if (!['SUBMITTED', 'REVISED'].includes(report.status)) {
        const err = new Error('Report is not in a reviewable state.');
        err.statusCode = 400;
        throw err;
    }

    const updated = await prisma.report.update({
        where: { id: reportId },
        data: { status: 'APPROVED', approved_at: new Date(), engineerId },
    });

    await prisma.reportHistory.create({
        data: { reportId, actorId: engineerId, action: 'APPROVED' },
    });

    return updated;
}

/**
 * Rejects a report. Requires a written reason.
 */
async function rejectReport({ reportId, engineerId, reason }) {
    if (!reason || !reason.trim()) {
        const err = new Error('Rejection reason is required.');
        err.statusCode = 400;
        throw err;
    }

    const report = await prisma.report.findUnique({ where: { id: reportId } });

    if (!report) {
        const err = new Error('Report not found.');
        err.statusCode = 404;
        throw err;
    }

    if (!['SUBMITTED', 'REVISED'].includes(report.status)) {
        const err = new Error('Report is not in a reviewable state.');
        err.statusCode = 400;
        throw err;
    }

    const updated = await prisma.report.update({
        where: { id: reportId },
        data: { status: 'REJECTED', rejection_reason: reason, engineerId },
    });

    await prisma.reportHistory.create({
        data: { reportId, actorId: engineerId, action: 'REJECTED', comment: reason },
    });

    return updated;
}

/**
 * Fetches a fully-populated report for DOCX generation.
 */
async function getReportForDownload(id) {
    return prisma.report.findUnique({
        where: { id },
        include: {
            sample: { include: { order: true, testStandard: true } },
            ReportImages: true,
            technician: { select: { id: true, name: true } },
            engineer: { select: { id: true, name: true } },
        },
    });
}

module.exports = {
    createReport,
    getReportById,
    getReportBySampleId,
    updateReportData,
    getDecisionHistory,
    submitReport,
    approveReport,
    rejectReport,
    getReportForDownload,
};