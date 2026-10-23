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
const { getResolvedTablesForReport } = require('./tableRender');

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

const TOTAL_W = 9026;
const RESULT_COLOR = (v) => (v === 'L' ? '007A00' : v === 'G' ? 'FF0000' : '505050');

function txtCell(text, { bold = false, shade = null, color = '000000', align = AlignmentType.CENTER, width } = {}) {
    return new TableCell({
        borders: BORDERS, margins: MARGINS,
        ...(width ? { width: { size: width, type: WidthType.DXA } } : {}),
        ...(shade ? { shading: { fill: shade, type: ShadingType.CLEAR } } : {}),
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
            alignment: align,
            children: [new TextRun({ text: String(text ?? ''), bold, color, size: 18, font: 'Arial' })],
        })],
    });
}

// Build docx elements for one resolved System-A table (key_value + table
// sections with computed/result cells already filled by resolveInstance).
function buildTemplateWordTable(tbl) {
    const elements = [];
    if (tbl.title) {
        elements.push(new Paragraph({
            children: [new TextRun({ text: tbl.title, bold: true, size: 20, font: 'Arial' })],
            spacing: { before: 120, after: 60 },
        }));
    }

    tbl.resolved.sections.forEach((section) => {
        if (section.label) {
            elements.push(new Paragraph({
                children: [new TextRun({ text: section.label, bold: true, size: 18, font: 'Arial' })],
                spacing: { before: 100, after: 40 },
            }));
        }

        if (section.type === 'key_value') {
            const hasResult = section.rows.some((r) => r.result);
            const lw = Math.floor(TOTAL_W * (hasResult ? 0.52 : 0.5));
            const vw = Math.floor(TOTAL_W * (hasResult ? 0.34 : 0.5));
            const rw = TOTAL_W - lw - vw;
            const rows = section.rows.map((r) => new TableRow({
                children: [
                    txtCell(r.label, { shade: 'F2F2F2', align: AlignmentType.LEFT, width: lw }),
                    txtCell(r.value || '-', { align: AlignmentType.LEFT, width: vw }),
                    ...(hasResult ? [txtCell(r.result || '-', { bold: true, color: RESULT_COLOR(r.result), width: rw })] : []),
                ],
            }));
            const columnWidths = hasResult ? [lw, vw, rw] : [lw, vw];
            elements.push(new Table({ width: { size: TOTAL_W, type: WidthType.DXA }, columnWidths, rows }));
        } else if (section.type === 'table') {
            const cols = section.columns;
            const weights = cols.map((c) => (typeof c.width === 'number' && c.width > 0 ? c.width : 100));
            const totalWeight = weights.reduce((s, w) => s + w, 0);
            const columnWidths = weights.map((w) => Math.floor((w / totalWeight) * TOTAL_W));
            const currentSum = columnWidths.slice(0, -1).reduce((s, w) => s + w, 0);
            columnWidths[columnWidths.length - 1] = Math.max(100, TOTAL_W - currentSum);

            const headerRow = new TableRow({
                tableHeader: true,
                children: cols.map((c, i) => txtCell(c.header || '', { bold: true, shade: 'D9D9D9', width: columnWidths[i] })),
            });
            const dataRows = section.rows.map((row) => new TableRow({
                children: cols.map((c, i) => {
                    const val = row.cells[c.id];
                    return c.isResult
                        ? txtCell(val || '-', { bold: true, color: RESULT_COLOR(val), width: columnWidths[i] })
                        : txtCell(val ?? '', { width: columnWidths[i] });
                }),
            }));
            elements.push(new Table({ width: { size: TOTAL_W, type: WidthType.DXA }, columnWidths, rows: [headerRow, ...dataRows] }));

            if (section.footnote) {
                elements.push(new Paragraph({
                    children: [new TextRun({ text: section.footnote, italics: true, size: 16, font: 'Arial' })],
                    spacing: { before: 40, after: 80 },
                }));
            }
        }
    });

    elements.push(new Paragraph({ children: [] }));
    return elements;
}

// Appendix from resolved tables keyed by sub-clause code.
function buildAppendix(resolvedTables, reportData) {
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

    Object.entries(resolvedTables).forEach(([subCode, tables]) => {
        const heading = titleMap[subCode]
            ? `Klausul ${subCode} — ${titleMap[subCode]}`
            : `Klausul ${subCode}`;
        elements.push(new Paragraph({
            children: [new TextRun({ text: heading, bold: true, size: 20, font: 'Arial' })],
            spacing: { before: 200, after: 80 },
        }));
        tables
            .slice()
            .sort((a, b) => a.order - b.order)
            .forEach(t => buildTemplateWordTable(t).forEach(el => elements.push(el)));
    });
    return elements;
}

