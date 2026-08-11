const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;

const ASSIGNABLE_ROLES = ['TECHNICIAN', 'ENGINEER', 'DRAFTER', 'ADMIN'];

/**
 * Creates a new user. Only callable by an ADMIN (enforced at the route).
 * Role must be one of ASSIGNABLE_ROLES; defaults to TECHNICIAN.
 */
async function registerUser({ email, password, name, role }) {
    const safeRole = ASSIGNABLE_ROLES.includes(role) ? role : 'TECHNICIAN';
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
        data: { email, password_hash, name, role: safeRole },
        select: { id: true, name: true, email: true, role: true, },
    });

    return user;
}

/**
 * Validates credentials and returns a signed JWT + safe user object.
 */
async function loginUser({ email, password }) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return null;

    // Session lifetime from env — validated so a typo (e.g. "24 jam") can
    // never make jwt.sign throw and turn every login into a 500.
    const rawExpiry = (process.env.JWT_EXPIRES_IN || '').trim();
    const expiresIn = /^\d+\s*(ms|s|m|h|d|w|y)?$/i.test(rawExpiry) ? rawExpiry : '24h';
    if (rawExpiry && expiresIn === '24h' && rawExpiry !== '24h') {
        console.warn(`JWT_EXPIRES_IN "${rawExpiry}" tidak valid — memakai default 24h.`);
    }

    const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn }
    );

    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };

    return { token, user: safeUser };
}

/**
 * Fetches a user by ID — used by GET /auth/me to validate token on app load.
 */
async function getUserById(id) {
    return prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, role: true },
    });
}

module.exports = { registerUser, loginUser, getUserById };