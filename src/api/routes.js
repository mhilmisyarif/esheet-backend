const express = require('express');
const router = express.Router();

const labsRouter = require('./labs/labs.routes');
const ordersRouter = require('./orders/orders.routes');
const reportsRouter = require('./reports/reports.routes');
const samplesRouter = require('./samples/samples.routes');
const workflowRouter = require('./workflow/workflow.routes');
const authRouter = require('./auth/auth.routes');
const usersRouter = require('./users/users.routes');
const notificationsRouter = require('./notifications/notifications.routes');
const uploadRouter = require('./uploads/upload.routes');
const standardsRouter = require('./standards/standards.routes');
const clauseTablesRouter = require('./clause-tables/clause-tables.routes');
const tableTemplatesRouter = require('./table-templates/table-templates.routes');
const tableInstancesRouter = require('./table-instances/table-instances.routes');
const componentsRouter = require('./components/components.routes');

router.use('/labs', labsRouter);
router.use('/orders', ordersRouter);
router.use('/reports', reportsRouter);
router.use('/samples', samplesRouter);
router.use('/workflow', workflowRouter);
router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/notifications', notificationsRouter);
router.use('/uploads', uploadRouter);
router.use('/standards', standardsRouter);

// /api/clause-tables/:tableId
router.use('/clause-tables', clauseTablesRouter);

// /api/table-templates/:id  (GET, PUT, DELETE single template)
router.use('/table-templates', tableTemplatesRouter);

// /api/table-instances/:id  (PUT, DELETE single instance)
router.use('/table-instances', tableInstancesRouter);

// /api/components/:id  (DELETE single component)
router.use('/components', componentsRouter);

module.exports = router;
