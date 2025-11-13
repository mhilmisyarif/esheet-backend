const jwt = require('jsonwebtoken');

// This middleware will be added to routes we want to protect
exports.protect = (req, res, next) => {
    let token;

    // Check for 'Bearer <token>' in the Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];

            // Verify the token
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-default-secret');

            // Attach the user's info (without password) to the request object
            // We can fetch the user from DB here, but for simplicity, we'll use the token payload
            req.user = {
                id: decoded.userId,
                role: decoded.role
            };

            next(); // Move to the next middleware or controller
        } catch (error) {
            res.status(401).json({ error: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ error: 'Not authorized, no token' });
    }
};

// Usage: authorize('ENGINEER', 'ADMIN')
exports.authorize = (...roles) => {
    return (req, res, next) => {
        // req.user is attached by the 'protect' middleware
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Forbidden: You do not have permission to perform this action.'
            });
        }
        next(); // User has the correct role, proceed
    };
};