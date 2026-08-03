const prisma = require('../../lib/prisma');
const { notifyUsers, getEngineerIds } = require('../notifications/notifications.service');

/**
 * Get all KlausulStatus rows for a report.
 * Returns a map: { klausulCode: KlausulStatus }
 */
async function getKlausulStatuses(reportId) {
    const rows = await prisma.klausulStatus.findMany({
        where: { reportId },
        include: {
            submittedBy: { select: { id: true, name: true } },
            approvedBy:  { select: { id: true, name: true } },
        },
    });
    return rows.reduce((acc, row) => {
        acc[row.klausulCode] = row;
        return acc;
    }, {});
}

/**
 * Submit one or more klausuls.
 * Creates or updates KlausulStatus rows to SUBMITTED.
 * Also updates the report-level status to IN_PROGRESS.
 *
 * @param {number}   reportId
 * @param {string[]} klausulCodes  - e.g. ["6", "7"] or ["5", "6", "7", "8"]
 * @param {number}   userId        - the technician submitting
 */
async function submitKlausuls({ reportId, klausulCodes, userId, userRole }) {
    const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: { KlausulStatuses: true },
    });

    if (!report) {
        const err = new Error('Report not found.');
        err.statusCode = 404;
        throw err;
    }

    if (userRole === 'TECHNICIAN' && report.technicianId !== userId) {
        const err = new Error('Forbidden: This is not your report.');
        err.statusCode = 403;
        throw err;
    }

    // Validate: klausuls being submitted must exist in report.data
    const validCodes = new Set(
        (report.data || []).map(k => k.klausul)
    );
    const invalid = klausulCodes.filter(c => !validCodes.has(c));
    if (invalid.length > 0) {
        const err = new Error(`Klausul codes not found in this report: ${invalid.join(', ')}`);
        err.statusCode = 400;
        throw err;
    }

    // Cannot re-submit already-approved klausuls
    const alreadyApproved = (report.KlausulStatuses || [])
        .filter(s => klausulCodes.includes(s.klausulCode) && s.status === 'APPROVED')
        .map(s => s.klausulCode);

    if (alreadyApproved.length > 0) {
        const err = new Error(`Cannot re-submit approved klausuls: ${alreadyApproved.join(', ')}`);
        err.statusCode = 400;
        throw err;
    }

    const now = new Date();

    // Upsert each klausul status
    await Promise.all(klausulCodes.map(code =>
        prisma.klausulStatus.upsert({
            where: { reportId_klausulCode: { reportId, klausulCode: code } },
            create: {
                reportId,
                klausulCode: code,
                status: 'SUBMITTED',
                submittedById: userId,
                submittedAt: now,
            },
            update: {
                status: 'SUBMITTED',
                submittedById: userId,
                submittedAt: now,
            },
        })
    ));

    // Log history
    await prisma.reportHistory.create({
        data: {
            reportId,
            actorId: userId,
            action: 'KLAUSUL_SUBMITTED',
            comment: `Submitted klausuls: ${klausulCodes.join(', ')}`,
        },
    });

    // Notify engineers there is work to review (fire-and-forget — a
    // notification failure must never fail the submit itself).
    (async () => {
        const [engineerIds, reportInfo, submitter] = await Promise.all([
            getEngineerIds(),
            prisma.report.findUnique({
                where: { id: reportId },
                select: {
                    sampleId: true,
                    sample: { select: { name: true, brand: true, model: true } },
                },
            }),
            prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
        ]);
        const s = reportInfo?.sample;
        await notifyUsers(engineerIds, {
            type: 'KLAUSUL_SUBMITTED',
            title: `${submitter?.name || 'Teknisi'} submit klausul ${klausulCodes.join(', ')}`,
            body: s ? `${s.name} — ${s.brand} ${s.model}` : null,
            // ReportEditor route param is the SAMPLE id
            link: `/reports/${reportInfo?.sampleId ?? reportId}`,
        });
    })().catch((e) => console.error('notify submit failed:', e.message));

    // Tanggal pengujian selesai = the moment the LAST klausul is submitted
    // (every klausul is now SUBMITTED or APPROVED). Set once; a later
    // re-submission after rejection does not move the finish date back.
    if (!report.test_finished_at) {
        const statusByCode = {};
        (report.KlausulStatuses || []).forEach(s => { statusByCode[s.klausulCode] = s.status; });
        klausulCodes.forEach(c => { statusByCode[c] = 'SUBMITTED'; });
        const allDone = [...validCodes].every(c =>
            statusByCode[c] === 'SUBMITTED' || statusByCode[c] === 'APPROVED'
        );
        if (allDone) {
            await prisma.report.update({
                where: { id: reportId },
                data: { test_finished_at: now },
            });
        }
    }

    // Update report-level status
    await updateReportStatus(reportId);

    return getKlausulStatuses(reportId);
}

