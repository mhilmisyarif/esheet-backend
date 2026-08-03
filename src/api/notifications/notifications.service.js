const prisma = require('../../lib/prisma');

/**
 * Creates one notification row per target user. Fire-and-forget friendly —
 * callers may await or not; failures must never break the main workflow,
 * so errors are logged and swallowed.
 */
async function notifyUsers(userIds, { type, title, body = null, link = null }) {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) return;
    try {
        await prisma.notification.createMany({
            data: unique.map((userId) => ({ userId, type, title, body, link })),
        });
    } catch (e) {
        console.error('notifyUsers failed:', e.message);
    }
}

/** All engineer + admin ids — the review audience for submit events. */
async function getEngineerIds() {
    const rows = await prisma.user.findMany({
        where: { role: { in: ['ENGINEER', 'ADMIN'] } },
        select: { id: true },
    });
    return rows.map((r) => r.id);
}

/**
 * Lists the caller's notifications, newest first, plus the unread count.
 */
async function listNotifications(userId, { limit = 20 } = {}) {
    const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const [items, unread] = await prisma.$transaction([
        prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take,
        }),
        prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { items, unread };
}

/**
 * Marks notifications read. ids omitted/empty → mark ALL of the caller's
 * unread notifications.
 */
async function markRead(userId, ids) {
    const where = { userId, read: false };
    if (Array.isArray(ids) && ids.length > 0) {
        where.id = { in: ids.map((n) => parseInt(n, 10)).filter(Number.isInteger) };
    }
    await prisma.notification.updateMany({ where, data: { read: true } });
    return prisma.notification.count({ where: { userId, read: false } });
}

module.exports = { notifyUsers, getEngineerIds, listNotifications, markRead };
