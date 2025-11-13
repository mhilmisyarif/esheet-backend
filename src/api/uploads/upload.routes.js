const express = require('express');
const multer = require('multer');
const path = require('path');
const { protect } = require('../../middleware/auth.middleware');
const controller = require('./upload.controller');

const router = express.Router();

// Configure Multer storage
// This saves files to a folder named 'uploads' in your backend root
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Ensure the 'uploads' directory exists at the root of your project
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Create a unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

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