/**
 * Engineer approves one or more klausuls — with optional inline corrections.
 * Saves correction notes and marks as APPROVED.
 * If all klausuls in the report are now APPROVED, locks the report.
 *
 * @param {number}   reportId
 * @param {Array}    klausuls      - [{ klausulCode, corrections?, updatedData? }]
 *                                  updatedData = the full klausul object with engineer edits
 * @param {number}   engineerId
 */
async function approveKlausuls({ reportId, klausuls, engineerId }) {
    const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: { KlausulStatuses: true },
    });

    if (!report) {
        const err = new Error('Report not found.');
        err.statusCode = 404;
        throw err;
    }

    const klausulCodes = klausuls.map(k => k.klausulCode);

    // Only SUBMITTED klausuls can be approved
    const statusMap = {};
    (report.KlausulStatuses || []).forEach(s => { statusMap[s.klausulCode] = s.status; });

    const notSubmitted = klausulCodes.filter(c => statusMap[c] !== 'SUBMITTED');
    if (notSubmitted.length > 0) {
        const err = new Error(
            `These klausuls are not in SUBMITTED state: ${notSubmitted.join(', ')}. ` +
            `Only SUBMITTED klausuls can be approved.`
        );
        err.statusCode = 400;
        throw err;
    }

    const now = new Date();

    // If engineer made inline corrections, update the report.data JSON
    // updatedData is the full klausul object (with corrected butir values)
    const hasDataUpdates = klausuls.some(k => k.updatedData);
    if (hasDataUpdates) {
        const reportData = JSON.parse(JSON.stringify(report.data || []));
        klausuls.forEach(({ klausulCode, updatedData }) => {
            if (!updatedData) return;
            const idx = reportData.findIndex(k => k.klausul === klausulCode);
            if (idx !== -1) {
                reportData[idx] = updatedData;
            }
        });
        await prisma.report.update({
            where: { id: reportId },
            data: { data: reportData, engineerId },
        });
    } else {
        // Still record the engineer
        await prisma.report.update({
            where: { id: reportId },
            data: { engineerId },
        });
    }

    // Approve each klausul status
    await Promise.all(klausuls.map(({ klausulCode, corrections }) =>
        prisma.klausulStatus.upsert({
            where: { reportId_klausulCode: { reportId, klausulCode } },
            create: {
                reportId,
                klausulCode,
                status: 'APPROVED',
                approvedById: engineerId,
                approvedAt: now,
                corrections: corrections || null,
            },
            update: {
                status: 'APPROVED',
                approvedById: engineerId,
                approvedAt: now,
                corrections: corrections || null,
            },
        })
    ));

    // Log history
    const correctionNotes = klausuls
        .filter(k => k.corrections)
        .map(k => `${k.klausulCode}: ${k.corrections}`)
        .join(' | ');

    await prisma.reportHistory.create({
        data: {
            reportId,
            actorId: engineerId,
            action: 'KLAUSUL_APPROVED',
            comment: correctionNotes
                ? `Approved with corrections — ${correctionNotes}`
                : `Approved klausuls: ${klausulCodes.join(', ')}`,
        },
    });

    // Notify the technician who owns this report (fire-and-forget)
    (async () => {
        const [reportInfo, engineer] = await Promise.all([
            prisma.report.findUnique({
                where: { id: reportId },
                select: {
                    technicianId: true,
                    sampleId: true,
                    sample: { select: { name: true, brand: true, model: true } },
                },
            }),
            prisma.user.findUnique({ where: { id: engineerId }, select: { name: true } }),
        ]);
        if (!reportInfo?.technicianId) return;
        const s = reportInfo.sample;
        const hasCorrections = klausuls.some(k => k.corrections || k.updatedData);
        await notifyUsers([reportInfo.technicianId], {
            type: hasCorrections ? 'KLAUSUL_CORRECTED' : 'KLAUSUL_APPROVED',
            title: `${engineer?.name || 'Engineer'} ${hasCorrections ? 'menyetujui dengan koreksi' : 'menyetujui'} klausul ${klausulCodes.join(', ')}`,
            body: s ? `${s.name} — ${s.brand} ${s.model}` : null,
            link: `/reports/${reportInfo.sampleId}`,
        });
    })().catch((e) => console.error('notify approve failed:', e.message));

    // Update report-level status (may lock the report if all approved)
    await updateReportStatus(reportId);

    return getKlausulStatuses(reportId);
}

