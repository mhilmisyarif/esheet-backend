const prisma = require('../../lib/prisma');

/**
 * List all templates for a TestStandard, optionally filtered by subClauseCode.
 */
async function getTemplates({ testStandardId, subClauseCode }) {
    return prisma.tableTemplate.findMany({
        where: {
            testStandardId,
            ...(subClauseCode ? { subClauseCode } : {}),
        },
        orderBy: [{ subClauseCode: 'asc' }, { order: 'asc' }],
        include: {
            createdBy: { select: { id: true, name: true } },
        },
    });
}

/**
 * Get a single template by ID.
 */
async function getTemplateById(id) {
    return prisma.tableTemplate.findUnique({
        where: { id },
        include: { createdBy: { select: { id: true, name: true } } },
    });
}

/**
 * Create a new table template. Engineer/Admin only.
 */
async function createTemplate({ testStandardId, subClauseCode, title, definition, order, userId }) {
    // Validate the standard exists
    const standard = await prisma.testStandard.findUnique({ where: { id: testStandardId } });
    if (!standard) {
        const err = new Error('TestStandard not found.');
        err.statusCode = 404;
        throw err;
    }

    // Validate definition structure
    validateDefinition(definition);

    // Auto-order: put at end of this subClauseCode group
    const existing = await prisma.tableTemplate.findMany({
        where: { testStandardId, subClauseCode },
        orderBy: { order: 'desc' },
        take: 1,
    });
    const nextOrder = order ?? (existing.length > 0 ? existing[0].order + 1 : 0);

    return prisma.tableTemplate.create({
        data: {
            testStandardId,
            subClauseCode,
            title: title || '',
            definition,
            order: nextOrder,
            createdById: userId,
        },
    });
}

/**
 * Update a template's definition. Engineer/Admin only.
 * Cannot update if reports already have instances — warn but allow.
 */
async function updateTemplate({ id, title, subClauseCode, definition, order }) {
    const template = await prisma.tableTemplate.findUnique({ where: { id } });
    if (!template) {
        const err = new Error('Template not found.');
        err.statusCode = 404;
        throw err;
    }

    if (definition) validateDefinition(definition);

    return prisma.tableTemplate.update({
        where: { id },
        data: {
            ...(title !== undefined ? { title } : {}),
            ...(subClauseCode ? { subClauseCode } : {}),
            ...(definition ? { definition } : {}),
            ...(order !== undefined ? { order } : {}),
        },
    });
}

/**
 * Delete a template. There is no DB cascade on TableInstance.templateId,
 * so the dependent instances (the filled-in copies) are removed first,
 * atomically, before the template itself.
 */
async function deleteTemplate(id) {
    const template = await prisma.tableTemplate.findUnique({ where: { id } });
    if (!template) {
        const err = new Error('Template not found.');
        err.statusCode = 404;
        throw err;
    }
    return prisma.$transaction([
        prisma.tableInstance.deleteMany({ where: { templateId: id } }),
        prisma.tableTemplate.delete({ where: { id } }),
    ]);
}

/**
 * Fetch all templates for a report's TestStandard,
 * grouped by subClauseCode. Used when opening a report.
 * Returns: { "6.1": [template, ...], "12": [...] }
 */
async function getTemplatesForReport(reportId) {
    const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: { sample: { include: { testStandard: true } } },
    });
    if (!report) return {};

    const templates = await prisma.tableTemplate.findMany({
        where: { testStandardId: report.sample.testStandardId },
        orderBy: [{ subClauseCode: 'asc' }, { order: 'asc' }],
    });

    return templates.reduce((acc, t) => {
        if (!acc[t.subClauseCode]) acc[t.subClauseCode] = [];
        acc[t.subClauseCode].push(t);
        return acc;
    }, {});
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateDefinition(def) {
    if (!def || typeof def !== 'object') {
        const err = new Error('definition must be a JSON object.');
        err.statusCode = 400;
        throw err;
    }
    const validLayouts = ['key_value', 'table', 'mixed'];
    if (!validLayouts.includes(def.layout)) {
        const err = new Error(`definition.layout must be one of: ${validLayouts.join(', ')}`);
        err.statusCode = 400;
        throw err;
    }
    if (!Array.isArray(def.sections) || def.sections.length === 0) {
        const err = new Error('definition.sections must be a non-empty array.');
        err.statusCode = 400;
        throw err;
    }

    def.sections.forEach((section, i) => {
        if (!['key_value', 'table'].includes(section.type)) {
            const err = new Error(`sections[${i}].type must be "key_value" or "table".`);
            err.statusCode = 400;
            throw err;
        }

        if (section.type === 'table') {
            if (!Array.isArray(section.columns) || section.columns.length === 0) {
                const err = new Error(`sections[${i}] of type "table" must have at least one column.`);
                err.statusCode = 400;
                throw err;
            }

            // Validate formula references exist in same section.
            // Two shapes: aggregate { op, cols:[...] } and binary { op, a, b }.
            const colIds = new Set(section.columns.map(c => c.id));
            section.columns.forEach((col, ci) => {
                if (col.formula) {
                    const f = col.formula;
                    if (Array.isArray(f.cols)) {
                        if (f.cols.length === 0) {
                            const err = new Error(`sections[${i}].columns[${ci}].formula.cols must be non-empty.`);
                            err.statusCode = 400;
                            throw err;
                        }
                        f.cols.forEach((cid) => {
                            if (!colIds.has(cid)) {
                                const err = new Error(`sections[${i}].columns[${ci}].formula.cols references unknown column "${cid}".`);
                                err.statusCode = 400;
                                throw err;
                            }
                        });
                    } else {
                        if (!colIds.has(f.a)) {
                            const err = new Error(`sections[${i}].columns[${ci}].formula.a references unknown column "${f.a}".`);
                            err.statusCode = 400;
                            throw err;
                        }
                        if (!colIds.has(f.b)) {
                            const err = new Error(`sections[${i}].columns[${ci}].formula.b references unknown column "${f.b}".`);
                            err.statusCode = 400;
                            throw err;
                        }
                    }
                }
                if (col.passRule && !colIds.has(col.passRule.col)) {
                    const err = new Error(`sections[${i}].columns[${ci}].passRule.col references unknown column "${col.passRule.col}".`);
                    err.statusCode = 400;
                    throw err;
                }
            });
        }

        if (section.type === 'key_value') {
            if (!Array.isArray(section.rows) || section.rows.length === 0) {
                const err = new Error(`sections[${i}] of type "key_value" must have at least one row.`);
                err.statusCode = 400;
                throw err;
            }
        }
    });
}

module.exports = {
    getTemplates,
    getTemplateById,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplatesForReport,
};
