const { PrismaClient } = require('@prisma/client');
const klausulData = require('./klausul_dummy_per_butir.json');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding ...');

    // 1. Seed Labs (Q2)
    const lab04 = await prisma.lab.upsert({
        where: { lab_code: '04' },
        update: {},
        create: {
            lab_code: '04',
            name: 'PENCAHAYAAN',
        },
    });
    // ... create other labs ...
    console.log('Seeded labs...');

    // 2. Seed Test Standard (this code already exists)
    await prisma.testStandard.upsert({
        where: { name: 'Lampu LED Swa-Balast' },
        update: {},
        create: {
            name: 'Lampu LED Swa-Balast',
            labId: lab04.id,
            template_data: klausulData,
        },
    });
    console.log('Seeded test standards...');

    // --- ADD ALL THE CODE BELOW THIS LINE ---

    // 3. Seed a Test User (Technician)
    console.log('Seeding users...');
    const techUser = await prisma.user.upsert({
        where: { email: 'afif.zainullah@sucofindo.com' },
        update: {},
        create: {
            email: 'afif.zainullah@sucofindo.com',
            name: 'Afif Iskayana Zainullah', // From example doc [cite: 4]
            role: 'TECHNICIAN',
            password_hash: await bcrypt.hash('sucofindo123', 10),
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
            password_hash: await bcrypt.hash('sucofindo123', 10),
        },
    });

    // 4. Seed an Order (using data from the docx [cite: 3])
    console.log('Seeding orders and samples...');
    const lab04_db = await prisma.lab.findUnique({ where: { lab_code: '04' } });

    const order1 = await prisma.order.upsert({
        where: { order_no: 'CBT/3801/20-104-01/000038/01/2025-1' }, // A unique order number
        update: {},
        create: {
            order_no: 'CBT/3801/20-104-01/000038/01/2025-1', // Using a realistic one
            labId: lab04_db.id,
            applicant: 'PT MEGA CAKRA NUSANTARA',
            address: 'SOVOISM OFFICE BUILDING JL DR CIPTO NO 20, Semarang',
        },
    });

    // 5. Seed a Sample (using data from the docx [cite: 3, 4])
    const ledStandard = await prisma.testStandard.findUnique({
        where: { name: 'Lampu LED Swa-Balast' },
    });

    const sample1 = await prisma.sample.upsert({
        where: { id: 1 }, // Using a simple ID for the first sample
        update: {},
        create: {
            orderId: order1.id,
            testStandardId: ledStandard.id,
            iwo_no: 'SER.IWO.25.6981', // From your project brief
            name: 'Lampu LED Swa-balast',
            brand: 'KISEKI',
            model: 'CKLB 13W',
        },
    });

    // 6. Seed a Draft Report for that Sample
    console.log('Seeding draft report...');
    await prisma.report.upsert({
        where: { sampleId: sample1.id },
        update: {},
        create: {
            sampleId: sample1.id,
            technicianId: techUser.id,
            engineerId: enginnerUser.id,
            status: 'DRAFT',
            testing_type: 'FULL',
            // Copy the template from the standard into the report
            data: ledStandard.template_data,
        },
    });
    // ... create other standards ...
    console.log('Seeded test standards...');

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