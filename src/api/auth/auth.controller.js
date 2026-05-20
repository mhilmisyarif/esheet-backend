const { registerUser, loginUser, getUserById } = require('./auth.service');

// POST /api/auth/register
exports.register = async (req, res, next) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, password, and name are required.' });
    }

    try {
        const user = await registerUser({ email, password, name });
        res.status(201).json(user);
    } catch (e) {
        if (e.code === 'P2002') {
            return res.status(409).json({ error: 'Email already exists.' });
        }
        next(e);
    }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const result = await loginUser({ email, password });

        if (!result) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        res.json(result);
    } catch (e) {
        next(e);
    }
};

// GET /api/auth/me
// Called by the frontend on app load to validate an existing token
exports.getMe = async (req, res, next) => {
    try {
        const user = await getUserById(req.user.id);

        if (!user) {
            // Token was valid but user no longer exists in DB
            return res.status(401).json({ error: 'User not found.' });
        }

        res.json(user);
    } catch (e) {
        next(e);
    }
};