const prisma = require('../../lib/prisma');

const VALID_ROLES = ['TECHNICIAN', 'ENGINEER', 'DRAFTER', 'ADMIN'];

/** Lists all users (never exposes password hashes). */
async function listUsers() {
    return prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: 'asc' },
    });
}

/**
 * Changes a user's role. Refuses to demote the last remaining ADMIN so the
 * system can never lock itself out of user management.
 */
async function updateUserRole({ userId, role, actingUserId }) {
    if (!VALID_ROLES.includes(role)) {
        const err = new Error(`Role harus salah satu dari: ${VALID_ROLES.join(', ')}`);
        err.statusCode = 400;
        throw err;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        const err = new Error('User tidak ditemukan.');
        err.statusCode = 404;
        throw err;
    }

    if (user.role === 'ADMIN' && role !== 'ADMIN') {
        const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
        if (adminCount <= 1) {
            const err = new Error('Tidak bisa menurunkan ADMIN terakhir.');
            err.statusCode = 400;
            throw err;
        }
    }

    return prisma.user.update({
        where: { id: userId },
        data: { role },
        select: { id: true, name: true, email: true, role: true },
    });
}

module.exports = { listUsers, updateUserRole, VALID_ROLES };
