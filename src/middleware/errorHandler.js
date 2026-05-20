/**
 * Central error-handling middleware.
 * Any controller can call next(err) and land here.
 * Express identifies this as an error handler because it has 4 arguments.
 */
module.exports = (err, req, res, next) => {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err);

    // Prisma known error codes
    if (err.code === 'P2002') {
        return res.status(409).json({ error: 'A record with that value already exists.' });
    }
    if (err.code === 'P2025') {
        return res.status(404).json({ error: 'Record not found.' });
    }

    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Internal server error.' });
};