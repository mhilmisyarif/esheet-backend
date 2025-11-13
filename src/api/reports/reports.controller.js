const { PrismaClient } = require('@prisma/client');
const { isReportComplete } = require('../../services/report.validator');
const { generateReportDocx } = require('../../services/report.generator');
const prisma = new PrismaClient();

// (Step 3) Create a new draft report from a sample
exports.createReport = async (req, res) => {
    const {
        sampleId,
        technicianId,
        testingType, // "FULL" or "VERIFICATION"
        selectedClauses // e.g., ["5", "7", "11"] (only for VERIFICATION)
    } = req.body;

    try {
        // 1. Find the sample and its TestStandard template
        const sample = await prisma.sample.findUnique({
            where: { id: parseInt(sampleId, 10) },
            include: { testStandard: true },
        });
        if (!sample) {
            return res.status(404).json({ error: 'Sample not found.' });
        }

        // 2. Get the full template data
        const fullTemplateData = sample.testStandard.template_data;
        let reportData;

        // 3. Filter data based on testing type
        if (testingType === 'VERIFICATION') {
            if (!selectedClauses || !Array.isArray(selectedClauses)) {
                return res.status(400).json({ error: '`selectedClauses` array is required for Verification testing.' });
            }
            // Filter the full template to only include selected clauses
            reportData = fullTemplateData.filter(klausul =>
                selectedClauses.includes(klausul.klausul) // 'klausul.klausul' is the clause number, e.g., "5"
            );
        } else {
            // For "FULL" testing, use the complete template
            reportData = fullTemplateData;
        }

        // 4. Create the report
        const report = await prisma.report.create({
            data: {
                sampleId: sample.id,
                technicianId: parseInt(technicianId, 10),
                status: 'DRAFT',
                testing_type: testingType === 'VERIFICATION' ? 'VERIFICATION' : 'FULL',
                data: reportData, // Store the full or filtered JSON
            },
        });

        res.status(201).json(report);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to create report.' });
    }
};

// (Step 4) Get a single report for the editor
exports.getReport = async (req, res) => {
    const { id } = req.params;
    const report = await prisma.report.findUnique({
        where: { id: parseInt(id, 10) },
        include: {
            sample: { // Include sample info for the header
                include: {
                    order: true // And order info
                }
            }
        },
    });
    if (!report) {
        return res.status(404).json({ error: 'Report not found' });
    }
    res.json(report);
};

// (Step 4) The "Autosave" endpoint
exports.updateReportData = async (req, res) => {
    const { id } = req.params;
    const { data } = req.body; // `data` is the full klausul JSON

    if (!data) {
        return res.status(400).json({ error: '`data` (JSON) is required.' });
    }
    try {
        const updatedReport = await prisma.report.update({
            where: { id: parseInt(id, 10) },
            data: { data: data }, // Overwrite the JSONB field
        });
        res.json({ message: 'Autosave successful' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save report.' });
    }
};

// (Step 5) The "Submit" endpoint
exports.submitReport = async (req, res) => {
    const { id } = req.params;
    const report = await prisma.report.findUnique({
        where: { id: parseInt(id, 10) },
    });
    if (!report) {
        return res.status(404).json({ error: 'Report not found.' });
    }

    const complete = isReportComplete(report.data);
    if (!complete) {
        return res.status(400).json({
            error: 'Report is incomplete. Please fill all required fields.',
        });
    }

    const submittedReport = await prisma.report.update({
        where: { id: parseInt(id, 10) },
        data: {
            status: 'SUBMITTED',
            submitted_at: new Date(),
        },
    });
    res.json(submittedReport);
};

// Gets a report using the Sample ID
exports.getReportBySampleId = async (req, res) => {
    const { sampleId } = req.params;
    const report = await prisma.report.findUnique({
        where: { sampleId: parseInt(sampleId, 10) }, // Find by sampleId
        include: {
            sample: { include: { order: true } },
            ReportImages: true
        },
    });
    if (!report) {
        // This is okay, it might just not be created yet
        return res.status(404).json({ error: 'Report not found for this sample.' });
    }
    res.json(report);
};

// POST /api/reports/:id/approve
exports.approveReport = async (req, res) => {
    const { id } = req.params;
    const engineerId = req.user.id; // Get ID from logged-in engineer

    try {
        const report = await prisma.report.findUnique({ where: { id: parseInt(id) } });

        // Only an engineer can approve a "SUBMITTED" report
        if (report.status !== 'SUBMITTED') {
            return res.status(400).json({ error: `Report is not in SUBMITTED state. Current state: ${report.status}` });
        }

        const approvedReport = await prisma.report.update({
            where: { id: parseInt(id) },
            data: {
                status: 'APPROVED',
                approved_at: new Date(),
                engineerId: engineerId,
            },
        });
        res.json(approvedReport);

    } catch (e) {
        res.status(500).json({ error: 'Failed to approve report.' });
    }
};

// POST /api/reports/:id/reject
exports.rejectReport = async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const engineerId = req.user.id;

    if (!reason) {
        return res.status(400).json({ error: 'A "reason" for rejection is required.' });
    }

    try {
        const report = await prisma.report.findUnique({ where: { id: parseInt(id) } });

        if (report.status !== 'SUBMITTED') {
            return res.status(400).json({ error: `Report is not in SUBMITTED state. Current state: ${report.status}` });
        }

        const rejectedReport = await prisma.report.update({
            where: { id: parseInt(id) },
            data: {
                status: 'DRAFT', // <-- Set back to DRAFT so technician can fix it
                rejection_reason: reason,
                engineerId: engineerId, // Log who rejected it
            },
        });
        res.json(rejectedReport);

    } catch (e) {
        res.status(500).json({ error: 'Failed to reject report.' });
    }
};

// GET /api/reports/:id/download
exports.downloadReport = async (req, res) => {
    const { id } = req.params;
    try {
        // Fetch the full report with all relations
        const report = await prisma.report.findUnique({
            where: { id: parseInt(id) },
            include: {
                sample: { include: { order: true } },
                ReportImages: true,
            }
        });

        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        if (report.status !== 'APPROVED') {
            return res.status(403).json({ error: 'Report must be in APPROVED state to download.' });
        }

        // Generate the DOCX buffer
        const buffer = await generateReportDocx(report);

        // Set headers to trigger browser download
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="LHU-${report.sample.model}-${report.id}.docx"`
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );

        res.send(buffer);

    } catch (e) {
        console.error('Download error:', e);
        res.status(500).json({ error: 'Failed to generate report.' });
    }
};