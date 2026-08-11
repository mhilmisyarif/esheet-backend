const prisma = require('../../lib/prisma');
const { parseLabCodeFromOrder } = require('../../utils/order.parser');

exports.createFullReportWorkflow = async (req, res) => {
    const {
        order_no,
        applicant,
        applicant_address,
        iwo_no,
        testStandardId,
        brand,
        model,
        factory,
        factory_address,
        country_origin,
        received_date, // tanggal masuk sampel (ISO date string)
        testingType, // "FULL" or "VERIFICATION"
        selectedClauses, // ["5", "7"]
    } = req.body;

    // Validate received_date when provided
    let receivedDate = null;
    if (received_date) {
        receivedDate = new Date(received_date);
        if (isNaN(receivedDate.getTime())) {
            return res.status(400).json({ error: 'received_date bukan tanggal yang valid.' });
        }
    }

    const technicianId = req.user.id;

    // 1. Validate Lab
    const labCode = parseLabCodeFromOrder(order_no);
    if (!labCode) {
        return res.status(400).json({ error: 'Invalid order_no format.' });
    }
    const lab = await prisma.lab.findUnique({ where: { lab_code: labCode } });
    if (!lab) {
        return res.status(404).json({ error: `Lab with code ${labCode} not found.` });
    }

    // 2. Validate Standard
    const standard = await prisma.testStandard.findUnique({
        where: { id: testStandardId }
    });
    if (!standard) {
        return res.status(404).json({ error: 'TestStandard not found.' });
    }

    // 3. Get Report Data (Full or Verification)
    const fullTemplateData = standard.template_data;
    if (!Array.isArray(fullTemplateData)) {
        return res.status(422).json({
            error: `Template standar "${standard.name}" rusak (bukan array klausul) — perbaiki di Manage Standards.`,
        });
    }
    let reportData;
    if (testingType === 'VERIFICATION') {
        if (!Array.isArray(selectedClauses) || selectedClauses.length === 0) {
            return res.status(400).json({ error: 'selectedClauses wajib diisi untuk pengujian VERIFICATION.' });
        }
        reportData = fullTemplateData.filter(k => selectedClauses.includes(k.klausul));
    } else {
        reportData = fullTemplateData;
    }

    // 4. Run as a Transaction
    try {
        const newReport = await prisma.$transaction(async (tx) => {
            // a. Create or find the Order
            const order = await tx.order.upsert({
                where: { order_no: order_no },
                update: { applicant: applicant, address: applicant_address },
                create: {
                    order_no: order_no,
                    applicant: applicant,
                    address: applicant_address,
                    labId: lab.id,
                },
            });

            // b. Create the Sample
            const sample = await tx.sample.create({
                data: {
                    orderId: order.id,
                    testStandardId: standard.id,
                    iwo_no: iwo_no,
                    name: standard.name, // Use standard's name as sample name
                    brand: brand,
                    model: model,
                    factory: factory,
                    factory_address: factory_address,
                    country_origin: country_origin,
                    received_date: receivedDate,
                },
            });

            // c. Create the Report
            const report = await tx.report.create({
                data: {
                    sampleId: sample.id,
                    technicianId: technicianId,
                    status: 'DRAFT',
                    testing_type: testingType,
                    data: reportData,
                },
            });

            return report;
        });

        res.status(201).json(newReport);

    } catch (e) {
        console.error("Workflow error:", e);
        res.status(500).json({ error: 'Failed to create report workflow.' });
    }
};