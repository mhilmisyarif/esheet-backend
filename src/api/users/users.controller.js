const service = require('./users.service');

// GET /api/users — ADMIN only
exports.listUsers = async (_req, res, next) => {
    try {
        res.json(await service.listUsers());
    } catch (e) { next(e); }
};

// PATCH /api/users/:id/role — ADMIN only
exports.updateUserRole = async (req, res, next) => {
    try {
        const updated = await service.updateUserRole({
            userId: parseInt(req.params.id, 10),
            role: req.body.role,
            actingUserId: req.user.id,
        });
        res.json(updated);
    } catch (e) { next(e); }
};

// DELETE /api/users/:id — ADMIN only
exports.deleteUser = async (req, res, next) => {
    try {
        await service.deleteUser({
            userId: parseInt(req.params.id, 10),
            actingUserId: req.user.id,
        });
        res.json({ message: 'User berhasil dihapus.' });
    } catch (e) { next(e); }
};
