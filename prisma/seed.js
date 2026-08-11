const { PrismaClient } = require('@prisma/client');
const klausulData = require('./klausul_dummy_per_butir.json');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Seed account passwords come from env — never hardcode credentials.
// SEED_USER_PASSWORD  → demo technician & engineer accounts
// ADMIN_SEED_PASSWORD → bootstrap admin (registration is ADMIN-only)
const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD || 'ganti-password-ini';
const ADMIN_SEED_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'ganti-password-ini';

async function main() {
    console.log('Start seeding ...');
    if (!process.env.SEED_USER_PASSWORD || !process.env.ADMIN_SEED_PASSWORD) {
        console.warn(
            '⚠ SEED_USER_PASSWORD / ADMIN_SEED_PASSWORD belum di-set di .env — ' +
            'akun seed memakai password default yang lemah. Ganti segera.'
        );
    }

    // 1. Seed Labs
    const lab04 = await prisma.lab.upsert({
        where: { lab_code: '04' },
        update: {},
        create: {
            lab_code: '04',
            name: 'PENCAHAYAAN (Lighting)',
        },
    });
    console.log('Seeded labs...');

    // 2. Seed Test Standard
    const ledStandard = await prisma.testStandard.upsert({
        where: { name: 'Lampu LED Swa-Balast' },
        update: {},
        create: {
            name: 'Lampu LED Swa-Balast',
            labId: lab04.id,
            template_data: klausulData,
        },
    });
    console.log('Seeded test standards...');

    // 3. Seed a Test User (Technician)
    console.log('Seeding users...');
    const techUser = await prisma.user.upsert({
        where: { email: 'afif.zainullah@sucofindo.com' },
        update: {},
        create: {
            email: 'afif.zainullah@sucofindo.com',
            name: 'Afif Iskayana Zainullah', // From example doc [cite: 4]
            role: 'TECHNICIAN',
            password_hash: await bcrypt.hash(SEED_USER_PASSWORD, 10),
        },
    });

    console.log('Seeding users...');
    const enginnerUser = await prisma.user.upsert({
        where: { email: 'ahmad.fasya@sucofindo.com' },
        update: {},
        create: {
            email: 'ahmad.fasya@sucofindo.com',
            name: 'Ahmad Fasya', // From example doc [cite: 4]
            role: 'ENGINEER',
            password_hash: await bcrypt.hash(SEED_USER_PASSWORD, 10),
        },
    });

    // Bootstrap admin — registration is ADMIN-only, so one admin must exist.
    // Password comes from ADMIN_SEED_PASSWORD env var; CHANGE IT after first login.
    const adminUser = await prisma.user.upsert({
        where: { email: 'admin@sucofindo.com' },
        update: {},
        create: {
            email: 'admin@sucofindo.com',
            name: 'Administrator',
            role: 'ADMIN',
            password_hash: await bcrypt.hash(ADMIN_SEED_PASSWORD, 10),
        },
    });

    // 4. Seed Report 1: DRAFT (Existing)
    const order1 = await prisma.order.upsert({
        where: { order_no: 'CBT/3801/20-104-01/000038/01/2025-1' },
        update: {},
        create: {
            order_no: 'CBT/3801/20-104-01/000038/01/2025-1',
            labId: lab04.id,
            applicant: 'PT MEGA CAKRA NUSANTARA',
            address: 'SOVOISM OFFICE BUILDING JL DR CIPTO NO 20, Semarang',
        },
    });

    const sample1 = await prisma.sample.upsert({
        where: { id: 1 },
        update: {},
        create: {
            orderId: order1.id,
            testStandardId: ledStandard.id,
            iwo_no: 'SER.IWO.25.6981',
            name: 'Lampu LED Swa-balast',
            brand: 'KISEKI',
            model: 'CKLB 13W',
        },
    });

    await prisma.report.upsert({
        where: { sampleId: sample1.id },
        update: {},
        create: {
            sampleId: sample1.id,
            technicianId: techUser.id,
            status: 'DRAFT',
            testing_type: 'FULL',
            data: ledStandard.template_data,
        },
    });

    // 5. Seed Report 2: APPROVED (New)
    const order2 = await prisma.order.upsert({
        where: { order_no: 'CBT/3801/20-104-01/999999/01/2025-1' },
        update: {},
        create: {
            order_no: 'CBT/3801/20-104-01/999999/01/2025-1',
            labId: lab04.id,
            applicant: 'PT SINAR TERANG',
            address: 'Jl. Industri No. 88, Surabaya',
        },
    });

    const sample2 = await prisma.sample.upsert({
        where: { id: 2 },
        update: {},
        create: {
            orderId: order2.id,
            testStandardId: ledStandard.id,
            iwo_no: 'SER.IWO.25.7000',
            name: 'Lampu LED Swa-balast',
            brand: 'PHILLIPS',
            model: 'LED-10W',
        },
    });

    await prisma.report.upsert({
        where: { sampleId: sample2.id },
        update: {},
        create: {
            sampleId: sample2.id,
            technicianId: techUser.id,
            engineerId: enginnerUser.id, // Approved by Ahmad Fasya
            status: 'APPROVED',
            testing_type: 'FULL',
            data: ledStandard.template_data,
            approved_at: new Date('2025-10-06T14:30:00Z'),
        },
    });

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });