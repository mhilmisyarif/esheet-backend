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
const RESULT_COLOR = (v) => (v === 'G' ? 'FF0000' : '000000');

function getSpreadsheetCellValue(cell) {
    if (!cell) return '';
    if (cell.f) {
        return cell.computed !== undefined && cell.computed !== null && cell.computed !== ''
            ? cell.computed
            : (cell.v ?? '');
    }
    if (cell.v !== undefined && cell.v !== null && cell.v !== '') {
        return cell.v;
    }
    return cell.computed !== undefined && cell.computed !== null ? cell.computed : (cell.v ?? '');
}

function txtCell(text, { bold = false, shade = null, color = '000000', align = AlignmentType.CENTER, width, columnSpan, rowSpan, vAlign, orientation } = {}) {
    return new TableCell({
        borders: BORDERS, margins: MARGINS,
        ...(columnSpan && columnSpan > 1 ? { columnSpan } : {}),
        ...(rowSpan && rowSpan > 1 ? { rowSpan } : {}),
        ...(width ? { width: { size: width, type: WidthType.DXA } } : {}),
        ...(shade ? { shading: { fill: shade, type: ShadingType.CLEAR } } : {}),
        verticalAlign: vAlign === 'top' ? VerticalAlign.TOP : vAlign === 'bottom' ? VerticalAlign.BOTTOM : VerticalAlign.CENTER,
        ...(orientation === 'vertical' ? { textDirection: 'btLr' } : {}),
        children: [new Paragraph({
            alignment: align,
            children: [new TextRun({ text: String(text ?? ''), bold, color, size: 18, font: 'Arial' })],
        })],
    });
}

const HEADER_GREY = 'E5E7EB'; // Neutral light grey header as requested

function sanitizeCellShade(bg, isHeaderRow = false) {
    if (!bg) {
        return isHeaderRow ? HEADER_GREY : null;
    }
    const clean = String(bg).replace('#', '').toUpperCase();
    if (clean === 'FFFFFF' || clean === 'FFF') {
        return isHeaderRow ? HEADER_GREY : null;
    }
    // Any blue hue -> replace with grey 'E5E7EB'
    const blueList = [
        'EFF6FF', 'DBEAFE', 'BFDBFE', '93C5FD', '60A5FA', '3B82F6',
        '2563EB', '1D4ED8', '1E40AF', '1E3A8A', 'E0F2FE', 'BAE6FD',
        '7DD3FC', '38BDF8', '0EA5E9', '0284C7', '0369A1', '075985',
        '0C4A6E', 'F0F9FF', 'E0F7FA', 'E6F7FF', 'BAE7FF', '91D5FF'
    ];
    if (blueList.includes(clean)) {
        return HEADER_GREY;
    }
    if (clean.length === 6) {
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        if (b > 180 && b > r + 15 && b > g + 10) {
            return HEADER_GREY;
        }
    }
    return clean;
}

function computeTableStatus(tbl) {
    let hasG = false;
    let hasL = false;
    let hasTB = false;

    if (tbl.spreadsheetGrid && tbl.spreadsheetGrid.cells) {
        Object.values(tbl.spreadsheetGrid.cells).forEach((cell) => {
            const v = String(getSpreadsheetCellValue(cell)).trim().toUpperCase();
            if (cell.isResult || v === 'G' || v === 'L' || v === 'TB') {
                if (v === 'G') hasG = true;
                else if (v === 'L') hasL = true;
                else if (v === 'TB') hasTB = true;
            }
        });
    }

    if (tbl.resolved && tbl.resolved.sections) {
        tbl.resolved.sections.forEach((sec) => {
            if (sec.type === 'key_value') {
                (sec.rows || []).forEach((r) => {
                    const res = String(r.result || '').trim().toUpperCase();
                    if (res === 'G') hasG = true;
                    else if (res === 'L') hasL = true;
                    else if (res === 'TB') hasTB = true;
                });
            } else if (sec.type === 'table') {
                const resCols = (sec.columns || []).filter((c) => c.isResult);
                (sec.rows || []).forEach((row) => {
                    resCols.forEach((c) => {
                        const val = String(row.cells && row.cells[c.id] || '').trim().toUpperCase();
                        if (val === 'G') hasG = true;
                        else if (val === 'L') hasL = true;
                        else if (val === 'TB') hasTB = true;
                    });
                });
            }
        });
    }

    if (hasG) return 'G';
    if (hasL) return 'L';
    if (hasTB) return 'TB';
    return 'L';
}

