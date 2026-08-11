// scripts/seed-example-templates.js
//
// Attaches the two example appendix-table templates (Komponen, Dimensi) to a
// TestStandard so you can see them end-to-end in TemplateBuilder, the klausul
// editor, the datasheet PDF and the draft DOCX.
//
// Usage:
//   node scripts/seed-example-templates.js                       # default standard
//   node scripts/seed-example-templates.js "Lampu LED Swa-Balast"
//
// Idempotent-ish: skips a template if one already exists for the same
// (testStandardId, subClauseCode, title).

const prisma = require('../src/lib/prisma');
const { KOMPONEN, DIMENSI } = require('../prisma/example-table-templates');

async function main() {
    const standardName = process.argv[2] || 'Lampu LED Swa-Balast';

    const standard = await prisma.testStandard.findUnique({ where: { name: standardName } });
    if (!standard) {
        console.error(`Standar "${standardName}" tidak ditemukan. Jalankan seed utama dulu, atau beri nama standar yang benar sebagai argumen.`);
        process.exit(1);
    }

    // Template creator (createdById is required). Prefer an ENGINEER; fall
    // back to any user. Avoids referencing the ADMIN enum literal so this
    // works even before the re-add-ADMIN migration is applied.
    const author =
        (await prisma.user.findFirst({ where: { role: 'ENGINEER' }, select: { id: true, name: true } })) ||
        (await prisma.user.findFirst({ select: { id: true, name: true } }));
    if (!author) {
        console.error('Tidak ada user untuk createdById. Jalankan seed user dulu.');
        process.exit(1);
    }

    for (const tpl of [KOMPONEN, DIMENSI]) {
        const exists = await prisma.tableTemplate.findFirst({
            where: { testStandardId: standard.id, subClauseCode: tpl.subClauseCode, title: tpl.title },
        });
        if (exists) {
            console.log(`↷ Lewati (sudah ada): ${tpl.title} @ ${tpl.subClauseCode}`);
            continue;
        }
        await prisma.tableTemplate.create({
            data: {
                testStandardId: standard.id,
                subClauseCode: tpl.subClauseCode,
                title: tpl.title,
                order: 0,
                definition: tpl.definition,
                createdById: author.id,
            },
        });
        console.log(`✓ Dibuat: ${tpl.title} @ klausul ${tpl.subClauseCode} (standar "${standardName}")`);
    }

    console.log('Selesai. Buka report standar ini → isi tabel di klausul terkait → download datasheet/draft.');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
