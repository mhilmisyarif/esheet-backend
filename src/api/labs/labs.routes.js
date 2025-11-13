const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/labs
router.get('/', async (req, res) => {
    try {
        const labs = await prisma.lab.findMany({
            include: { TestStandards: true } // Also get the standards for each lab
        });
        res.json(labs);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch labs' });
    }
});

module.exports = router;