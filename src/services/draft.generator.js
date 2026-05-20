/**
 * src/services/draft.generator.js
 *
 * Generates the DRAFT document — the existing Word format with clause table,
 * summary, signatures, and images. Now also shows per-klausul status indicators.
 *
 * This is a rename + light update of the previous report.generator.js.
 * The heavy lifting (docxtemplater + docx merge) is unchanged.
 * New: klausulStatuses are passed in and used to mark which clauses are
 * approved vs still under review in the Draft output.
 */

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const ImageModule = require('docxtemplater-image-module-free');
const fs = require('fs');
const path = require('path');
const { getClauseTablesGrouped } = require('../api/clause-tables/clause-tables.service');
const { getInstancesGrouped } = require('../api/table-instances/table-instances.service');

const {
    Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
    AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
} = require('docx');

const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
    });
};

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const MARGINS = { top: 60, bottom: 60, left: 100, right: 100 };

function buildWordTable(clauseTable) {
    const { title, headers, rows, notes } = clauseTable;
    const totalWidth = 9026;
    const colCount = headers.length || 1;
    const colWidth = Math.floor(totalWidth / colCount);
    const columnWidths = headers.map((_, i) =>
        i === headers.length - 1 ? totalWidth - colWidth * (headers.length - 1) : colWidth
    );

    const headerRow = new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => new TableCell({
            borders: BORDERS, margins: MARGINS,
            width: { size: columnWidths[i], type: WidthType.DXA },
            shading: { fill: 'D9D9D9', type: ShadingType.CLEAR },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: h, bold: true, size: 18, font: 'Arial' })],
            })],
        })),
    });

    const dataRows = (rows || []).map(row => new TableRow({
        children: headers.map((_, i) => new TableCell({
            borders: BORDERS, margins: MARGINS,
            width: { size: columnWidths[i], type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({
                    text: String(Array.isArray(row) ? (row[i] ?? '') : ''),
                    size: 18, font: 'Arial',
                })],
            })],
        })),
    }));

    const elements = [];
    if (title) {
        elements.push(new Paragraph({
            children: [new TextRun({ text: title, bold: true, size: 20, font: 'Arial' })],
            spacing: { before: 120, after: 60 },
        }));
    }
    elements.push(new Table({ width: { size: totalWidth, type: WidthType.DXA }, columnWidths, rows: [headerRow, ...dataRows] }));
    if (notes?.trim()) {
        elements.push(new Paragraph({
            children: [new TextRun({ text: `Catatan: ${notes}`, italics: true, size: 18, font: 'Arial' })],
            spacing: { before: 60, after: 120 },
        }));
    }
    elements.push(new Paragraph({ children: [] }));
    return elements;
}

function buildAppendix(groupedTables, reportData) {
    const titleMap = {};
    (reportData || []).forEach(k => {
        titleMap[k.klausul] = k.judul || '';
        (k.sub_klausul || []).forEach(s => { titleMap[s.kode] = s.judul || ''; });
    });

    const elements = [new Paragraph({
        pageBreakBefore: true,
        children: [new TextRun({ text: 'LAMPIRAN TABEL', bold: true, size: 24, font: 'Arial' })],
        spacing: { after: 240 },
    })];

    Object.entries(groupedTables).forEach(([clauseCode, tables]) => {
        const clauseTitle = titleMap[clauseCode]
            ? `Klausul ${clauseCode} — ${titleMap[clauseCode]}`
            : `Klausul ${clauseCode}`;
        elements.push(new Paragraph({
            children: [new TextRun({ text: clauseTitle, bold: true, size: 20, font: 'Arial' })],
            spacing: { before: 200, after: 80 },
        }));
        tables.forEach(t => buildWordTable(t).forEach(el => elements.push(el)));
    });
    return elements;
}

