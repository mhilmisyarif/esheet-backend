/**
 * Lightweight request validation — dependency-free with a zod-like API.
 *
 * Usage:
 *   const { validate, v } = require('../../middleware/validation.middleware');
 *   router.post('/', validate({
 *       order_no:  v.string({ required: true, max: 100 }),
 *       applicant: v.string({ max: 300 }),
 *       labId:     v.int({ required: true, min: 1 }),
 *   }), controller.create);
 *
 * Each rule receives (value, key) and returns an error string or null.
 * On failure the middleware responds 400 with { error, details } and never
 * lets the payload reach Prisma.
 *
 * If the project later adopts zod, only this file changes — routes keep the
 * same validate(schema) call shape.
 */

const v = {
    string({ required = false, min = 0, max = 10000, pattern = null, enum: allowed = null } = {}) {
        return (value, key) => {
            if (value === undefined || value === null || value === '') {
                return required ? `${key} wajib diisi` : null;
            }
            if (typeof value !== 'string') return `${key} harus berupa teks`;
            if (value.length < min) return `${key} minimal ${min} karakter`;
            if (value.length > max) return `${key} maksimal ${max} karakter`;
            if (pattern && !pattern.test(value)) return `${key} format tidak valid`;
            if (allowed && !allowed.includes(value)) return `${key} harus salah satu dari: ${allowed.join(', ')}`;
            return null;
        };
    },

    int({ required = false, min = null, max = null } = {}) {
        return (value, key) => {
            if (value === undefined || value === null || value === '') {
                return required ? `${key} wajib diisi` : null;
            }
            const n = Number(value);
            if (!Number.isInteger(n)) return `${key} harus berupa angka bulat`;
            if (min !== null && n < min) return `${key} minimal ${min}`;
            if (max !== null && n > max) return `${key} maksimal ${max}`;
            return null;
        };
    },

    array({ required = false, minLength = 0, maxLength = 100000, of = null } = {}) {
        return (value, key) => {
            if (value === undefined || value === null) {
                return required ? `${key} wajib diisi` : null;
            }
            if (!Array.isArray(value)) return `${key} harus berupa array`;
            if (value.length < minLength) return `${key} minimal ${minLength} item`;
            if (value.length > maxLength) return `${key} maksimal ${maxLength} item`;
            if (of) {
                for (let i = 0; i < value.length; i++) {
                    const err = of(value[i], `${key}[${i}]`);
                    if (err) return err;
                }
            }
            return null;
        };
    },

    email({ required = false } = {}) {
        return v.string({ required, max: 320, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ });
    },

    /**
     * Validates the report.data klausul-tree shape (array of klausul objects
     * with sub_klausul[] and butir[]). Structure only — values (L/TB/G etc.)
     * stay free-form since keputusan may legitimately be null/"".
     */
    klausulTree({ required = true } = {}) {
        return (value, key) => {
            if (value === undefined || value === null) {
                return required ? `${key} wajib diisi` : null;
            }
            if (!Array.isArray(value)) return `${key} harus berupa array klausul`;
            for (let i = 0; i < value.length; i++) {
                const k = value[i];
                if (typeof k !== 'object' || k === null) return `${key}[${i}] harus berupa objek klausul`;
                if (typeof k.klausul !== 'string' || !k.klausul) return `${key}[${i}].klausul wajib string`;
                if (!Array.isArray(k.sub_klausul)) return `${key}[${i}].sub_klausul harus array`;
                for (let j = 0; j < k.sub_klausul.length; j++) {
                    const s = k.sub_klausul[j];
                    if (typeof s !== 'object' || s === null) return `${key}[${i}].sub_klausul[${j}] harus objek`;
                    if (typeof s.kode !== 'string' || !s.kode) return `${key}[${i}].sub_klausul[${j}].kode wajib string`;
                    if (!Array.isArray(s.butir)) return `${key}[${i}].sub_klausul[${j}].butir harus array`;
                }
            }
            return null;
        };
    },
};

/**
 * Builds an Express middleware validating req.body against `schema`
 * ({ field: rule }). Unknown fields are left alone (services pass through
 * only what they need), but every declared rule must pass.
 */
function validate(schema) {
    return (req, res, next) => {
        const body = req.body || {};
        const details = [];
        for (const [key, rule] of Object.entries(schema)) {
            const err = rule(body[key], key);
            if (err) details.push(err);
        }
        if (details.length > 0) {
            return res.status(400).json({ error: 'Validasi gagal', details });
        }
        next();
    };
}

module.exports = { validate, v };
