const prisma = require('../../lib/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;

/**
 * Creates a new user. Role is always TECHNICIAN — never trust client input for role.
 */
async function registerUser({ email, password, name }) {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
        data: { email, password_hash, name, role: 'TECHNICIAN' },
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

    const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
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