const prisma = require('../../lib/prisma');
const { parseLabCodeFromOrder } = require('../../utils/order.parser');

/**
 * Creates a new order. The lab is derived from the order_no
 * (e.g. "CBT/3801/20-104-04/000038/01/2026-1" → lab_code "04").
 */
async function createOrder({ order_no, applicant, address }) {
    const labCode = parseLabCodeFromOrder(order_no);
    if (!labCode) {
        const err = new Error('Invalid order_no format — expected segment like "20-104-04".');
        err.statusCode = 400;
        throw err;
    }

    const lab = await prisma.lab.findUnique({ where: { lab_code: labCode } });
    if (!lab) {
        const err = new Error(`Lab with code ${labCode} not found.`);
        err.statusCode = 404;
        throw err;
    }

    return prisma.order.create({
        data: {
            order_no,
            applicant: applicant || null,
            address: address || null,
            labId: lab.id,
        },
    });
}

/**
 * Fetches an order by ID, including its lab and samples.
 */
async function getOrderById(id) {
    if (!Number.isInteger(id)) return null;
    return prisma.order.findUnique({
        where: { id },
        include: {
            lab: true,
            Samples: {
                include: {
                    testStandard: { select: { id: true, name: true } },
                    Report: { select: { id: true, status: true } },
                },
            },
        },
    });
}

module.exports = { createOrder, getOrderById };
