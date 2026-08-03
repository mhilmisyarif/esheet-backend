const fs = require('fs'); // Node.js File System module
const path = require('path');
const prisma = require('../../lib/prisma');

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

exports.uploadReportImage = async (req, res, next) => {
    const reportId = parseInt(req.params.reportId, 10);

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }
    if (!Number.isInteger(reportId)) {
        return res.status(400).json({ error: 'Invalid reportId.' });
    }

    try {
        // req.file.path gives the path. We want to store the URL path.
        // This assumes your server will serve the 'uploads' folder statically.
        const imageUrl = `/uploads/${req.file.filename}`;

        // Optional gallery category — "COMPONENT" or "SAMPLE" (default).
        const category = req.body.category === 'COMPONENT' ? 'COMPONENT' : 'SAMPLE';

        const image = await prisma.reportImage.create({
            data: {
                reportId,
                url: imageUrl,
                caption: (req.body.caption || '').toString(),
                category,
            }
        });

        res.status(201).json(image);
    } catch (e) {
        next(e);
    }
};

exports.deleteReportImage = async (req, res, next) => {
    const imageId = parseInt(req.params.imageId, 10);

    if (!Number.isInteger(imageId)) {
        return res.status(400).json({ error: 'Invalid imageId.' });
    }

    try {
        // 1. Find the image in the DB
        const image = await prisma.reportImage.findUnique({
            where: { id: imageId }
        });

        if (!image) {
            return res.status(404).json({ error: 'Image not found' });
        }

        // 2. Delete the file — resolve against the uploads dir and verify the
        //    result stays inside it (guards against a tampered url in the DB).
        const filePath = path.resolve(UPLOAD_DIR, path.basename(image.url));
        if (filePath.startsWith(UPLOAD_DIR) && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // 3. Delete the record from the DB
        await prisma.reportImage.delete({
            where: { id: imageId }
        });

        res.json({ message: 'Image deleted successfully' });
    } catch (e) {
        next(e);
    }
};
