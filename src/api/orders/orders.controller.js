const { createOrder, getOrderById } = require('./orders.service');

// POST /api/orders
exports.createOrder = async (req, res, next) => {
    const { order_no, applicant, address } = req.body;

    if (!order_no) {
        return res.status(400).json({ error: 'order_no is required.' });
    }

    try {
        const order = await createOrder({ order_no, applicant, address });
        res.status(201).json(order);
    } catch (e) {
        next(e);
    }
};

// GET /api/orders/:id
exports.getOrder = async (req, res, next) => {
    try {
        const order = await getOrderById(parseInt(req.params.id, 10));
        if (!order) return res.status(404).json({ error: 'Order not found.' });
        res.json(order);
    } catch (e) {
        next(e);
    }
};