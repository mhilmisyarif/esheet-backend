const service = require('./table-templates.service');

// GET /api/standards/:standardId/table-templates?subClauseCode=6.1
exports.getTemplates = async (req, res, next) => {
    try {
        const templates = await service.getTemplates({
            testStandardId: parseInt(req.params.standardId, 10),
            subClauseCode: req.query.subClauseCode || null,
        });
        res.json(templates);
    } catch (e) {
        next(e);
    }
};

// GET /api/table-templates/:id
exports.getTemplate = async (req, res, next) => {
    try {
        const template = await service.getTemplateById(parseInt(req.params.id, 10));
        if (!template) return res.status(404).json({ error: 'Template not found.' });
        res.json(template);
    } catch (e) {
        next(e);
    }
};

// POST /api/standards/:standardId/table-templates
exports.createTemplate = async (req, res, next) => {
    const { subClauseCode, title, definition, order } = req.body;

    if (!subClauseCode) {
        return res.status(400).json({ error: 'subClauseCode is required.' });
    }
    if (!definition) {
        return res.status(400).json({ error: 'definition is required.' });
    }

    try {
        const template = await service.createTemplate({
            testStandardId: parseInt(req.params.standardId, 10),
            subClauseCode,
            title,
            definition,
            order,
            userId: req.user.id,
        });
        res.status(201).json(template);
    } catch (e) {
        next(e);
    }
};

// PUT /api/table-templates/:id
exports.updateTemplate = async (req, res, next) => {
    const { title, subClauseCode, definition, order } = req.body;
    try {
        const updated = await service.updateTemplate({
            id: parseInt(req.params.id, 10),
            title,
            subClauseCode,
            definition,
            order,
        });
        res.json(updated);
    } catch (e) {
        next(e);
    }
};

// DELETE /api/table-templates/:id
exports.deleteTemplate = async (req, res, next) => {
    try {
        await service.deleteTemplate(parseInt(req.params.id, 10));
        res.json({ message: 'Template deleted.' });
    } catch (e) {
        next(e);
    }
};

// GET /api/reports/:reportId/table-templates
// Returns all templates for the report's TestStandard, grouped by subClauseCode
exports.getTemplatesForReport = async (req, res, next) => {
    try {
        const grouped = await service.getTemplatesForReport(parseInt(req.params.reportId, 10));
        res.json(grouped);
    } catch (e) {
        next(e);
    }
};