async function generateDraftDocx(report, klausulStatuses = {}) {
    const { sample, technician, engineer, ReportImages } = report;
    const { order } = sample;

    // Resolved System-A appendix tables, grouped by sub-clause code.
    const tablesForAppendix = await getResolvedTablesForReport(report.id);

    // Build details + summary
    const details = [];
    const summary = [];
    const allFailedCodes = [];
    const hasLetter = (code) => /[a-zA-Z]/i.test(code || '');

    (report.data || []).forEach(k => {
        // Collect decisions and failed items for this clause
        const subDecisions = [];
        const failedItems = [];

        (k.sub_klausul || []).forEach(sub => {
            if (sub.keputusan) subDecisions.push(sub.keputusan);

            const failedButir = (sub.butir || []).filter(b => b.keputusan === 'G');
            if (failedButir.length > 0) {
                failedButir.forEach(b => {
                    failedItems.push({
                        code: sub.kode || b.kode,
                        text: (b.teks || sub.judul || '').trim(),
                        status: 'G',
                    });
                });
            } else if (sub.keputusan === 'G') {
                failedItems.push({
                    code: sub.kode,
                    text: (sub.judul || '').trim(),
                    status: 'G',
                });
            }

            (sub.butir || []).forEach(b => {
                if (b.keputusan) subDecisions.push(b.keputusan);
            });
        });

        // Check if any appendix table for this clause failed
        const clauseTables = Object.entries(tablesForAppendix)
            .filter(([subCode]) => subCode === k.klausul || subCode.startsWith(k.klausul + '.') || subCode.split('.')[0] === k.klausul)
            .flatMap(([, tables]) => tables);

        const failedTables = clauseTables.filter(tbl => {
            return (tbl.resolved?.sections || []).some(sec => {
                if (sec.type === 'key_value') {
                    return (sec.rows || []).some(r => r.result === 'G');
                }
                if (sec.type === 'table') {
                    const resCols = (sec.columns || []).filter(c => c.isResult);
                    return (sec.rows || []).some(row => resCols.some(c => row.cells && row.cells[c.id] === 'G'));
                }
                return false;
            });
        });

        if (failedTables.length > 0) {
            subDecisions.push('G');
            failedTables.forEach(ft => {
                failedItems.push({
                    code: ft.subClauseCode || k.klausul,
                    text: `${ft.title || 'Tabel Lampiran Uji'} (Lampiran ${ft.subClauseCode || k.klausul})`,
                    status: 'G',
                });
            });
        }

        let clauseStatus = 'L';
        if (subDecisions.some(d => d === 'G')) clauseStatus = 'G';
        else if (subDecisions.length > 0 && subDecisions.every(d => d === 'TB')) clauseStatus = 'TB';

        // Main clause header row for details: if any sub-clause/butir failed, main clause result must be 'G'
        details.push({
            code: (k.klausul || '').trim(),
            text: k.judul ? k.judul.toUpperCase().trim() : '',
            note: '',
            result: clauseStatus === 'G' ? 'G' : '',
            is_header: true,
            is_fail: clauseStatus === 'G',
        });

        // Details sub rows
        (k.sub_klausul || []).forEach(sub => {
            const subResult = sub.keputusan || '-';
            const subCode = hasLetter(sub.kode) ? '' : (sub.kode || '').trim();
            details.push({
                code: subCode,
                text: (sub.judul || '').trim(),
                note: (sub.hasil_catatan || '-').trim(),
                result: subResult,
                is_header: false,
                is_sub_header: true,
                is_fail: subResult === 'G',
            });

            (sub.butir || []).forEach(b => {
                const isCorrected = b.is_corrected && b.original_keputusan;
                const bResult = b.keputusan || '-';
                const bCode = hasLetter(b.kode) ? '' : (b.kode || '').trim();

                details.push({
                    code: bCode,
                    text: (b.teks || '').trim(),
                    note: isCorrected
                        ? `${b.hasil_catatan || ''} [Koreksi: ${b.original_keputusan} → ${b.keputusan}]`.trim()
                        : (b.hasil_catatan || '-').trim(),
                    result: bResult,
                    is_header: false,
                    is_sub_header: false,
                    is_fail: bResult === 'G',
                });
            });
        });

        // Summary row for main clause
        summary.push({
            clause: (k.klausul || '').trim(),
            title: k.judul ? k.judul.toUpperCase().trim() : '',
            status: clauseStatus,
            is_header: true,
            is_fail: clauseStatus === 'G',
        });

        // Detailed rows in summary for failed items only
        failedItems.forEach(item => {
            const itemCode = (item.code || '').replace(/\.[a-zA-Z]+$/, '').trim();
            summary.push({
                clause: itemCode,
                title: (item.text || '').trim(),
                status: 'G',
                is_header: false,
                is_fail: true,
            });
            allFailedCodes.push(itemCode || item.code);
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

    const if_not_pass_text = 'tidak';
    const uniqueFailedCodes = [...new Set(allFailedCodes)];

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
        if_not_pass: uniqueFailedCodes.length > 0 || details.some(d => d.result === 'G') ? if_not_pass_text : '',
        failed_clauses_note: uniqueFailedCodes.length > 0 ? ` pada klausul ${uniqueFailedCodes.join(', ')}` : '',
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
