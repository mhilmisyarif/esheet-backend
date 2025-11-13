const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

// POST /api/auth/register
exports.register = async (req, res) => {
    const { email, password, name, role } = req.body;

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                password_hash: hashedPassword,
                name,
                role: role || 'TECHNICIAN', // Default to TECHNICIAN
            },
        });

        // Don't return the password
        delete user.password_hash;
        res.status(201).json(user);

    } catch (e) {
        if (e.code === 'P2002') { // Prisma code for unique constraint violation
            return res.status(400).json({ error: 'Email already exists.' });
        }
        res.status(500).json({ error: 'Failed to register user.' });
    }
};

// POST /api/auth/login
exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Create a JWT
        // We'll use a simple secret from .env, add JWT_SECRET=your-secret-key
        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role
            },
            process.env.JWT_SECRET || 'your-default-secret',
            { expiresIn: '24h' } // Token expires in 24 hours
        );

        // Don't return the password
        delete user.password_hash;

        res.json({ token, user });

    } catch (e) {
        res.status(500).json({ error: 'Login failed.' });
    }
};