function buildUnifiedTopRow(subCode, tbl, clauseTitle, colCount, columnWidths) {
    const clauseNum = String(subCode || tbl.subClauseCode || '').trim();

    let rawTitle = (tbl.title || clauseTitle || '').trim();
    let formattedTitle = rawTitle;
    if (formattedTitle) {
        if (!/^TABEL/i.test(formattedTitle)) {
            formattedTitle = `TABEL: ${formattedTitle}`;
        }
    } else {
        formattedTitle = 'TABEL PENGUJIAN';
    }

    const tableStatus = computeTableStatus(tbl);
    const statusColor = tableStatus === 'G' ? 'FF0000' : '000000';

    if (colCount >= 3) {
        const midWidth = columnWidths.slice(1, colCount - 1).reduce((a, b) => a + b, 0);
        return new TableRow({
            tableHeader: true,
            children: [
                txtCell(clauseNum, {
                    bold: true,
                    align: AlignmentType.LEFT,
                    width: columnWidths[0],
                    columnSpan: 1,
                    shade: null,
                }),
                txtCell(formattedTitle, {
                    bold: true,
                    align: AlignmentType.LEFT,
                    width: midWidth,
                    columnSpan: colCount - 2,
                    shade: null,
                }),
                txtCell(tableStatus, {
                    bold: true,
                    align: AlignmentType.CENTER,
                    width: columnWidths[colCount - 1],
                    columnSpan: 1,
                    color: statusColor,
                    shade: null,
                }),
            ],
        });
    }

    if (colCount === 2) {
        return new TableRow({
            tableHeader: true,
            children: [
                txtCell(`${clauseNum}  ${formattedTitle}`, {
                    bold: true,
                    align: AlignmentType.LEFT,
                    width: columnWidths[0],
                    columnSpan: 1,
                    shade: null,
                }),
                txtCell(tableStatus, {
                    bold: true,
                    align: AlignmentType.CENTER,
                    width: columnWidths[1],
                    columnSpan: 1,
                    color: statusColor,
                    shade: null,
                }),
            ],
        });
    }

    return new TableRow({
        tableHeader: true,
        children: [
            txtCell(`${clauseNum}  ${formattedTitle}  [${tableStatus}]`, {
                bold: true,
                align: AlignmentType.LEFT,
                width: columnWidths[0],
                columnSpan: 1,
                shade: null,
            }),
        ],
    });
}

