const prisma = require('../../lib/prisma');

/**
 * Fetches samples with optional status filter.
 * - TECHNICIAN: only sees their own samples
 * - ENGINEER / ADMIN: sees all samples
 *
 * @param {object} options
 * @param {string} [options.status]    - 'REVIEW' | 'APPROVED' | etc.
 * @param {number} options.userId      - the caller's user ID
 * @param {string} options.userRole    - the caller's role
 */
async function getAllSamples({ status, userId, userRole }) {
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

    return prisma.sample.findMany({
        where: whereClause,
        include: {
            order: true,
            Report: {
                select: { id: true, status: true },
            },
        },
        orderBy: { id: 'desc' },
    });
}

/**
 * Fetches a single sample with everything the Datasheet Detail page needs:
 * order (+ lab), test standard, the report (+ images), and components.
 */
function getSampleById(id) {
    return prisma.sample.findUnique({
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
                    ReportImages: { orderBy: { id: 'desc' } },
                },
            },
        },
    });
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

module.exports = { getAllSamples, getSampleById, updateSample, deleteSample };