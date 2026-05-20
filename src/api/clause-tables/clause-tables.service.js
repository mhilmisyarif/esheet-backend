const prisma = require('../../lib/prisma');

/**
 * Fetches all ClauseTables for a report, optionally filtered by clauseCode.
 */
async function getClauseTables({ reportId, clauseCode }) {
    return prisma.clauseTable.findMany({
        where: {
            reportId,
            ...(clauseCode ? { clauseCode } : {}),
        },
        orderBy: [{ clauseCode: 'asc' }, { order: 'asc' }],
    });
}

/**
 * Creates a new ClauseTable row.
 * Both technician and engineer may create tables.
 */
async function createClauseTable({ reportId, clauseCode, title, headers, rows, notes, userId, userRole }) {
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

    // Only the assigned technician, any engineer, or admin may edit
    if (
        userRole === 'TECHNICIAN' &&
        report.technicianId !== userId
    ) {
        const err = new Error('Forbidden: This is not your report.');
        err.statusCode = 403;
        throw err;
    }

    // Get current max order for this clause so new table goes at the end
    const existing = await prisma.clauseTable.findMany({
        where: { reportId, clauseCode },
        orderBy: { order: 'desc' },
        take: 1,
    });
    const nextOrder = existing.length > 0 ? existing[0].order + 1 : 0;

    return prisma.clauseTable.create({
        data: {
            reportId,
            clauseCode,
            title: title || '',
            headers: Array.isArray(headers) ? headers : ['Kolom 1', 'Kolom 2'],
            rows: Array.isArray(rows) ? rows : [['', '']],
            notes: notes || '',
            order: nextOrder,
        },
    });
}

/**
 * Updates an existing ClauseTable.
 */
async function updateClauseTable({ tableId, title, headers, rows, notes, userId, userRole }) {
    const table = await prisma.clauseTable.findUnique({
        where: { id: tableId },
        include: { report: true },
    });

    if (!table) {
        const err = new Error('Table not found.');
        err.statusCode = 404;
        throw err;
    }

    if (table.report.status === 'APPROVED') {
        const err = new Error('Cannot edit tables on an approved report.');
        err.statusCode = 403;
        throw err;
    }

    if (
        userRole === 'TECHNICIAN' &&
        table.report.technicianId !== userId
    ) {
        const err = new Error('Forbidden: This is not your report.');
        err.statusCode = 403;
        throw err;
    }

    return prisma.clauseTable.update({
        where: { id: tableId },
        data: {
            ...(title !== undefined ? { title } : {}),
            ...(Array.isArray(headers) ? { headers } : {}),
            ...(Array.isArray(rows) ? { rows } : {}),
            ...(notes !== undefined ? { notes } : {}),
        },
    });
}

/**
 * Deletes a ClauseTable.
 */
async function deleteClauseTable({ tableId, userId, userRole }) {
    const table = await prisma.clauseTable.findUnique({
        where: { id: tableId },
        include: { report: true },
    });

    if (!table) {
        const err = new Error('Table not found.');
        err.statusCode = 404;
        throw err;
    }

    if (table.report.status === 'APPROVED') {
        const err = new Error('Cannot delete tables from an approved report.');
        err.statusCode = 403;
        throw err;
    }

    if (
        userRole === 'TECHNICIAN' &&
        table.report.technicianId !== userId
    ) {
        const err = new Error('Forbidden: This is not your report.');
        err.statusCode = 403;
        throw err;
    }

    await prisma.clauseTable.delete({ where: { id: tableId } });
}

/**
 * Fetches all ClauseTables for a report grouped by clauseCode.
 * Used by the report generator.
 * Returns: { "6.1": [table, table], "9.1": [table], ... }
 */
async function getClauseTablesGrouped(reportId) {
    const tables = await prisma.clauseTable.findMany({
        where: { reportId },
        orderBy: [{ clauseCode: 'asc' }, { order: 'asc' }],
    });

    return tables.reduce((acc, t) => {
        if (!acc[t.clauseCode]) acc[t.clauseCode] = [];
        acc[t.clauseCode].push(t);
        return acc;
    }, {});
}

module.exports = {
    getClauseTables,
    createClauseTable,
    updateClauseTable,
    deleteClauseTable,
    getClauseTablesGrouped,
};