function buildSpreadsheetWordTable(tbl, subCode, clauseTitle) {
    const elements = [];
    const grid = tbl.spreadsheetGrid;
    const { rowCount = 8, colCount = 5, cells = {}, merges = [] } = grid;

    const mergeRootMap = {};
    const coveredCells = new Set();
    merges.forEach((m) => {
        mergeRootMap[`${m.r},${m.c}`] = m;
        for (let ro = 0; ro < m.rSpan; ro++) {
            for (let co = 0; co < m.cSpan; co++) {
                if (ro !== 0 || co !== 0) {
                    coveredCells.add(`${m.r + ro},${m.c + co}`);
                }
            }
        }
    });

    // Estimate column weights based on content and orientation
    const weights = [];
    for (let c = 0; c < colCount; c++) {
        let maxLen = 0;
        let isVert = false;
        let allShortResults = true;

        for (let r = 0; r < rowCount; r++) {
            const key = `${r},${c}`;
            const cell = cells[key];
            if (!cell) continue;
            const merge = mergeRootMap[key];
            if (merge && merge.cSpan > 1) continue;
            if (cell.orientation === 'vertical') isVert = true;

            const text = String(getSpreadsheetCellValue(cell)).trim();
            if (text.length > maxLen) maxLen = text.length;
            if (text !== '' && text !== 'L' && text !== 'G' && text !== 'TB' && text !== '-' && text.length > 2) {
                allShortResults = false;
            }
        }

        if (isVert) {
            weights.push(1.2);
        } else if (allShortResults && maxLen <= 3) {
            weights.push(1.5);
        } else if (maxLen <= 8) {
            weights.push(2.5);
        } else if (maxLen <= 18) {
            weights.push(4.5);
        } else {
            weights.push(Math.min(10, Math.max(5, maxLen * 0.35)));
        }
    }

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const columnWidths = weights.map((w) => Math.floor((w / totalWeight) * TOTAL_W));
    const currentSum = columnWidths.reduce((a, b) => a + b, 0);
    const diff = TOTAL_W - currentSum;
    const maxIdx = weights.indexOf(Math.max(...weights));
    columnWidths[maxIdx] += diff;

    // Top unified header row
    const topRow = buildUnifiedTopRow(subCode, tbl, clauseTitle, colCount, columnWidths);
    const tableRows = [topRow];

    for (let r = 0; r < rowCount; r++) {
        const rowCells = [];
        const isHeader = (r === 0);

        for (let c = 0; c < colCount; c++) {
            const key = `${r},${c}`;
            if (coveredCells.has(key)) continue;

            const cell = cells[key] || {};
            const merge = mergeRootMap[key];
            const val = getSpreadsheetCellValue(cell);

            const shade = sanitizeCellShade(cell.bg, isHeader);

            let align = AlignmentType.CENTER;
            if (cell.align === 'left') align = AlignmentType.LEFT;
            else if (cell.align === 'right') align = AlignmentType.RIGHT;

            const width = merge && merge.cSpan > 1
                ? columnWidths.slice(c, c + merge.cSpan).reduce((a, b) => a + b, 0)
                : columnWidths[c];

            const isResultCell = cell.isResult || (grid.colMeta && grid.colMeta[c]?.isResult) || (val === 'L' || val === 'G' || val === 'TB');

            rowCells.push(txtCell(val, {
                bold: !!cell.bold || isHeader,
                shade,
                color: isResultCell ? RESULT_COLOR(val) : '000000',
                align,
                width,
                columnSpan: merge?.cSpan || 1,
                rowSpan: merge?.rSpan || 1,
                vAlign: cell.vAlign,
                orientation: cell.orientation,
            }));
        }
        if (rowCells.length > 0) {
            tableRows.push(new TableRow({
                tableHeader: isHeader,
                children: rowCells,
            }));
        }
    }

    elements.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths,
        rows: tableRows,
    }));
    elements.push(new Paragraph({ children: [], spacing: { after: 180 } }));
    return elements;
}

