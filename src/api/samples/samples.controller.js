// src/api/samples/samples.controller.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllSamples = async (req, res) => {
    const { status } = req.query; // <-- Get the status from query params

    try {
        // --- Build the WHERE clause ---
        let whereClause = {};
        if (status) {
            // This filters the samples based on their related Report's status
            whereClause = {
                Report: {
                    status: status.toUpperCase() // e.g., 'SUBMITTED'
                }
            };
        }
        // ----------------------------

        const samples = await prisma.sample.findMany({
            where: whereClause, // <-- Apply the filter
            include: {
                order: true,
                Report: {
                    select: {
                        status: true,
                        id: true
                    }
                }
            },
            orderBy: {
                id: 'desc'
            }
        });
        res.json(samples);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to fetch samples" });
    }
};