const express = require('express');
const router = express.Router();

const labsRouter = require('./labs/labs.routes');
const ordersRouter = require('./orders/orders.routes');
const reportsRouter = require('./reports/reports.routes');
const samplesRouter = require('./samples/samples.routes');
const workflowRouter = require('./workflow/workflow.routes');
const authRouter = require('./auth/auth.routes');
const uploadRouter = require('./uploads/upload.routes');

router.use('/labs', labsRouter);
router.use('/orders', ordersRouter);
router.use('/reports', reportsRouter);
router.use('/samples', samplesRouter);
router.use('/workflow', workflowRouter);
router.use('/auth', authRouter);
router.use('/uploads', uploadRouter);

module.exports = router;