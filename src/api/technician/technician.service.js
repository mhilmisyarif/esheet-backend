// src/api/technician/technician.service.js
const prisma = require('../../lib/prisma');

/**
 * Get a list of technicians with optional status and lab filtering
 * @param {object} query - Query parameters (status, labId, search)
 */
const getAllTechnicians = async (query = {}) => {
    const { status, labId, search } = query;

    const where = {};

    // Filter by status if provided
    if (status) {
        where.status = status;
    }

    // Convert labId string to Integer for Prisma compatibility
    if (labId !== undefined && labId !== null && labId !== '') {
        const parsedLabId = parseInt(labId, 10);
        if (!isNaN(parsedLabId)) {
            where.labId = parsedLabId;
        }
    }

    // Optional search filter
    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { technician_id: { contains: search, mode: 'insensitive' } },
        ];
    }

    return await prisma.technician.findMany({
        where,
        include: {
            lab: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
};

/**
 * Get single technician by ID
 */
const getTechnicianById = async (id) => {
    return await prisma.technician.findUnique({
        where: { id },
        include: {
            lab: true,
        },
    });
};

/**
 * Create a new technician record
 */
const createTechnician = async (data) => {
    return await prisma.technician.create({
        data: {
            technician_id: data.id,
            name: data.name,
            labId: data.labId ? parseInt(data.labId, 10) : null,
            status: data.status || 'ACTIVE',
        },
    });
};

/**
 * Update technician details
 */
const updateTechnician = async (id, data) => {
    const payload = { ...data };
    if (payload.labId !== undefined) {
        payload.labId = payload.labId ? parseInt(payload.labId, 10) : null;
    }

    return await prisma.technician.update({
        where: { id },
        data: payload,
    });
};

/**
 * Delete a technician record
 */
const deleteTechnician = async (id) => {
    return await prisma.technician.delete({
        where: { id },
    });
};

module.exports = {
    getAllTechnicians,
    getTechnicianById,
    createTechnician,
    updateTechnician,
    deleteTechnician,
};