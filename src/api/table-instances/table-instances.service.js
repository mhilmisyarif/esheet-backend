const prisma = require('../../lib/prisma');

/**
 * Get all instances for a report, optionally filtered by subClauseCode.
 * Returns instances with their template definitions attached.
 */
async function getInstances({ reportId, subClauseCode }) {
    const instances = await prisma.tableInstance.findMany({
        where: {
            reportId,
            ...(subClauseCode ? { template: { subClauseCode } } : {}),
        },
        include: {
            template: true,
        },
        orderBy: [{ template: { subClauseCode: 'asc' } }, { order: 'asc' }],
    });
    return instances;
}

/**
 * Get all instances for a report grouped by subClauseCode.
 * Used by the Word export generator.
 * Returns: { "6.1": [{ instance, template }], ... }
 */
async function getInstancesGrouped(reportId) {
    const instances = await prisma.tableInstance.findMany({
        where: { reportId },
        include: { template: true },
        orderBy: [{ template: { subClauseCode: 'asc' } }, { order: 'asc' }],
    });

    return instances.reduce((acc, inst) => {
        const code = inst.template.subClauseCode;
        if (!acc[code]) acc[code] = [];
        acc[code].push(inst);
        return acc;
    }, {});
}

/**
 * Create a new instance from a template.
 * Technicians can call this.
 * If this is the first instance for this template+report, it's auto-created
 * when the report is opened — subsequent calls mean "add another copy".
 */
async function createInstance({ reportId, templateId, userId, userRole }) {
    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) {
        const err = new Error('Report not found.');
        err.statusCode = 404;
        throw err;
    }

    if (report.status === 'APPROVED') {
        const err = new Error('Cannot add tables to an approved report.');
        err.statusCode = 403;
        throw err;
    }

    if (userRole === 'TECHNICIAN' && report.technicianId !== userId) {
        const err = new Error('Forbidden: This is not your report.');
        err.statusCode = 403;
        throw err;
    }

    const template = await prisma.tableTemplate.findUnique({ where: { id: templateId } });
    if (!template) {
        const err = new Error('Template not found.');
        err.statusCode = 404;
        throw err;
    }

    // Order: put after existing instances for same template
    const existing = await prisma.tableInstance.findMany({
        where: { reportId, templateId },
        orderBy: { order: 'desc' },
        take: 1,
    });
    const nextOrder = existing.length > 0 ? existing[0].order + 1 : 0;

    return prisma.tableInstance.create({
        data: {
            reportId,
            templateId,
            data: {},
            order: nextOrder,
        },
        include: { template: true },
    });
}

/**
 * Auto-provision instances for a report.
 * Called when a report is first opened — creates one instance per template
 * that exists for this report's TestStandard and doesn't already have an instance.
 */
async function autoprovisionInstances(reportId) {
    const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: { sample: true },
    });
    if (!report) return [];

    const templates = await prisma.tableTemplate.findMany({
        where: { testStandardId: report.sample.testStandardId },
    });

    const existingInstances = await prisma.tableInstance.findMany({
        where: { reportId },
        select: { templateId: true },
    });
    const existingTemplateIds = new Set(existingInstances.map(i => i.templateId));

    const toCreate = templates.filter(t => !existingTemplateIds.has(t.id));

    if (toCreate.length === 0) return [];

    await prisma.tableInstance.createMany({
        data: toCreate.map((t, i) => ({
            reportId,
            templateId: t.id,
            data: {},
            order: i,
        })),
    });

    return prisma.tableInstance.findMany({
        where: { reportId, templateId: { in: toCreate.map(t => t.id) } },
        include: { template: true },
    });
}

/**
 * Save filled cell data for an instance.
 * Only editable cells are stored — computed cells are resolved at read time.
 *
 * data shape:
 * {
 *   sections: {
 *     [sectionIndex]: {
 *       kv: { [rowId]: { value: string, result: "L"|"TB"|"G" } },     // key_value
 *       rows: { [rowId]: { cells: { [colId]: value } } }              // table
 *     }
 *   }
 * }
 */
async function saveInstance({ instanceId, data, userId, userRole }) {
    const instance = await prisma.tableInstance.findUnique({
        where: { id: instanceId },
        include: { report: true },
    });

    if (!instance) {
        const err = new Error('Instance not found.');
        err.statusCode = 404;
        throw err;
    }

    if (instance.report.status === 'APPROVED') {
        const err = new Error('Cannot edit a locked (approved) report.');
        err.statusCode = 403;
        throw err;
    }

    if (
        userRole === 'TECHNICIAN' &&
        instance.report.technicianId !== userId
    ) {
        const err = new Error('Forbidden: This is not your report.');
        err.statusCode = 403;
        throw err;
    }

    return prisma.tableInstance.update({
        where: { id: instanceId },
        data: { data },
        include: { template: true },
    });
}

/**
 * Delete an instance. Technicians may only delete additional copies
 * (order > 0). Engineers can delete any.
 */
async function deleteInstance({ instanceId, userId, userRole }) {
    const instance = await prisma.tableInstance.findUnique({
        where: { id: instanceId },
        include: { report: true },
    });

    if (!instance) {
        const err = new Error('Instance not found.');
        err.statusCode = 404;
        throw err;
    }

    if (instance.report.status === 'APPROVED') {
        const err = new Error('Cannot delete from an approved report.');
        err.statusCode = 403;
        throw err;
    }

    if (userRole === 'TECHNICIAN') {
        if (instance.report.technicianId !== userId) {
            const err = new Error('Forbidden: This is not your report.');
            err.statusCode = 403;
            throw err;
        }
        if (instance.order === 0) {
            const err = new Error('Cannot delete the primary instance. Clear its data instead.');
            err.statusCode = 400;
            throw err;
        }
    }

    await prisma.tableInstance.delete({ where: { id: instanceId } });
}

module.exports = {
    getInstances,
    getInstancesGrouped,
    createInstance,
    autoprovisionInstances,
    saveInstance,
    deleteInstance,
};
