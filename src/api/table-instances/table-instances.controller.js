const service = require('./table-instances.service');

// GET /api/reports/:reportId/table-instances?subClauseCode=6.1
exports.getInstances = async (req, res, next) => {
    try {
        const instances = await service.getInstances({
            reportId: parseInt(req.params.reportId, 10),
            subClauseCode: req.query.subClauseCode || null,
        });
        res.json(instances);
    } catch (e) {
        next(e);
    }
};

// POST /api/reports/:reportId/table-instances/autoprovision
// Called when a report is opened to auto-create instances for all templates
exports.autoprovision = async (req, res, next) => {
    try {
        const created = await service.autoprovisionInstances(
            parseInt(req.params.reportId, 10)
        );
        res.json({ created: created.length, instances: created });
    } catch (e) {
        next(e);
    }
};

// POST /api/reports/:reportId/table-instances
// Technician adds another copy of a template
exports.createInstance = async (req, res, next) => {
    const { templateId } = req.body;
    if (!templateId) {
        return res.status(400).json({ error: 'templateId is required.' });
    }
    try {
        const instance = await service.createInstance({
            reportId: parseInt(req.params.reportId, 10),
            templateId: parseInt(templateId, 10),
            userId: req.user.id,
            userRole: req.user.role,
        });
        res.status(201).json(instance);
    } catch (e) {
        next(e);
    }
};

// PUT /api/table-instances/:id
exports.saveInstance = async (req, res, next) => {
    const { data } = req.body;
    if (!data) {
        return res.status(400).json({ error: 'data is required.' });
    }
    try {
        const updated = await service.saveInstance({
            instanceId: parseInt(req.params.id, 10),
            data,
            userId: req.user.id,
            userRole: req.user.role,
        });
        res.json(updated);
    } catch (e) {
        next(e);
    }
};

// DELETE /api/table-instances/:id
exports.deleteInstance = async (req, res, next) => {
    try {
        await service.deleteInstance({
            instanceId: parseInt(req.params.id, 10),
            userId: req.user.id,
            userRole: req.user.role,
        });
        res.json({ message: 'Instance deleted.' });
    } catch (e) {
        next(e);
    }
};
