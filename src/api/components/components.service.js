const prisma = require('../../lib/prisma');

/** All components recorded for a sample. */
function listBySample(sampleId) {
    return prisma.component.findMany({
        where: { sampleId },
        orderBy: { id: 'asc' },
    });
}

/** Create a component for a sample. */
function createForSample(sampleId, data) {
    const clean = (v) => {
        const t = (v ?? '').toString().trim();
        return t.length ? t : null;
    };
    return prisma.component.create({
        data: {
            sampleId,
            objek: clean(data.objek),
            pabrikan: clean(data.pabrikan),
            tipe: clean(data.tipe),
            data_teknis: clean(data.data_teknis),
            standar: clean(data.standar),
            tanda: clean(data.tanda),
        },
    });
}

/** Delete a component by id. */
function remove(id) {
    return prisma.component.delete({ where: { id } });
}

module.exports = { listBySample, createForSample, remove };
