const fs = require('fs');
const path = require('path');
const prisma = require('../../lib/prisma');
const { getTargetImageDirectory } = require('../../lib/storageHelper');

exports.uploadReportImage = async (req, res, next) => {
    const reportId = parseInt(req.params.reportId, 10);

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }
    if (!Number.isInteger(reportId)) {
        return res.status(400).json({ error: 'Invalid reportId.' });
    }

    try {
        // 1. Fetch report details from Prisma to determine Lab & Order info
        const report = await prisma.report.findUnique({
            where: { id: reportId },
            // include: { lab: true, client: true } // Adjust according to your Prisma schema
        });

        if (!report) {
            return res.status(404).json({ error: 'Report not found.' });
        }

        // Extract parameters (replace these with your actual database fields or req.body fallbacks)
        const labId = req.body.labId || report.labId || 1;
        const orderFolderName = req.body.orderFolderName || report.orderNumber || 'DEFAULT-ORDER';

        // 2. Get the dynamically created directory path
        const targetDirectory = getTargetImageDirectory(labId, orderFolderName, new Date());

        // 3. Move the uploaded file from temp storage to the server target directory
        const destinationPath = path.join(targetDirectory, req.file.filename);
        fs.renameSync(req.file.path, destinationPath);

        // 4. Save record into database
        const category = req.body.category === 'COMPONENT' ? 'COMPONENT' : 'SAMPLE';

        const image = await prisma.reportImage.create({
            data: {
                reportId,
                url: destinationPath, // Stores full destination path
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

        // 2. Delete the physical file if it exists
        if (image.url && fs.existsSync(image.url)) {
            fs.unlinkSync(image.url);
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