/**
 * Recomputes and updates the report-level status based on all KlausulStatus rows.
 *
 * Rules:
 * - All klausuls APPROVED                 → report status = APPROVED (locked)
 * - At least one SUBMITTED, rest DRAFT    → report status = IN_PROGRESS
 * - All DRAFT (or no statuses yet)        → report status = DRAFT
 */
async function updateReportStatus(reportId) {
    const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: { KlausulStatuses: true },
    });
    if (!report) return;

    const statuses = report.KlausulStatuses || [];
    const totalKlausuls = (report.data || []).length;

    if (statuses.length === 0) {
        // Nothing submitted yet
        await prisma.report.update({
            where: { id: reportId },
            data: { status: 'DRAFT' },
        });
        return;
    }

    const approvedCount = statuses.filter(s => s.status === 'APPROVED').length;
    const allApproved = approvedCount === totalKlausuls && totalKlausuls > 0;

    if (allApproved) {
        await prisma.report.update({
            where: { id: reportId },
            data: { status: 'APPROVED', approved_at: new Date() },
        });
    } else {
        // At least one submitted or approved — work is in progress
        const anyActive = statuses.some(s =>
            s.status === 'SUBMITTED' || s.status === 'APPROVED'
        );
        await prisma.report.update({
            where: { id: reportId },
            data: { status: anyActive ? 'IN_PROGRESS' : 'DRAFT' },
        });
    }
}

/**
 * Update document metadata fields on the report.
 * Called by Drafter before downloading the Draft document.
 */
async function updateDocMetadata({ reportId, metadata, userId, userRole }) {
    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) {
        const err = new Error('Report not found.');
        err.statusCode = 404;
        throw err;
    }

    // Only DRAFTER, ENGINEER, ADMIN can update doc metadata
    if (!['DRAFTER', 'ENGINEER', 'ADMIN'].includes(userRole)) {
        const err = new Error('Forbidden.');
        err.statusCode = 403;
        throw err;
    }

    return prisma.report.update({
        where: { id: reportId },
        data: {
            doc_applicant: metadata.applicant ?? report.doc_applicant,
            doc_address:   metadata.address   ?? report.doc_address,
            doc_standard:  metadata.standard  ?? report.doc_standard,
            doc_location:  metadata.location  ?? report.doc_location,
            doc_notes:     metadata.notes     ?? report.doc_notes,
        },
    });
}

module.exports = {
    getKlausulStatuses,
    submitKlausuls,
    approveKlausuls,
    updateReportStatus,
    updateDocMetadata,
};
