const jwt = require('jsonwebtoken');

/**
 * protect — verifies the Bearer JWT on every protected route.
 * Attaches { id, role } to req.user on success.
 */
exports.protect = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authorized, no token.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // No fallback secret — JWT_SECRET must be set (enforced in server.js)
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = {
            id: decoded.userId,
            role: decoded.role,
        };

        next();
    } catch (error) {
        return res.status(401).json({ error: 'Not authorized, token invalid or expired.' });
    }
};

/**
 * authorize — role-based access control.
 * Must be used AFTER protect.
 * Usage: authorize('ENGINEER', 'ADMIN')
 */
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Forbidden: You do not have permission to perform this action.',
            });
        }
        next();
    };
};