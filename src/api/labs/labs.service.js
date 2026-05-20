const prisma = require('../../lib/prisma');

async function getAllLabs() {
    return prisma.lab.findMany({
        include: { TestStandards: true },
        orderBy: { lab_code: 'asc' },
    });
}

async function getLabById(id) {
    return prisma.lab.findUnique({
        where: { id },
        include: { TestStandards: true },
    });
}

module.exports = { getAllLabs, getLabById };