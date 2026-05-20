const { getAllLabs, getLabById } = require('./labs.service');

// GET /api/labs
exports.getAllLabs = async (req, res, next) => {
    try {
        const labs = await getAllLabs();
        res.json(labs);
    } catch (e) {
        next(e);
    }
};

// GET /api/labs/:id
exports.getLabById = async (req, res, next) => {
    try {
        const lab = await getLabById(parseInt(req.params.id, 10));
        if (!lab) return res.status(404).json({ error: 'Lab not found.' });
        res.json(lab);
    } catch (e) {
        next(e);
    }
};