async function generateDraftDocx(report, klausulStatuses = {}) {
    const { sample, technician, engineer, ReportImages } = report;
    const { order } = sample;

    const groupedTables = await getClauseTablesGrouped(report.id);

    // Build clause result map
    const clauseResultMap = {};
    (report.data || []).forEach(k => {
        const decisions = [];
        (k.sub_klausul || []).forEach(s => (s.butir || []).forEach(b => decisions.push(b.keputusan)));
        if (decisions.includes('G')) clauseResultMap[k.klausul] = 'G';
        else if (decisions.every(d => d === 'TB')) clauseResultMap[k.klausul] = 'TB';
        else clauseResultMap[k.klausul] = 'L';
    });

    // Filter tables: only include for L clauses
    const tablesForAppendix = {};
    Object.entries(groupedTables).forEach(([code, tables]) => {
        if (clauseResultMap[code] === 'L') tablesForAppendix[code] = tables;
    });

    // Build details + summary — now with per-klausul approval status
    const details = [];
    const summary = [];

    (report.data || []).forEach(k => {
        const kStatus = klausulStatuses[k.klausul];
        const statusLabel = kStatus
            ? { APPROVED: '✓ Disetujui', SUBMITTED: '⌛ Direview', DRAFT: '✎ Draft' }[kStatus.status] || ''
            : '';

        details.push({
            code: k.klausul,
            text: k.judul ? k.judul.toUpperCase() : '',
            note: statusLabel,
            result: '',
            is_header: true,
        });

        const subDecisions = [];
        (k.sub_klausul || []).forEach(sub => {
            sub.butir.forEach(b => {
                const isCorrected = b.is_corrected && b.original_keputusan;

                details.push({
                    code: b.kode,
                    text: b.teks,
                    // Show correction in the note column as plain text
                    note: isCorrected
                        ? `${b.hasil_catatan || ''} [Koreksi: ${b.original_keputusan} → ${b.keputusan}]`.trim()
                        : b.hasil_catatan || '-',
                    result: b.keputusan || '-',
                    is_header: false,
                });

                subDecisions.push(b.keputusan);
            });
        });

        let clauseStatus = 'L';
        if (subDecisions.includes('G')) clauseStatus = 'G';
        else if (subDecisions.every(d => d === 'TB')) clauseStatus = 'TB';

        summary.push({
            clause: k.klausul,
            title: k.judul ? k.judul.toUpperCase() : '',
            status: clauseStatus,
        });
    });

    // Image paths
    const getValidPath = (url) => {
        if (!url) return null;
        const p = path.join(process.cwd(), url);
        return fs.existsSync(p) ? p : null;
    };
    let productImgPath = null, markingImgPath = null;
    if (ReportImages?.length > 0) {
        if (ReportImages[0]) productImgPath = getValidPath(ReportImages[0].url);
        if (ReportImages[1]) markingImgPath = getValidPath(ReportImages[1].url);
    }

    const imageOpts = {
        centered: false, fileType: 'docx',
        getImage: (v) => { if (!v) return Buffer.alloc(0); return fs.readFileSync(v); },
        getSize: () => [300, 200],
    };

    const content = fs.readFileSync(
        path.resolve(__dirname, '../templates/FULL-LED SWABALAST.docx'), 'binary'
    );
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true, linebreaks: true,
        modules: [new ImageModule(imageOpts)],
    });

    // Use doc_* metadata if filled by drafter, fall back to order fields
    doc.render({
        applicant: report.doc_applicant || order.applicant || '-',
        applicant_address: report.doc_address || order.applicant_address || '-',
        merk: sample.brand,
        model: sample.model,
        factory: order.factory || '-',
        factory_address: order.factory_address || '-',
        marking: order.marking || '-',
        date_received: formatDate(order.createdAt),
        date_testing: `${formatDate(order.createdAt)} - ${formatDate(new Date())}`,
        bapc_number: sample.iwo_no || '-',
        order_number: order.order_no,
        bapc_title: 'Kode Contoh / No. BAPC',
        iwo_or_duty_letter: `IWO No. ${sample.iwo_no || '-'}`,
        marking_voltage: '', marking_freq: '', marking_power: '',
        clause_title: 'KLAUSUL',
        result_title: 'KEPUTUSAN',
        testing_type: report.testing_type || 'FULL',
        technician_name: technician ? technician.name : '-',
        engineer_name: engineer ? engineer.name : '-',
        approval_name: engineer ? engineer.name : '-',
        details, summary,
        image_product: productImgPath,
        image_component_product: productImgPath,
        marking_image: markingImgPath,
        if_not_pass: details.some(d => d.result === 'G' || d.result?.includes('→')) ? 'TIDAK' : '',
    });

    const mainBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    if (Object.keys(tablesForAppendix).length === 0) return mainBuffer;

    const appendixElements = buildAppendix(tablesForAppendix, report.data);
    const appendixDoc = new Document({ sections: [{ children: appendixElements }] });
    const appendixBuffer = await Packer.toBuffer(appendixDoc);

    const mainZip = new PizZip(mainBuffer);
    const appendixZip = new PizZip(appendixBuffer);
    const appendixDocXml = appendixZip.file('word/document.xml').asText();
    const appendixBodyMatch = appendixDocXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
    if (appendixBodyMatch) {
        let appendixBody = appendixBodyMatch[1].replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/g, '');
        const mainDocXml = mainZip.file('word/document.xml').asText();
        mainZip.file('word/document.xml', mainDocXml.replace(/(<\/w:body>)/, `${appendixBody}$1`));
    }
    return mainZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { generateDraftDocx };
