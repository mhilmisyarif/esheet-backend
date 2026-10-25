/**
 * src/services/datasheet.generator.js
 * Dependencies: npm install pdfkit pdf-lib qrcode
 */

const PDFDocument = require('pdfkit');
const { PDFDocument: LibPDFDoc } = require('pdf-lib');
const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Company logo for the header — loaded once at startup; the PDF renders
// without it if the asset is missing.
let LOGO_BUFFER = null;
try {
    LOGO_BUFFER = fs.readFileSync(path.resolve(__dirname, '../assets/sucofindo-logo.png'));
} catch { /* logo optional */ }

// Arial font support with Helvetica fallback
const ARIAL_REGULAR = fs.existsSync('C:/Windows/Fonts/arial.ttf')
    ? 'C:/Windows/Fonts/arial.ttf'
    : null;
const ARIAL_BOLD = fs.existsSync('C:/Windows/Fonts/arialbd.ttf')
    ? 'C:/Windows/Fonts/arialbd.ttf'
    : null;
const ARIAL_ITALIC = fs.existsSync('C:/Windows/Fonts/ariali.ttf')
    ? 'C:/Windows/Fonts/ariali.ttf'
    : null;

// Unicode font for special symbols fallback if needed
const CATATAN_FONT_PATH = path.resolve(__dirname, '../assets/catatan-font.ttf');
const HAS_CATATAN_FONT = fs.existsSync(CATATAN_FONT_PATH);

const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};
const formatDateShort = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function derivePassword(report) {
    const parts = (report.sample?.order?.order_no || '').split('/');
    return (parts[3] || '000000').slice(-6) + String(report.technicianId || '0');
}

// Document-control footer values (override per deployment via env)
const DOC_CONTROL = {
    form: process.env.DATASHEET_FORM_NO || 'FOR/LAB-CHY/09',
    rev: process.env.DATASHEET_REV || 'Rev.01',
    effective: process.env.DATASHEET_EFFECTIVE || '18/12/2023',
};

// "No. Lab" is the numeric lab-sequence segment of the order number,
// e.g. CBT/3801/20-104-04/00331/06/2026-01 → 331
function deriveLabNo(orderNo) {
    const parts = (orderNo || '').split('/');
    for (const p of parts) {
        if (/^\d{3,}$/.test(p)) return String(parseInt(p, 10));
    }
    return '-';
}

function formatDateRange(first, last) {
    const monthName = (d) => d.toLocaleDateString('id-ID', { month: 'long' });
    const monthYear = (d) => d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const sameDay = (a, b) =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(first, last)) return formatDate(first);
    if (monthYear(first) === monthYear(last)) {
        return `${first.getDate()} - ${last.getDate()} ${monthYear(first)}`;
    }
    if (first.getFullYear() === last.getFullYear()) {
        return `${first.getDate()} ${monthName(first)} - ${last.getDate()} ${monthYear(last)}`;
    }
    return `${formatDate(first)} - ${formatDate(last)}`;
}

function testDateRange(report, klausuls) {
    const dates = klausuls
        .map(k => k.meta?.test_datetime)
        .filter(Boolean)
        .map(d => new Date(d))
        .filter(d => !isNaN(d.getTime()))
        .sort((a, b) => a - b);
    if (dates.length > 0) {
        return formatDateRange(dates[0], dates[dates.length - 1]);
    }

    const start = report.test_started_at ? new Date(report.test_started_at) : null;
    const finish = report.test_finished_at ? new Date(report.test_finished_at) : null;
    if (start && !isNaN(start.getTime())) {
        const end = finish && !isNaN(finish.getTime()) ? finish : start;
        return formatDateRange(start, end);
    }
    return '-';
}

async function generateQR(text) {
    try {
        return await QRCode.toBuffer(text, { type: 'png', width: 120, margin: 1, errorCorrectionLevel: 'M' });
    } catch { return null; }
}

// PDFKit safe helpers — correctly set lineWidth BEFORE stroking
function rectFill(doc, x, y, w, h, color) {
    doc.save().rect(x, y, w, h).fillColor(color).fill().restore();
}
function rectStroke(doc, x, y, w, h, color = 'black', lw = 0.5) {
    doc.save().lineWidth(lw).strokeColor(color).rect(x, y, w, h).stroke().restore();
}
function rectFillStroke(doc, x, y, w, h, fill, stroke = 'black', lw = 0.5) {
    doc.save().lineWidth(lw).strokeColor(stroke).fillColor(fill).rect(x, y, w, h).fillAndStroke().restore();
}

/**
 * Enhanced text wrapper:
 * 1. Honors explicit newlines (\r?\n).
 * 2. Wraps by words when possible.
 * 3. Breaks long unbroken words character-by-character so they never overflow.
 */
function wrapText(doc, text, maxW, fs) {
    if (text === null || text === undefined || text === '') return ['-'];
    doc.fontSize(fs);
    const rawParagraphs = String(text).split(/\r?\n/);
    const lines = [];
    for (const para of rawParagraphs) {
        if (!para.trim()) {
            lines.push('');
            continue;
        }
        const words = para.split(' ');
        let cur = '';
        for (const w of words) {
            const t = cur ? `${cur} ${w}` : w;
            if (doc.widthOfString(t) <= maxW) {
                cur = t;
            } else {
                if (cur) lines.push(cur);
                if (doc.widthOfString(w) <= maxW) {
                    cur = w;
                } else {
                    let chunk = '';
                    for (const char of w) {
                        if (doc.widthOfString(chunk + char) <= maxW) {
                            chunk += char;
                        } else {
                            if (chunk) lines.push(chunk);
                            chunk = char;
                        }
                    }
                    cur = chunk;
                }
            }
        }
        if (cur) lines.push(cur);
    }
    return lines.length ? lines : ['-'];
}

const PAGE_TOP = 95;

function checkPage(doc, y, needed = 80, onNewPage = null) {
    if (y + needed > doc.page.height - 60) {
        doc.addPage();
        let newY = PAGE_TOP;
        if (typeof onNewPage === 'function') {
            newY = onNewPage(newY);
        }
        return newY;
    }
    return y;
}