// Build docx elements for one resolved System-A table (key_value + table
// sections with computed/result cells already filled by resolveInstance).
function buildTemplateWordTable(tbl, subCode, clauseTitle) {
    if (tbl.spreadsheetGrid && Object.keys(tbl.spreadsheetGrid.cells || {}).length > 0) {
        return buildSpreadsheetWordTable(tbl, subCode, clauseTitle);
    }

    const elements = [];

    (tbl.resolved?.sections || []).forEach((section) => {
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
            const columnWidths = hasResult ? [lw, vw, rw] : [lw, vw];

            const topRow = buildUnifiedTopRow(subCode, tbl, clauseTitle, columnWidths.length, columnWidths);

            const rows = [
                topRow,
                ...section.rows.map((r) => new TableRow({
                    children: [
                        txtCell(r.label, { shade: HEADER_GREY, align: AlignmentType.LEFT, width: lw, bold: true }),
                        txtCell(r.value || '-', { align: AlignmentType.LEFT, width: vw }),
                        ...(hasResult ? [txtCell(r.result || '-', { bold: true, color: RESULT_COLOR(r.result), width: rw })] : []),
                    ],
                })),
            ];

            elements.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths, rows }));
            elements.push(new Paragraph({ children: [], spacing: { after: 180 } }));
        } else if (section.type === 'table') {
            const cols = section.columns;
            const weights = cols.map((c) => (typeof c.width === 'number' && c.width > 0 ? c.width : 100));
            const totalWeight = weights.reduce((s, w) => s + w, 0);
            const columnWidths = weights.map((w) => Math.floor((w / totalWeight) * TOTAL_W));
            const currentSum = columnWidths.slice(0, -1).reduce((s, w) => s + w, 0);
            columnWidths[columnWidths.length - 1] = Math.max(100, TOTAL_W - currentSum);

            const topRow = buildUnifiedTopRow(subCode, tbl, clauseTitle, cols.length, columnWidths);
            const headerRows = [];

            if (section.headerGroups && section.headerGroups.length > 0) {
                const tier1Cells = [];
                const rendered = new Set();
                cols.forEach((col, i) => {
                    if (rendered.has(col.id)) return;
                    const group = section.headerGroups.find((g) => (g.colIds || []).includes(col.id));
                    if (group) {
                        const span = group.colIds.length;
                        group.colIds.forEach((id) => rendered.add(id));
                        const groupWidth = group.colIds.reduce((sum, cid) => {
                            const cIdx = cols.findIndex((c) => c.id === cid);
                            return sum + (cIdx >= 0 ? columnWidths[cIdx] : 0);
                        }, 0);
                        tier1Cells.push(txtCell(group.title, {
                            bold: true,
                            shade: HEADER_GREY,
                            columnSpan: span,
                            width: groupWidth,
                        }));
                    } else {
                        rendered.add(col.id);
                        tier1Cells.push(txtCell('', { shade: HEADER_GREY, width: columnWidths[i] }));
                    }
                });
                headerRows.push(new TableRow({ tableHeader: true, children: tier1Cells }));
            }

            const headerRow = new TableRow({
                tableHeader: true,
                children: cols.map((c, i) => txtCell(c.header || '', { bold: true, shade: HEADER_GREY, width: columnWidths[i] })),
            });
            headerRows.push(headerRow);

            const dataRows = section.rows.map((row) => new TableRow({
                children: cols.map((c, i) => {
                    const val = row.cells[c.id];
                    return c.isResult
                        ? txtCell(val || '-', { bold: true, color: RESULT_COLOR(val), width: columnWidths[i] })
                        : txtCell(val ?? '', { width: columnWidths[i] });
                }),
            }));

            elements.push(new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                columnWidths,
                rows: [topRow, ...headerRows, ...dataRows],
            }));

            if (section.footnote) {
                elements.push(new Paragraph({
                    children: [new TextRun({ text: section.footnote, italics: true, size: 16, font: 'Arial' })],
                    spacing: { before: 40, after: 80 },
                }));
            }
            elements.push(new Paragraph({ children: [], spacing: { after: 180 } }));
        }
    });

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
        children: [],
        spacing: { after: 120 },
    })];

    Object.entries(resolvedTables).forEach(([subCode, tables]) => {
        tables
            .slice()
            .sort((a, b) => a.order - b.order)
            .forEach(t => {
                const clauseTitle = titleMap[subCode] || '';
                const tableEls = buildTemplateWordTable(t, subCode, clauseTitle);
                tableEls.forEach(el => elements.push(el));
            });
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

        const failedTables = clauseTables.filter(tbl => computeTableStatus(tbl) === 'G');

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
                const bResult = b.keputusan || '-';
                const bCode = hasLetter(b.kode) ? '' : (b.kode || '').trim();

                details.push({
                    code: bCode,
                    text: (b.teks || '').trim(),
                    note: (b.hasil_catatan || '-').trim(),
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
