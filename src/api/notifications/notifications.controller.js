const service = require('./notifications.service');

// GET /api/notifications?limit=20 → { items, unread }
exports.list = async (req, res, next) => {
    try {
        res.json(await service.listNotifications(req.user.id, { limit: req.query.limit }));
    } catch (e) { next(e); }
};

// PATCH /api/notifications/read  Body: { ids?: number[] } (omit = all)
exports.markRead = async (req, res, next) => {
    try {
        const unread = await service.markRead(req.user.id, req.body?.ids);
        res.json({ unread });
    } catch (e) { next(e); }
};