/**
 * Result color: G is red (#B40000), all others (L, TB, etc.) are black!
 */
function resultColor(v) {
    if (v === 'G') return '#B40000';
    return 'black';
}

function computeTableStatus(tbl) {
    let hasG = false;
    let hasL = false;
    let hasTB = false;
    if (tbl.spreadsheetGrid && tbl.spreadsheetGrid.cells) {
        Object.values(tbl.spreadsheetGrid.cells).forEach((cell) => {
            const v = String(cell?.computed ?? cell?.v ?? '').trim().toUpperCase();
            if (cell?.isResult || v === 'G' || v === 'L' || v === 'TB') {
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
    return '-';
}

function getExaminerName(report, klausuls = []) {
    if (report.technician?.name) {
        return report.technician.name;
    }
    if (report.User?.name) {
        return report.User.name;
    }
    for (const k of klausuls) {
        if (k.meta?.tester_name && k.meta.tester_name.trim() !== '') {
            return k.meta.tester_name.trim();
        }
    }
    return '-';
}

/**
 * Draw a spreadsheetGrid table in PDFKit.
 * Font: Arial size 8 everywhere.
 * All contents NOT bold. Decisions NOT bold, L and TB are black, G is red.
 * All cell strokes use uniform 0.5 lineWidth.
 */
function drawSpreadsheetTable(doc, tbl, startY, pageW, fonts) {
    const { FONT_REG, FONT_BOLD } = fonts;
    let ty = startY;
    const grid = tbl.spreadsheetGrid;
    const { rowCount = 5, colCount = 13, cells = {}, merges = [] } = grid;

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

    // Intelligent column width distribution
    const colMeta = [];
    for (let c = 0; c < colCount; c++) {
        let maxLen = 0;
        let allShort = true;
        for (let r = 0; r < rowCount; r++) {
            const key = `${r},${c}`;
            const cell = cells[key];
            if (!cell) continue;
            const text = String(cell.computed ?? cell.v ?? '').trim();
            if (text) {
                if (text.length > maxLen) maxLen = text.length;
                if (text !== 'L' && text !== 'G' && text !== 'TB' && text !== '-' && text.length > 3) {
                    allShort = false;
                }
            }
        }
        colMeta.push({ c, maxLen, isShort: allShort && maxLen <= 3 });
    }

    const shortCols = colMeta.filter(m => m.isShort);
    const textCols = colMeta.filter(m => !m.isShort);
    const colW = new Array(colCount).fill(0);

    if (shortCols.length > 0 && textCols.length > 0) {
        const shortW = Math.max(19, Math.min(23, Math.floor((pageW * 0.48) / shortCols.length)));
        const totalShortW = shortW * shortCols.length;
        shortCols.forEach(m => { colW[m.c] = shortW; });

        const remainW = pageW - totalShortW;
        const textWeights = textCols.map(m => {
            if (m.c === 0) return Math.max(5.5, m.maxLen * 0.35);
            if (m.maxLen > 25) return Math.max(9.0, m.maxLen * 0.45);
            return Math.max(6.5, m.maxLen * 0.35);
        });
        const sumTextWeight = textWeights.reduce((a, b) => a + b, 0);
        textCols.forEach((m, idx) => {
            colW[m.c] = (textWeights[idx] / sumTextWeight) * remainW;
        });
    } else {
        const eqW = pageW / colCount;
        for (let c = 0; c < colCount; c++) colW[c] = eqW;
    }

    // Unified Header Bar: Clause, Title, Status — separate cells, white background, no brackets
    const tableStatus = computeTableStatus(tbl);
    const statusCol = resultColor(tableStatus);

    let codeW, statW, titleW;
    if (colCount >= 3 && colW[0] >= 35 && colW[colCount - 1] >= 30) {
        codeW = colW[0];
        statW = colW[colCount - 1];
        titleW = pageW - codeW - statW;
    } else {
        codeW = 55;
        statW = 50;
        titleW = pageW - codeW - statW;
    }

    let formattedTitle = tbl.title || '';
    if (formattedTitle) {
        if (!/^TABEL/i.test(formattedTitle)) {
            formattedTitle = `TABEL: ${formattedTitle}`;
        }
    } else {
        formattedTitle = 'TABEL PENGUJIAN';
    }

    const titleLines = wrapText(doc, formattedTitle, titleW - 12, 8.5);
    const thH = Math.max(20, titleLines.length * 11 + 7);
    ty = checkPage(doc, ty, thH + 40);

    let cx = 50;

    // Cell 1: Clause code (e.g. 19.2)
    rectFill(doc, cx, ty, codeW, thH, '#FFFFFF');
    rectStroke(doc, cx, ty, codeW, thH, 'black', 0.5);
    doc.fillColor('black').fontSize(8.5).font(FONT_REG)
        .text(tbl.clauseNum || '', cx + 6, ty + (thH - 9) / 2, { width: codeW - 8, lineBreak: false });
    cx += codeW;

    // Cell 2: Title
    rectFill(doc, cx, ty, titleW, thH, '#FFFFFF');
    rectStroke(doc, cx, ty, titleW, thH, 'black', 0.5);
    const titleStartY = ty + (thH - titleLines.length * 10) / 2;
    titleLines.forEach((line, li) => {
        doc.fillColor('black').fontSize(8.5).font(FONT_REG)
            .text(line, cx + 6, titleStartY + li * 10, { width: titleW - 12, lineBreak: false });
    });
    cx += titleW;

    // Cell 3: Decision without brackets
    rectFill(doc, cx, ty, statW, thH, '#FFFFFF');
    rectStroke(doc, cx, ty, statW, thH, 'black', 0.5);
    doc.fillColor(statusCol).fontSize(8.5).font(FONT_REG)
        .text(tableStatus || '-', cx, ty + (thH - 9) / 2, { width: statW, align: 'center', lineBreak: false });

    ty += thH;

    // Font size for table content: Arial size 8
    const RF = 8;

    // Calculate row heights
    const rowHeights = [];
    for (let r = 0; r < rowCount; r++) {
        let maxLines = 1;
        for (let c = 0; c < colCount; c++) {
            const key = `${r},${c}`;
            if (coveredCells.has(key)) continue;
            const merge = mergeRootMap[key];
            if (merge && merge.rSpan > 1) continue;
            const cellW = merge && merge.cSpan > 1
                ? colW.slice(c, c + merge.cSpan).reduce((a, b) => a + b, 0)
                : colW[c];
            const cell = cells[key];
            const val = cell ? (cell.computed ?? cell.v ?? '') : '';
            const lines = wrapText(doc, String(val), cellW - 5, RF);
            maxLines = Math.max(maxLines, lines.length);
        }
        const rh = Math.max(18, maxLines * (RF + 2.5) + 6);
        rowHeights.push(rh);
    }

    const drawGridRow = (r, atY) => {
        const rh = rowHeights[r];
        const isHeader = (r === 0);
        let cx = 50;

        for (let c = 0; c < colCount; c++) {
            const key = `${r},${c}`;
            const currentCellW = colW[c];

            if (coveredCells.has(key)) {
                cx += currentCellW;
                continue;
            }

            const merge = mergeRootMap[key];
            const cellW = merge && merge.cSpan > 1
                ? colW.slice(c, c + merge.cSpan).reduce((a, b) => a + b, 0)
                : currentCellW;

            let cellH = rh;
            if (merge && merge.rSpan > 1) {
                cellH = rowHeights.slice(r, r + merge.rSpan).reduce((a, b) => a + b, 0);
            }

            const cell = cells[key] || {};
            const val = cell.computed ?? cell.v ?? '';
            const bg = isHeader ? '#EBEBEB' : (cell.bg || (r % 2 === 1 ? '#FFFFFF' : '#FAFAFA'));

            rectFill(doc, cx, atY, cellW, cellH, bg);
            rectStroke(doc, cx, atY, cellW, cellH, 'black', 0.5);

            const isRes = cell.isResult || val === 'L' || val === 'G' || val === 'TB';
            const txtColor = isRes ? resultColor(val) : 'black';

            // All content rows NOT bold! Only row 0 header is bold.
            doc.fillColor(txtColor).fontSize(RF).font(isHeader ? FONT_BOLD : FONT_REG);
            const lines = wrapText(doc, String(val), cellW - 5, RF);
            const align = isRes || cell.align === 'center' || isHeader ? 'center' : (cell.align || 'left');
            const startTy = atY + (cellH - lines.length * (RF + 2)) / 2;

            lines.forEach((l, li) => {
                doc.text(l, cx + 2, startTy + li * (RF + 2), { width: cellW - 4, align, lineBreak: false });
            });
            doc.font(FONT_REG);

            cx += currentCellW;
        }
    };

    // Draw grid rows (all borders black! repeats row 0 header if page breaks)
    for (let r = 0; r < rowCount; r++) {
        const rh = rowHeights[r];
        const prevY = ty;
        ty = checkPage(doc, ty, rh);
        if (ty < prevY && r > 0) {
            // Continuation page: redraw row 0 header at top
            drawGridRow(0, ty);
            ty += rowHeights[0];
        }
        drawGridRow(r, ty);
        ty += rh;
    }

    return ty + 12;
}

/**
 * Draw a template table (key_value and table sections) in PDFKit.
 * Font: Arial size 8. All contents NOT bold. L/TB black, G red.
 */
function drawTemplateTable(doc, tbl, startY, pageW, fonts) {
    const { FONT_REG, FONT_BOLD, FONT_ITALIC } = fonts;
    let ty = startY;
    const RF = 8;

    // Unified Header Bar: Clause, Title, Status — separate cells, white background, no brackets
    const tableStatus = computeTableStatus(tbl);
    const statusCol = resultColor(tableStatus);

    const codeW = 55;
    const statW = 50;
    const titleW = pageW - codeW - statW;

    let formattedTitle = tbl.title || '';
    if (formattedTitle) {
        if (!/^TABEL/i.test(formattedTitle)) {
            formattedTitle = `TABEL: ${formattedTitle}`;
        }
    } else {
        formattedTitle = 'TABEL PENGUJIAN';
    }

    const titleLines = wrapText(doc, formattedTitle, titleW - 12, 8.5);
    const thH = Math.max(20, titleLines.length * 11 + 7);
    ty = checkPage(doc, ty, thH + 40);

    let cx = 50;

    // Cell 1: Clause code (e.g. 19.2)
    rectFill(doc, cx, ty, codeW, thH, '#FFFFFF');
    rectStroke(doc, cx, ty, codeW, thH, 'black', 0.5);
    doc.fillColor('black').fontSize(8.5).font(FONT_REG)
        .text(tbl.clauseNum || '', cx + 6, ty + (thH - 9) / 2, { width: codeW - 8, lineBreak: false });
    cx += codeW;

    // Cell 2: Title
    rectFill(doc, cx, ty, titleW, thH, '#FFFFFF');
    rectStroke(doc, cx, ty, titleW, thH, 'black', 0.5);
    const titleStartY = ty + (thH - titleLines.length * 10) / 2;
    titleLines.forEach((line, li) => {
        doc.fillColor('black').fontSize(8.5).font(FONT_REG)
            .text(line, cx + 6, titleStartY + li * 10, { width: titleW - 12, lineBreak: false });
    });
    cx += titleW;

    // Cell 3: Decision without brackets
    rectFill(doc, cx, ty, statW, thH, '#FFFFFF');
    rectStroke(doc, cx, ty, statW, thH, 'black', 0.5);
    doc.fillColor(statusCol).fontSize(8.5).font(FONT_REG)
        .text(tableStatus || '-', cx, ty + (thH - 9) / 2, { width: statW, align: 'center', lineBreak: false });

    ty += thH;

    (tbl.resolved?.sections || []).forEach((section) => {
        // Skip duplicate title if it repeats tbl.title
        if (section.label && section.label !== tbl.title) {
            ty = checkPage(doc, ty, 16);
            doc.fillColor('#333333').fontSize(8).font(FONT_BOLD)
                .text(section.label, 50, ty, { width: pageW, lineBreak: false });
            ty += 12;
        }

        if (section.type === 'key_value') {
            const hasResult = section.rows.some((r) => r.result);
            const labelW = pageW * (hasResult ? 0.52 : 0.5);
            const valW = pageW * (hasResult ? 0.34 : 0.5);
            const resW = hasResult ? pageW - labelW - valW : 0;
            section.rows.forEach((r) => {
                const lines = wrapText(doc, r.label, labelW - 8, RF);
                const vLines = wrapText(doc, String(r.value || '-'), valW - 8, RF);
                const rh = Math.max(18, Math.max(lines.length, vLines.length) * (RF + 3) + 6);
                ty = checkPage(doc, ty, rh);
                rectFill(doc, 50, ty, labelW, rh, '#F2F2F2');
                rectStroke(doc, 50, ty, labelW, rh, 'black', 0.5);
                rectStroke(doc, 50 + labelW, ty, valW, rh, 'black', 0.5);
                doc.fillColor('black').fontSize(RF).font(FONT_REG);
                lines.forEach((l, li) => doc.text(l, 56, ty + 4 + li * (RF + 3), { width: labelW - 8, lineBreak: false }));
                vLines.forEach((l, li) => doc.text(l, 56 + labelW, ty + 4 + li * (RF + 3), { width: valW - 8, lineBreak: false }));
                if (hasResult) {
                    rectStroke(doc, 50 + labelW + valW, ty, resW, rh, 'black', 0.5);
                    doc.fillColor(resultColor(r.result)).fontSize(RF).font(FONT_REG)
                        .text(r.result || '-', 50 + labelW + valW, ty + rh / 2 - 5, { width: resW, align: 'center', lineBreak: false });
                }
                ty += rh;
            });
        } else if (section.type === 'table') {
            const cols = section.columns;
            const colCount = cols.length;

            // Intelligent column width allocation for table sections
            const colMeta = cols.map((c, ci) => {
                let maxLen = (c.header || '').length;
                let allShort = true;
                (section.rows || []).forEach(row => {
                    const text = String(row.cells && row.cells[c.id] || '').trim();
                    if (text) {
                        if (text.length > maxLen) maxLen = text.length;
                        if (text !== 'L' && text !== 'G' && text !== 'TB' && text !== '-' && text.length > 3) {
                            allShort = false;
                        }
                    }
                });
                return { ci, maxLen, isShort: allShort && maxLen <= 3 };
            });

            const shortCols = colMeta.filter(m => m.isShort);
            const textCols = colMeta.filter(m => !m.isShort);
            const colW = new Array(colCount).fill(0);

            if (shortCols.length > 0 && textCols.length > 0) {
                const shortW = Math.max(19, Math.min(23, Math.floor((pageW * 0.48) / shortCols.length)));
                const totalShortW = shortW * shortCols.length;
                shortCols.forEach(m => { colW[m.ci] = shortW; });

                const remainW = pageW - totalShortW;
                const textWeights = textCols.map(m => {
                    if (m.ci === 0) return Math.max(5.5, m.maxLen * 0.35);
                    if (m.maxLen > 25) return Math.max(9.0, m.maxLen * 0.45);
                    return Math.max(6.5, m.maxLen * 0.35);
                });
                const sumTextWeight = textWeights.reduce((a, b) => a + b, 0);
                textCols.forEach((m, idx) => {
                    colW[m.ci] = (textWeights[idx] / sumTextWeight) * remainW;
                });
            } else {
                const weights = cols.map((c) => (typeof c.width === 'number' && c.width > 0 ? c.width : 100));
                const totalWeight = weights.reduce((s, w) => s + w, 0);
                cols.forEach((c, ci) => { colW[ci] = (weights[ci] / totalWeight) * pageW; });
            }

            const drawSectionHeader = (atY) => {
                rectFill(doc, 50, atY, pageW, 18, '#DCDCDC');
                let cx = 50;
                cols.forEach((c, ci) => {
                    rectStroke(doc, cx, atY, colW[ci], 18, 'black', 0.5);
                    doc.fillColor('black').fontSize(7.5).font(FONT_BOLD)
                        .text(c.header || '', cx + 2, atY + 5, { width: colW[ci] - 4, align: 'center', lineBreak: false });
                    cx += colW[ci];
                });
                return atY + 18;
            };

            // Header (black border!)
            ty = checkPage(doc, ty, 20);
            ty = drawSectionHeader(ty);

            // Rows
            let renderedGroup = null;
            section.rows.forEach((row) => {
                if (row.groupLabel && row.groupLabel !== renderedGroup) {
                    renderedGroup = row.groupLabel;
                    ty = checkPage(doc, ty, 16);
                    rectFill(doc, 50, ty, pageW, 14, '#F0F0F0');
                    rectStroke(doc, 50, ty, pageW, 14, 'black', 0.5);
                    doc.fillColor('#555555').fontSize(7.5).font(FONT_REG)
                        .text(row.groupLabel, 56, ty + 3.5, { width: pageW - 12, lineBreak: false });
                    ty += 14;
                }
                let maxL = 1;
                cols.forEach((c, ci) => {
                    maxL = Math.max(maxL, wrapText(doc, String(row.cells[c.id] ?? ''), colW[ci] - 5, RF).length);
                });
                const rh = Math.max(16, maxL * (RF + 2.5) + 6);
                const prevY = ty;
                ty = checkPage(doc, ty, rh);
                if (ty < prevY) {
                    // Continuation page: redraw section table header
                    ty = drawSectionHeader(ty);
                }
                cx = 50;
                cols.forEach((c, ci) => {
                    rectStroke(doc, cx, ty, colW[ci], rh, 'black', 0.5);
                    const val = row.cells[c.id];
                    if (c.isResult) {
                        doc.fillColor(resultColor(val)).fontSize(RF).font(FONT_REG)
                            .text(val || '-', cx, ty + rh / 2 - 5, { width: colW[ci], align: 'center', lineBreak: false });
                    } else {
                        doc.fillColor('black').fontSize(RF).font(FONT_REG);
                        const lines = wrapText(doc, String(val ?? ''), colW[ci] - 5, RF);
                        const oy = ty + (rh - lines.length * (RF + 2)) / 2;
                        lines.forEach((l, li) => doc.text(l, cx + 2, oy + li * (RF + 2), { width: colW[ci] - 4, align: 'center', lineBreak: false }));
                    }
                    cx += colW[ci];
                });
                ty += rh;
            });

            // Footnote
            if (section.footnote) {
                const fnLines = wrapText(doc, section.footnote, pageW - 4, 7);
                ty = checkPage(doc, ty, fnLines.length * 10 + 4);
                doc.fillColor('#555555').fontSize(7).font(FONT_ITALIC);
                fnLines.forEach((l, li) => doc.text(l, 52, ty + 2 + li * 9, { width: pageW - 4, lineBreak: false }));
                doc.font(FONT_REG).fillColor('black');
                ty += fnLines.length * 9 + 4;
            }
        }
        ty += 6;
    });
    return ty + 12;
}

async function generateDatasheetPdf(report, klausulStatuses, resolvedTables = {}) {
    const { sample, technician } = report;
    const { order } = sample;
    const password = derivePassword(report);
    const pageW = 495;

    const approvedKlausuls = (report.data || []).filter(k => klausulStatuses[k.klausul]?.status === 'APPROVED');

    // Resolve report-wide defaults for temperature & humidity if any clause filled them
    let defaultTemp = 25;
    let defaultHumid = 60;
    for (const k of approvedKlausuls) {
        const t = k.meta?.temperature ?? k.meta?.suhu;
        if (t != null && t !== '') { defaultTemp = t; break; }
    }
    for (const k of approvedKlausuls) {
        const h = k.meta?.humidity ?? k.meta?.kelembaban;
        if (h != null && h !== '') { defaultHumid = h; break; }
    }

    const getRoomConditions = (k) => {
        const t = (k.meta?.temperature != null && k.meta.temperature !== '')
            ? k.meta.temperature
            : (k.meta?.suhu != null && k.meta.suhu !== '' ? k.meta.suhu : defaultTemp);
        const h = (k.meta?.humidity != null && k.meta.humidity !== '')
            ? k.meta.humidity
            : (k.meta?.kelembaban != null && k.meta.kelembaban !== '' ? k.meta.kelembaban : defaultHumid);
        return {
            suhuDisplay: `${t} °C (20 ± 5)`,
            lembabDisplay: `${h} %RH (≤ 65)`,
            suhuShort: `${t} °C`,
            lembabShort: `${h} %RH`,
        };
    };

    // Pre-generate QR codes
    const qrMap = {};
    for (const k of approvedKlausuls) {
        const kStatus = klausulStatuses[k.klausul];
        const tester = k.meta?.tester_name || kStatus?.submittedBy?.name || getExaminerName(report, approvedKlausuls);
        const approver = kStatus?.approvedBy?.name || '-';
        const { suhuShort, lembabShort } = getRoomConditions(k);
        const tglUji = formatDateShort(k.meta?.test_datetime || kStatus?.submittedAt);
        const tglSetuju = formatDateShort(kStatus?.approvedAt);

        const qrText = [
            `[ LEMBAR DATA UJI - KLAUSUL ${k.klausul} ]`,
            `No. Lab: ${deriveLabNo(order.order_no)}`,
            `Diuji oleh: ${tester}`,
            `Disetujui oleh: ${approver}`,
            `Suhu: ${suhuShort}`,
            `Kelembapan: ${lembabShort}`,
            `Tgl Uji: ${tglUji}`,
            `Tgl Disetujui: ${tglSetuju}`
        ].join('\n');

        qrMap[k.klausul] = {
            text: `Klausul ${k.klausul} Info`,
            buffer: await generateQR(qrText)
        };
    }

    const pdfBuffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 }, bufferPages: true });

        // Register Arial font family if available, fallback to Helvetica
        if (ARIAL_REGULAR) doc.registerFont('Arial', ARIAL_REGULAR);
        if (ARIAL_BOLD) doc.registerFont('Arial-Bold', ARIAL_BOLD);
        if (ARIAL_ITALIC) doc.registerFont('Arial-Italic', ARIAL_ITALIC);

        const FONT_REG = ARIAL_REGULAR ? 'Arial' : 'Helvetica';
        const FONT_BOLD = ARIAL_BOLD ? 'Arial-Bold' : 'Helvetica-Bold';
        const FONT_ITALIC = ARIAL_ITALIC ? 'Arial-Italic' : 'Helvetica-Oblique';

        const fontBundle = { FONT_REG, FONT_BOLD, FONT_ITALIC };

        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        let y = 50;

        // Cover header
        const LOGO_W = 68;
        if (LOGO_BUFFER) {
            doc.image(LOGO_BUFFER, 550 - LOGO_W, 38, { width: LOGO_W });
        }
        doc.fillColor('black').fontSize(16).font(FONT_BOLD)
            .text('LEMBAR DATA UJI (DATASHEET)', 50, y, { align: 'center', width: pageW });
        y += 22;
        doc.fontSize(10).font(FONT_REG).text('PT. SUCOFINDO', 50, y, { align: 'center', width: pageW });
        y += 10;
        if (LOGO_BUFFER) y = Math.max(y, 90);
        doc.save().moveTo(50, y).lineTo(550, y).lineWidth(1.5).strokeColor('black').stroke().restore();
        y += 14;

        // Metadata table
        const stdNumbers = sample.testStandard?.standard_numbers?.length
            ? sample.testStandard.standard_numbers
            : [sample.testStandard?.name || report.doc_standard || '-'];
        const metaRows = [
            ['No. Lab', deriveLabNo(order.order_no)],
            ['No. Sampel', order.order_no || '-'],
            ['Nama Contoh', sample.name || '-'],
            ['Merek', sample.brand || '-'],
            ['Model', sample.model || '-'],
            ...stdNumbers.map((n, i) => [i === 0 ? 'Standar/Referensi' : '', n]),
            ['Jenis Pengujian', report.testing_type === 'VERIFICATION' ? 'Verifikasi' : 'Penuh'],
            ['Penguji', getExaminerName(report, approvedKlausuls)],
            ['Tanggal Terima Sampel', sample.received_date ? formatDate(sample.received_date) : '-'],
            ['Tanggal Pengujian', testDateRange(report, approvedKlausuls)],
        ];
        const kvColW = [pageW * 0.32, pageW * 0.68];
        metaRows.forEach(([label, value]) => {
            const valLines = wrapText(doc, String(value ?? '-'), kvColW[1] - 12, 9);
            const rh = Math.max(22, valLines.length * 12 + 10);
            y = checkPage(doc, y, rh);
            rectFill(doc, 50, y, kvColW[0], rh, '#F2F2F2');
            rectStroke(doc, 50, y, kvColW[0], rh, 'black', 0.5);
            rectStroke(doc, 50 + kvColW[0], y, kvColW[1], rh, 'black', 0.5);
            doc.fillColor('black').fontSize(9).font(FONT_BOLD)
                .text(label, 56, y + (rh - 10) / 2, { width: kvColW[0] - 12, lineBreak: false });
            doc.font(FONT_REG);
            valLines.forEach((l, li) => doc.text(l, 56 + kvColW[0], y + 5 + li * 12, { width: kvColW[1] - 12, lineBreak: false }));
            y += rh;
        });
        y += 18;

        // Helper to render L/TB/G cell: NOT bold, black for L and TB, red for G!
        const renderDecisionCell = (item, cellX, cellY, cellH, colWVal) => {
            const isCorrected = item.is_corrected && item.original_keputusan;
            const midY = cellY + (cellH - 9.5) / 2;
            if (isCorrected) {
                doc.fontSize(8.5).font(FONT_REG);
                const origW = doc.widthOfString(item.original_keputusan);
                const newW = doc.widthOfString(item.keputusan || '-');
                const gap = 6;
                const totalW = origW + gap + newW;
                const startX = cellX + (colWVal - totalW) / 2;

                const blockH = item.corrected_by ? 20 : 9.5;
                const startBlockY = cellY + (cellH - blockH) / 2;
                const decisionY = startBlockY;
                const strikeY = decisionY + 4.8;
                const attrY = startBlockY + 12.5;

                // Original — red with horizontal strikethrough exactly through center
                doc.fillColor('#B40000').fontSize(8.5).font(FONT_REG)
                    .text(item.original_keputusan, startX, decisionY, { lineBreak: false });
                doc.save()
                    .moveTo(startX - 1.5, strikeY)
                    .lineTo(startX + origW + 1.5, strikeY)
                    .lineWidth(0.8).strokeColor('#B40000').stroke().restore();

                // New keputusan — standard color (black for L/TB, red for G) on exact same baseline
                const rc = resultColor(item.keputusan);
                doc.fillColor(rc).fontSize(8.5).font(FONT_REG)
                    .text(item.keputusan || '-', startX + origW + gap, decisionY, { lineBreak: false });

                // "Rev by <name>" attribution neatly centered below
                if (item.corrected_by) {
                    doc.fillColor('#666666').fontSize(6.5).font(FONT_REG)
                        .text(`Rev by ${item.corrected_by}`, cellX + 2, attrY,
                            { width: colWVal - 4, align: 'center', lineBreak: false });
                }
            } else {
                const rc = resultColor(item.keputusan);
                doc.fillColor(rc).fontSize(8.5).font(FONT_REG)
                    .text(item.keputusan || '-', cellX + 2, midY,
                        { width: colWVal - 4, align: 'center', lineBreak: false });
            }
            doc.fillColor('black');
        };

        // Per-klausul loop
        for (let i = 0; i < approvedKlausuls.length; i++) {
            const k = approvedKlausuls[i];
            const kStatus = klausulStatuses[k.klausul];
            const qr = qrMap[k.klausul];

            if (i > 0) { doc.addPage(); y = PAGE_TOP; }

            // Title bar
            rectFill(doc, 50, y, pageW, 26, '#282828');
            doc.fillColor('white').fontSize(11).font(FONT_BOLD)
                .text(`KLAUSUL ${k.klausul} — ${(k.judul || '').toUpperCase()}`, 56, y + 7, { width: pageW - 12, lineBreak: false });
            doc.fillColor('black');
            y += 30;

            // Info + QR
            const QR_SIZE = 60;
            const infoW = qr.buffer ? pageW - QR_SIZE - 6 : pageW;
            const boxH = 62;

            rectStroke(doc, 50, y, infoW, boxH, 'black', 0.5);
            const { suhuDisplay, lembabDisplay } = getRoomConditions(k);
            const clauseTester = k.meta?.tester_name || kStatus?.submittedBy?.name || getExaminerName(report, approvedKlausuls);
            const infoItems = [
                ['Diuji oleh', clauseTester],
                ['Disetujui oleh', kStatus?.approvedBy?.name || '-'],
                ['Suhu Ruang', suhuDisplay],
                ['Tanggal Uji', formatDateShort(k.meta?.test_datetime || kStatus?.submittedAt)],
                ['Tanggal Disetujui', formatDateShort(kStatus?.approvedAt)],
                ['Kelembapan Ruang', lembabDisplay],
            ];
            const thirdW = infoW / 3;
            infoItems.forEach(([label, value], idx) => {
                const col = idx % 3, row = Math.floor(idx / 3);
                const ix = 50 + col * thirdW + 6, iy = y + row * 28 + 6;
                doc.fontSize(7).font(FONT_BOLD).fillColor('#666666').text(label + ':', ix, iy, { lineBreak: false });
                doc.fontSize(8.5).font(FONT_REG).fillColor('#111111').text(value, ix, iy + 9, { lineBreak: false, width: thirdW - 12 });
            });
            doc.fillColor('black');

            if (qr.buffer) {
                rectStroke(doc, 50 + infoW + 6, y, QR_SIZE, boxH, 'black', 0.5);
                doc.image(qr.buffer, 50 + infoW + 8, y + 4, { width: QR_SIZE - 4, height: QR_SIZE - 4 });
            }
            y += boxH + 4;

            if (qr.buffer) {
                doc.fontSize(5.5).font(FONT_REG).fillColor('#AAAAAA')
                    .text(qr.text, 50 + infoW + 6, y - 2, { width: QR_SIZE, align: 'center', lineBreak: false });
                doc.fillColor('black');
            }

            // Correction note
            if (kStatus?.corrections) {
                y = checkPage(doc, y, 24);
                rectFill(doc, 50, y, pageW, 22, '#FFF8E1');
                rectStroke(doc, 50, y, pageW, 22, '#E6A817', 0.5);
                doc.fontSize(7.5).font(FONT_BOLD).fillColor('#8B5E00')
                    .text('Koreksi: ', 56, y + 6, { continued: true, lineBreak: false });
                doc.font(FONT_REG).text(kStatus.corrections, { lineBreak: false });
                doc.fillColor('black');
                y += 26;
            }
            y += 8;

            // Butir table headers: No., Syarat-syarat Pengujian, Hasil / Catatan, Keputusan
            const bColW = [35, pageW * 0.50, pageW * 0.28, pageW - 35 - pageW * 0.50 - pageW * 0.28];
            const bHeaders = ['No.', 'Syarat-syarat Pengujian', 'Hasil / Catatan', 'Keputusan'];

            const drawButirTableHeader = (atY) => {
                rectFill(doc, 50, atY, pageW, 22, '#D2D2D2');
                let cx = 50;
                bHeaders.forEach((h, hi) => {
                    rectStroke(doc, cx, atY, bColW[hi], 22, 'black', 0.5);
                    doc.fillColor('black').fontSize(8.5).font(FONT_BOLD)
                        .text(h, cx + 2, atY + 6, { width: bColW[hi] - 4, align: 'center', lineBreak: false });
                    cx += bColW[hi];
                });
                return atY + 22;
            };

            const checkButirPage = (curY, needed) => {
                return checkPage(doc, curY, needed, (nextY) => {
                    return drawButirTableHeader(nextY);
                });
            };

            // Draw initial butir table header on first page of this clause
            y = checkPage(doc, y, 24);
            y = drawButirTableHeader(y);

            let rowIdx = 0;
            for (const sub of (k.sub_klausul || [])) {
                const subCorrected = sub.is_corrected && sub.original_keputusan;
                const subHasDecision = !!sub.keputusan || subCorrected;

                // Sub-klausul: wrapped within Col 1 (preserving vertical grid line!)
                doc.font(FONT_REG);
                const subTitleLines = wrapText(doc, sub.judul || '', bColW[1] - 8, 8);
                const subRowH = Math.max(subCorrected ? 30 : 20, subTitleLines.length * 11 + 8);

                y = checkButirPage(y, subRowH + 10);

                // Row background filled once with #F0F0F0
                rectFill(doc, 50, y, pageW, subRowH, '#F0F0F0');

                let scx = 50;

                // Col 0: Sub.kode (e.g. 7.1) — uniform 0.5 stroke, Arial size 8, NOT bold
                rectStroke(doc, scx, y, bColW[0], subRowH, 'black', 0.5);
                doc.fillColor('black').fontSize(8).font(FONT_REG)
                    .text(sub.kode || '', scx + 2, y + (subRowH - 9) / 2, { width: bColW[0] - 4, align: 'center', lineBreak: false });
                scx += bColW[0];

                // Col 1: Sub.judul — uniform 0.5 stroke, Arial size 8, NOT bold
                rectStroke(doc, scx, y, bColW[1], subRowH, 'black', 0.5);
                const subTextStartY = y + (subRowH - subTitleLines.length * 10) / 2;
                subTitleLines.forEach((tl, tli) => {
                    doc.fillColor('black').fontSize(8).font(FONT_REG)
                        .text(tl, scx + 4, subTextStartY + tli * 10, { width: bColW[1] - 8, lineBreak: false });
                });
                scx += bColW[1];

                // Col 2: Hasil / Catatan (sub level) — uniform 0.5 stroke, separate vertical border!
                rectStroke(doc, scx, y, bColW[2], subRowH, 'black', 0.5);
                let subNoteText = sub.hasil_catatan || '';
                if (subCorrected) {
                    subNoteText = subNoteText ? `${subNoteText} [Koreksi: ${sub.original_keputusan} → ${sub.keputusan}]` : `[Koreksi: ${sub.original_keputusan} → ${sub.keputusan}]`;
                }
                if (subNoteText) {
                    const subNoteLines = wrapText(doc, subNoteText, bColW[2] - 8, 8);
                    const subNoteStartY = y + (subRowH - subNoteLines.length * 10) / 2;
                    subNoteLines.forEach((nl, nli) => {
                        doc.fillColor('black').fontSize(8).font(FONT_REG)
                            .text(nl, scx + 4, subNoteStartY + nli * 10, { width: bColW[2] - 8, lineBreak: false });
                    });
                }
                scx += bColW[2];

                // Col 3: Keputusan (sub level) — uniform 0.5 stroke, NOT bold
                rectStroke(doc, scx, y, bColW[3], subRowH, 'black', 0.5);
                if (subHasDecision) {
                    renderDecisionCell(sub, scx, y, subRowH, bColW[3]);
                }
                y += subRowH;

                for (const b of (sub.butir || [])) {
                    const isCorrected = b.is_corrected && b.original_keputusan;
                    doc.font(FONT_REG);
                    let noteText = b.hasil_catatan || '';
                    if (isCorrected) {
                        noteText = noteText ? `${noteText} [Koreksi: ${b.original_keputusan} → ${b.keputusan}]` : `[Koreksi: ${b.original_keputusan} → ${b.keputusan}]`;
                    }
                    if (!noteText) noteText = '-';

                    const textLines = wrapText(doc, b.teks || '', bColW[1] - 8, 8);
                    const noteLines = wrapText(doc, noteText, bColW[2] - 8, 8);
                    const rowH = Math.max(isCorrected ? 32 : 20,
                        Math.max(textLines.length, noteLines.length) * 11 + 8);

                    y = checkButirPage(y, rowH);
                    rectFill(doc, 50, y, pageW, rowH, rowIdx % 2 === 0 ? '#FFFFFF' : '#FAFAFA');
                    let cx = 50;

                    // Col 0: No. — intentionally blank for butir (uniform 0.5 black stroke!)
                    rectStroke(doc, cx, y, bColW[0], rowH, 'black', 0.5);
                    cx += bColW[0];

                    // Col 1: Teks — Arial size 8, NOT bold
                    rectStroke(doc, cx, y, bColW[1], rowH, 'black', 0.5);
                    const textStartY = y + (rowH - textLines.length * 10) / 2;
                    textLines.forEach((l, li) => doc.fillColor('black').fontSize(8).font(FONT_REG)
                        .text(l, cx + 4, textStartY + li * 10, { width: bColW[1] - 8, lineBreak: false }));
                    cx += bColW[1];

                    // Col 2: Hasil / Catatan — Arial size 8, NOT bold
                    rectStroke(doc, cx, y, bColW[2], rowH, 'black', 0.5);
                    const noteStartY = y + (rowH - noteLines.length * 10) / 2;
                    noteLines.forEach((l, li) => doc.fillColor('black').fontSize(8).font(FONT_REG)
                        .text(l, cx + 4, noteStartY + li * 10, { width: bColW[2] - 8, lineBreak: false }));
                    doc.font(FONT_REG);
                    cx += bColW[2];

                    // Col 3: Keputusan — NOT bold, black for L/TB, red for G
                    rectStroke(doc, cx, y, bColW[3], rowH, 'black', 0.5);
                    renderDecisionCell(b, cx, y, rowH, bColW[3]);

                    y += rowH;
                    rowIdx++;
                }
            }

            y += 14;
        }

        // Collect all appendix tables from all approved clauses to render after clauses end
        const allAppendixTables = [];
        for (const k of approvedKlausuls) {
            for (const sub of (k.sub_klausul || [])) {
                (resolvedTables[sub.kode] || []).forEach((t) => {
                    allAppendixTables.push({ ...t, clauseNum: sub.kode, clauseTitle: sub.judul || k.judul || '' });
                });
            }
            (resolvedTables[k.klausul] || []).forEach((t) => {
                allAppendixTables.push({ ...t, clauseNum: k.klausul, clauseTitle: k.judul || '' });
            });
        }

        const uniqueAppendixTables = [];
        const seenInstIds = new Set();
        for (const t of allAppendixTables) {
            const key = t.instanceId || `${t.clauseNum}-${t.title}`;
            if (!seenInstIds.has(key)) {
                seenInstIds.add(key);
                uniqueAppendixTables.push(t);
            }
        }

        // Appendix section rendered at the END of all clauses
        if (uniqueAppendixTables.length > 0) {
            doc.addPage();
            y = PAGE_TOP;

            rectFill(doc, 50, y, pageW, 26, '#282828');
            doc.fillColor('white').fontSize(11).font(FONT_BOLD)
                .text('LAMPIRAN TABEL HASIL PENGUJIAN', 56, y + 7, { width: pageW - 12, lineBreak: false });
            doc.fillColor('black');
            y += 36;

            uniqueAppendixTables
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .forEach((t) => {
                    if (t.spreadsheetGrid && Object.keys(t.spreadsheetGrid.cells || {}).length > 0) {
                        y = drawSpreadsheetTable(doc, t, y, pageW, fontBundle);
                    } else {
                        y = drawTemplateTable(doc, t, y, pageW, fontBundle);
                    }
                });
        }

        if (approvedKlausuls.length === 0) {
            doc.fillColor('#999999').fontSize(12).font(FONT_REG)
                .text('Belum ada klausul yang disetujui.', 50, y + 40, { align: 'center', width: pageW });
            doc.fillColor('black');
        }

        // Footer — document-control strip
        const formNo = sample.testStandard?.form_code || DOC_CONTROL.form;
        const range = doc.bufferedPageRange();
        for (let p = 0; p < range.count; p++) {
            doc.switchToPage(range.start + p);

            if (LOGO_BUFFER && p > 0) {
                doc.image(LOGO_BUFFER, 550 - LOGO_W, 38, { width: LOGO_W });
            }

            const savedBottom = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;

            const fy = doc.page.height - 38;
            doc.save().moveTo(50, fy - 6).lineTo(550, fy - 6).lineWidth(0.5).strokeColor('#999999').stroke().restore();
            doc.fillColor('#555555').fontSize(7.5).font(FONT_REG)
                .text(formNo, 50, fy, { align: 'left', width: pageW * 0.25, lineBreak: false })
                .text(DOC_CONTROL.rev, 50 + pageW * 0.25, fy, { align: 'center', width: pageW * 0.2, lineBreak: false })
                .text(`Mulai Berlaku : ${DOC_CONTROL.effective}`, 50 + pageW * 0.45, fy, { align: 'center', width: pageW * 0.32, lineBreak: false })
                .text(`Hal ${p + 1} dari ${range.count}`, 50, fy, { align: 'right', width: pageW, lineBreak: false });
            doc.fillColor('black');

            doc.page.margins.bottom = savedBottom;
        }

        doc.flushPages();
        doc.end();
    });

    // Encrypt
    const libDoc = await LibPDFDoc.load(pdfBuffer);
    const enc = await libDoc.save({
        userPassword: password,
        ownerPassword: crypto.randomBytes(16).toString('hex'),
        permissions: { printing: 'lowResolution', modifying: false, copying: false, annotating: false, fillingForms: false, contentAccessibility: true, documentAssembly: false },
    });

    return { buffer: Buffer.from(enc), password };
}

module.exports = { generateDatasheetPdf };
