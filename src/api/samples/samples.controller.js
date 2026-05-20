const {
    getAllSamples,
    getSampleById,
    updateSample,
    deleteSample,
} = require('./samples.service');

// GET /api/samples?status=REVIEW
exports.getAllSamples = async (req, res, next) => {
    try {
        const samples = await getAllSamples({
            status: req.query.status,
            userId: req.user.id,
            userRole: req.user.role,
        });
        res.json(samples);
    } catch (e) {
        next(e);
    }
};

// GET /api/samples/:id — full detail for the Datasheet Detail page
exports.getSampleById = async (req, res, next) => {
    try {
        const sample = await getSampleById(parseInt(req.params.id, 10));
        if (!sample) {
            return res.status(404).json({ error: 'Sample not found.' });
        }
        res.json(sample);
    } catch (e) {
        next(e);
    }
};

// PATCH /api/samples/:id — edit datasheet-info fields
exports.updateSample = async (req, res, next) => {
    try {
        const updated = await updateSample(
            parseInt(req.params.id, 10),
            req.body || {},
        );
        if (!updated) {
            return res.status(404).json({ error: 'Sample not found.' });
        }
        res.json(updated);
    } catch (e) {
        next(e);
    }
};

// DELETE /api/samples/:id — delete a datasheet and all its data
exports.deleteSample = async (req, res, next) => {
    try {
        const ok = await deleteSample(parseInt(req.params.id, 10));
        if (!ok) {
            return res.status(404).json({ error: 'Sample not found.' });
        }
        res.json({ message: 'Datasheet deleted.' });
    } catch (e) {
        next(e);
    }
};
