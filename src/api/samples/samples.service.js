const prisma = require('../../lib/prisma');

/**
 * Fetches samples with optional status filter, paginated.
 * - TECHNICIAN: only sees their own samples
 * - ENGINEER / ADMIN: sees all samples
 *
 * @param {object} options
 * @param {string} [options.status]    - 'REVIEW' | 'APPROVED' | etc.
 * @param {number} options.userId      - the caller's user ID
 * @param {string} options.userRole    - the caller's role
 * @param {number} [options.page]      - 1-based page number (default 1)
 * @param {number} [options.limit]     - page size (default 50, max 200)
 *
 * Returns { items, total, page, limit } — callers that used to receive a
 * bare array should read `.items`.
 */
async function getAllSamples({ status, userId, userRole, page = 1, limit = 50 }) {
    let reportFilter = {};

    if (status) {
        if (status === 'REVIEW' || status === 'IN_PROGRESS') {
            reportFilter = { status: 'IN_PROGRESS' };
        } else {
            reportFilter = { status: status.toUpperCase() };
        }
    }

    // Technicians only see their own samples
    let ownershipFilter = {};
    if (userRole === 'TECHNICIAN') {
        ownershipFilter = { Report: { technicianId: userId } };
    }

    const whereClause = {
        ...ownershipFilter,
        ...(status ? { Report: { ...reportFilter, ...ownershipFilter.Report } } : ownershipFilter),
    };

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);

    const [items, total] = await prisma.$transaction([
        prisma.sample.findMany({
            where: whereClause,
            include: {
                order: true,
                Report: {
                    select: { id: true, status: true, updatedAt: true },
                },
            },
            // Most recently edited report first (dashboard shows what the
            // user worked on last at the top); ties broken by newest sample.
            orderBy: [
                { Report: { updatedAt: 'desc' } },
                { id: 'desc' },
            ],
            skip: (safePage - 1) * safeLimit,
            take: safeLimit,
        }),
        prisma.sample.count({ where: whereClause }),
    ]);

    return { items, total, page: safePage, limit: safeLimit };
}

/**
 * Fetches a single sample with everything the Datasheet Detail page needs:
 * order (+ lab), test standard, the report (+ images), and components.
 *
 * The report's `data` JSON is fetched only to derive test_period_start /
 * test_period_end (min/max of the per-klausul "Tanggal Uji" meta the
 * technician filled) and is stripped from the response to keep it light.
 */
async function getSampleById(id) {
    const sample = await prisma.sample.findUnique({
        where: { id },
        include: {
            order: { include: { lab: true } },
            testStandard: { select: { id: true, name: true } },
            Components: { orderBy: { id: 'asc' } },
            Report: {
                select: {
                    id: true,
                    status: true,
                    testing_type: true,
                    createdAt: true,
                    test_started_at: true,
                    test_finished_at: true,
                    data: true,
                    ReportImages: { orderBy: { id: 'desc' } },
                },
            },
        },
    });
    if (!sample) return null;

    if (sample.Report) {
        const dates = (Array.isArray(sample.Report.data) ? sample.Report.data : [])
            .map(k => k.meta?.test_datetime)
            .filter(Boolean)
            .map(d => new Date(d))
            .filter(d => !isNaN(d.getTime()))
            .sort((a, b) => a - b);
        sample.Report.test_period_start = dates[0] || null;
        sample.Report.test_period_end = dates.length ? dates[dates.length - 1] : null;
        delete sample.Report.data;
    }
    return sample;
}

/**
 * Updates the editable datasheet-info fields of a sample and its order.
 * Editable: applicant + applicant_address (Order), brand, model, factory,
 * factory_address, country_origin, iwo_no (Sample). The order number, lab,
 * standard and testing type are intentionally NOT editable here.
 */
async function updateSample(id, data) {
    const existing = await prisma.sample.findUnique({
        where: { id },
        select: { orderId: true },
    });
    if (!existing) return null;

    const clean = (v) => {
        const t = (v ?? '').toString().trim();
        return t.length ? t : null;
    };

    // brand & model are required (non-null) — only overwrite when given a value
    const sampleData = {
        factory: clean(data.factory),
        factory_address: clean(data.factory_address),
        country_origin: clean(data.country_origin),
        iwo_no: clean(data.iwo_no),
    };

    // Tanggal masuk sampel — only touch when the field is present & valid
    if (data.received_date !== undefined) {
        if (data.received_date === null || data.received_date === '') {
            sampleData.received_date = null;
        } else {
            const d = new Date(data.received_date);
            if (!isNaN(d.getTime())) sampleData.received_date = d;
        }
    }
    const brand = clean(data.brand);
    const model = clean(data.model);
    if (brand) sampleData.brand = brand;
    if (model) sampleData.model = model;

    await prisma.$transaction([
        prisma.order.update({
            where: { id: existing.orderId },
            data: {
                applicant: clean(data.applicant),
                address: clean(data.applicant_address),
            },
        }),
        prisma.sample.update({ where: { id }, data: sampleData }),
    ]);

    return getSampleById(id);
}

/**
 * Deletes a datasheet (sample) and everything that hangs off it.
 * KlausulStatus / ClauseTable / TableInstance cascade with the Report,
 * and Component cascades with the Sample; ReportImage and ReportHistory
 * have no cascade rule, so they are removed explicitly first.
 */
async function deleteSample(id) {
    const sample = await prisma.sample.findUnique({
        where: { id },
        include: { Report: { select: { id: true } } },
    });
    if (!sample) return false;

    const reportId = sample.Report?.id || null;

    await prisma.$transaction(async (tx) => {
        if (reportId) {
            await tx.reportImage.deleteMany({ where: { reportId } });
            await tx.reportHistory.deleteMany({ where: { reportId } });
            await tx.report.delete({ where: { id: reportId } });
        }
        await tx.sample.delete({ where: { id } });
    });
    return true;
}

/**
 * Looks up samples by a scanned barcode (the order_no printed on the
 * physical sample, e.g. "CBT/3801/20-104-04/00132/06/2026-01").
 * Falls back to a contains-match so partial codes still resolve.
 */
async function lookupByCode(code) {
    const trimmed = (code || '').trim();
    if (!trimmed) return [];

    // Exact order match first
    let samples = await prisma.sample.findMany({
        where: { order: { order_no: trimmed } },
        include: {
            order: true,
            Report: { select: { id: true, status: true } },
        },
        orderBy: { id: 'desc' },
        take: 10,
    });

    if (samples.length === 0) {
        samples = await prisma.sample.findMany({
            where: { order: { order_no: { contains: trimmed, mode: 'insensitive' } } },
            include: {
                order: true,
                Report: { select: { id: true, status: true } },
            },
            orderBy: { id: 'desc' },
            take: 10,
        });
    }
    return samples;
}

module.exports = { getAllSamples, getSampleById, updateSample, deleteSample, lookupByCode };