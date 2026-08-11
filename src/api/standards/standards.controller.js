const prisma = require('../../lib/prisma');

// POST /api/standards
exports.createStandard = async (req, res) => {
    const { name, labId, template_data, standard_numbers, form_code } = req.body;

    if (!name || !labId || !template_data) {
        return res.status(400).json({ error: "Name, Lab ID, and Template JSON are required." });
    }

    try {
        const standard = await prisma.testStandard.create({
            data: {
                name,
                labId: parseInt(labId),
                standard_numbers: Array.isArray(standard_numbers) ? standard_numbers : [],
                form_code: form_code || null,
                template_data: typeof template_data === 'string' ? JSON.parse(template_data) : template_data
            }
        });
        res.status(201).json(standard);
    } catch (e) {
        if (e.code === 'P2002') {
            return res.status(400).json({ error: "Standard name must be unique." });
        }
        console.error(e);
        res.status(500).json({ error: "Failed to create standard." });
    }
};

// DELETE /api/standards/:id
exports.deleteStandard = async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.testStandard.delete({ where: { id: parseInt(id) } });
        res.json({ message: "Standard deleted" });
    } catch (e) {
        res.status(500).json({ error: "Failed to delete standard. It might be in use by reports." });
    }
};

// GET /api/standards/:id
exports.getStandard = async (req, res) => {
    const { id } = req.params;
    try {
        const standard = await prisma.testStandard.findUnique({
            where: { id: parseInt(id) }
        });
        if (!standard) return res.status(404).json({ error: "Standard not found" });
        res.json(standard);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch standard" });
    }
};

// PUT /api/standards/:id
exports.updateStandard = async (req, res) => {
    const { id } = req.params;
    const { name, labId, template_data, standard_numbers, form_code } = req.body;

    try {
        const updated = await prisma.testStandard.update({
            where: { id: parseInt(id) },
            data: {
                name,
                labId: parseInt(labId),
                standard_numbers: Array.isArray(standard_numbers) ? standard_numbers : [],
                form_code: form_code || null,
                template_data: typeof template_data === 'string' ? JSON.parse(template_data) : template_data
            }
        });
        res.json(updated);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to update standard" });
    }
};