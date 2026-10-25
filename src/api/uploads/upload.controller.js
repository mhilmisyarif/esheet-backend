const fs = require('fs');
const path = require('path');
const prisma = require('../../lib/prisma');
const { getTargetImageDirectory, isNetworkStorage, SERVER_BASE_PATH } = require('../../lib/storageHelper');

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Map a stored image url back to a file on disk (legacy rows hold absolute paths).
function resolveStoredFile(url) {
    if (!url) return null;
    if (url.startsWith('/uploads/')) return path.join(UPLOAD_DIR, path.basename(url));
    if (url.startsWith('/files/') && SERVER_BASE_PATH) {
        return path.join(SERVER_BASE_PATH, url.slice('/files/'.length));
    }
    return url;
}

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

        let url = `/uploads/${req.file.filename}`;

        if (isNetworkStorage()) {
            const labId = req.body.labId || report.labId || 1;
            const orderFolderName = req.body.orderFolderName || report.orderNumber || 'DEFAULT-ORDER';
            const targetDirectory = getTargetImageDirectory(labId, orderFolderName, new Date());
            const destinationPath = path.join(targetDirectory, req.file.filename);
            // copy + unlink: rename fails across devices (EXDEV)
            fs.copyFileSync(req.file.path, destinationPath);
            fs.unlinkSync(req.file.path);
            url = '/files/' + path.relative(SERVER_BASE_PATH, destinationPath).split(path.sep).join('/');
        }

        // 4. Save record into database
        const category = req.body.category === 'COMPONENT' ? 'COMPONENT' : 'SAMPLE';

        const image = await prisma.reportImage.create({
            data: {
                reportId,
                url,
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
        try {
            const file = resolveStoredFile(image.url);
            if (file && fs.existsSync(file)) fs.unlinkSync(file);
        } catch (err) {
            console.warn('Could not delete image file:', err.message);
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