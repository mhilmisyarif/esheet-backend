/**
 * Minimal in-memory rate limiter — no external dependency.
 *
 * Suitable for a single-process deployment (this app runs as one Node
 * process). If the app is ever scaled to multiple instances, swap this for
 * express-rate-limit + a shared store; the middleware signature is the same.
 */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Terlalu banyak percobaan. Coba lagi nanti.' } = {}) {
    const hits = new Map(); // ip → { count, resetAt }

    // Prune expired windows every few minutes so the map can't grow forever.
    const pruner = setInterval(() => {
        const now = Date.now();
        for (const [ip, entry] of hits) {
            if (entry.resetAt <= now) hits.delete(ip);
        }
    }, Math.min(windowMs, 5 * 60 * 1000));
    pruner.unref();

    return (req, res, next) => {
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        const now = Date.now();
        let entry = hits.get(ip);

        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(ip, entry);
        }

        entry.count += 1;
        if (entry.count > max) {
            res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
            return res.status(429).json({ error: message });
        }
        next();
    };
}

module.exports = { rateLimit };
