const service = require('./clause-tables.service');

// GET /api/reports/:reportId/clause-tables?clauseCode=6.1
exports.getClauseTables = async (req, res, next) => {
    try {
        const tables = await service.getClauseTables({
            reportId: parseInt(req.params.reportId, 10),
            clauseCode: req.query.clauseCode || null,
        });
        res.json(tables);
    } catch (e) { next(e); }
};

// POST /api/reports/:reportId/clause-tables
exports.createClauseTable = async (req, res, next) => {
    const { clauseCode, title, headers, rows, notes } = req.body;
    if (!clauseCode) {
        return res.status(400).json({ error: 'clauseCode is required.' });
    }
    try {
        const table = await service.createClauseTable({
            reportId: parseInt(req.params.reportId, 10),
            clauseCode, title, headers, rows, notes,
            userId: req.user.id,
            userRole: req.user.role,
        });
        res.status(201).json(table);
    } catch (e) { next(e); }
};

// PUT /api/clause-tables/:tableId
exports.updateClauseTable = async (req, res, next) => {
    const { title, headers, rows, notes } = req.body;
    try {
        const table = await service.updateClauseTable({
            tableId: parseInt(req.params.tableId, 10),
            title, headers, rows, notes,
            userId: req.user.id,
            userRole: req.user.role,
        });
        res.json(table);
    } catch (e) { next(e); }
};

// DELETE /api/clause-tables/:tableId
exports.deleteClauseTable = async (req, res, next) => {
    try {
        await service.deleteClauseTable({
            tableId: parseInt(req.params.tableId, 10),
            userId: req.user.id,
            userRole: req.user.role,
        });
        res.json({ message: 'Table deleted.' });
    } catch (e) { next(e); }
};
