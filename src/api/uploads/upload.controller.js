const { PrismaClient } = require('@prisma/client');
const fs = require('fs'); // Node.js File System module
const path = require('path');
const prisma = new PrismaClient();

exports.uploadReportImage = async (req, res) => {
    const { reportId } = req.params;

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
        // req.file.path gives the path. We want to store the URL path.
        // This assumes your server will serve the 'uploads' folder statically.
        const imageUrl = `/uploads/${req.file.filename}`;

        const image = await prisma.reportImage.create({
            data: {
                reportId: parseInt(reportId),
                url: imageUrl,
                caption: '', // Default empty caption
            }
        });

        res.status(201).json(image);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to save image record.' });
    }
};

exports.deleteReportImage = async (req, res) => {
    const { imageId } = req.params;

    try {
        // 1. Find the image in the DB
        const image = await prisma.reportImage.findUnique({
            where: { id: parseInt(imageId) }
        });

        if (!image) {
            return res.status(404).json({ error: 'Image not found' });
        }

        // 2. Delete the file from the server
        // (This constructs the absolute path to the file)
        const filePath = path.join(__dirname, '..', '..', '..', image.url);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // 3. Delete the record from the DB
        await prisma.reportImage.delete({
            where: { id: parseInt(imageId) }
        });

        res.json({ message: 'Image deleted successfully' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete image.' });
    }
};