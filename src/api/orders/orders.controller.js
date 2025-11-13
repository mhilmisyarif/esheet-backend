const { PrismaClient } = require('@prisma/client');
const { parseLabCodeFromOrder } = require('../../utils/order.parser');
const prisma = new PrismaClient();

exports.createOrder = async (req, res) => {
    const { order_no, applicant, address } = req.body;
    const labCode = parseLabCodeFromOrder(order_no);

    if (!labCode) {
        return res.status(400).json({ error: 'Invalid order_no format. Cannot detect lab code.' });
    }

    const lab = await prisma.lab.findUnique({ where: { lab_code: labCode } });
    if (!lab) {
        return res.status(404).json({ error: `Lab with code ${labCode} not found.` });
    }

    try {
        const order = await prisma.order.create({
            data: {
                order_no: order_no,
                applicant: applicant,
                address: address,
                labId: lab.id,
            },
        });
        res.status(201).json(order);
    } catch (e) {
        res.status(500).json({ error: 'Failed to create order.' });
    }
};

exports.getOrder = async (req, res) => {
    const { id } = req.params;
    try {
        const order = await prisma.order.findUnique({
            where: { id: parseInt(id, 10) },
            include: {
                Samples: { // Include the samples for this order
                    include: {
                        testStandard: true // And the standard for each sample
                    }
                }
            }
        });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch order' });
    }
};