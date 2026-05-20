const service = require('./components.service');

// GET /api/samples/:sampleId/components
exports.listBySample = async (req, res, next) => {
    try {
        const sampleId = parseInt(req.params.sampleId, 10);
        res.json(await service.listBySample(sampleId));
    } catch (e) {
        next(e);
    }
};

// POST /api/samples/:sampleId/components
exports.create = async (req, res, next) => {
    try {
        const sampleId = parseInt(req.params.sampleId, 10);
        if (!req.body || !req.body.objek || !req.body.objek.trim()) {
            return res.status(400).json({ error: 'Objek / part No. wajib diisi.' });
        }
        const component = await service.createForSample(sampleId, req.body);
        res.status(201).json(component);
    } catch (e) {
        next(e);
    }
};

// DELETE /api/components/:id
exports.remove = async (req, res, next) => {
    try {
        await service.remove(parseInt(req.params.id, 10));
        res.json({ message: 'Component deleted.' });
    } catch (e) {
        next(e);
    }
};
