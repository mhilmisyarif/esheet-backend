const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../../middleware/auth.middleware');
const controller = require('./upload.controller');

const router = express.Router();

// Only image types are accepted. Extension is derived from the verified
// MIME type — never from the client-supplied filename.
const ALLOWED_MIME = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = ALLOWED_MIME[file.mimetype] || '';
        cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
});

const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
    const err = new Error('Only JPEG, PNG, or WebP images are allowed.');
    err.statusCode = 415;
    cb(err, false);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

// POST /api/uploads/report-image/:reportId
// This route expects a single file in a field named 'image'
router.post(
    '/report-image/:reportId',
    protect,
    upload.single('image'), // 'image' must match the FormData key
    controller.uploadReportImage
);

// DELETE /api/uploads/image/:imageId
router.delete(
    '/image/:imageId',
    protect,
    controller.deleteReportImage
);

module.exports = router;
