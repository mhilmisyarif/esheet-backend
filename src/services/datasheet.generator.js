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

// Unicode font for Hasil/Catatan cells — the technician's notes may contain
// technical symbols (Ω, ⏚, ⎓, ⧈, ½, superscripts) that Helvetica's WinAnsi
// encoding cannot render. Segoe UI Symbol covers Latin + these ranges.
// Falls back to Helvetica when the asset is missing.
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

// Formats a date range in the lab's report style:
//   same day              → "5 Juni 2026"
//   same month & year     → "1 - 30 Juli 2026"
//   same year, diff month → "5 Juni - 10 Juli 2026"
//   different years       → "20 Desember 2025 - 5 Januari 2026"
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

// Tanggal pengujian = range of the "Tanggal Uji" dates the technician fills
// per klausul in the editor (earliest → latest). The activity timestamps
// (test_started_at / test_finished_at) are only a fallback when no klausul
// meta dates were filled.
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

// PDFKit safe helpers — .fill() consumes the path so we can't chain .stroke() after it
function rectFill(doc, x, y, w, h, color) {
    doc.save().rect(x, y, w, h).fillColor(color).fill().restore();
}
function rectStroke(doc, x, y, w, h, color = 'black', lw = 0.5) {
    doc.save().rect(x, y, w, h).strokeColor(color).lineWidth(lw).stroke().restore();
}
function rectFillStroke(doc, x, y, w, h, fill, stroke = 'black', lw = 0.5) {
    doc.save().rect(x, y, w, h).fillAndStroke(fill, stroke).lineWidth(lw).restore();
}

function wrapText(doc, text, maxW, fs) {
    doc.fontSize(fs);
    const words = String(text || '-').split(' ');
    const lines = []; let cur = '';
    for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (doc.widthOfString(t) <= maxW) { cur = t; }
        else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : ['-'];
}

// Continuation pages reserve headroom for the full-size logo (y 38–86)
// stamped in the final page pass, so content starts below it.
const PAGE_TOP = 95;

function checkPage(doc, y, needed = 80) {
    if (y + needed > doc.page.height - 60) { doc.addPage(); return PAGE_TOP; }
    return y;
}

function drawTable(doc, x, y, tableW, headers, rows, colWidths) {
    const HH = 22; const RF = 8.5; const HF = 9;
    rectFill(doc, x, y, tableW, HH, '#DCDCDC');
    let cx = x;
    headers.forEach((h, i) => {
        rectStroke(doc, cx, y, colWidths[i], HH);
        doc.fillColor('black').fontSize(HF).font('Helvetica-Bold')
            .text(h, cx + 4, y + 6, { width: colWidths[i] - 8, align: 'center', lineBreak: false });
        cx += colWidths[i];
    });
    y += HH;
    rows.forEach((row, ri) => {
        let maxL = 1;
        row.forEach((cell, ci) => { maxL = Math.max(maxL, wrapText(doc, String(cell ?? '-'), colWidths[ci] - 8, RF).length); });
        const rh = Math.max(20, maxL * (RF + 3) + 8);
        rectFill(doc, x, y, tableW, rh, ri % 2 === 0 ? '#FFFFFF' : '#F8F8F8');
        cx = x;
        row.forEach((cell, ci) => {
            rectStroke(doc, cx, y, colWidths[ci], rh);
            const lines = wrapText(doc, String(cell ?? '-'), colWidths[ci] - 8, RF);
            const ty = y + (rh - lines.length * (RF + 2)) / 2;
            doc.fillColor('black').fontSize(RF).font('Helvetica');
            lines.forEach((l, li) => doc.text(l, cx + 4, ty + li * (RF + 2), { width: colWidths[ci] - 8, lineBreak: false }));
            cx += colWidths[ci];
        });
        y += rh;
    });
    return y;
}

async function generateDatasheetPdf(report, klausulStatuses, resolvedTables = {}) {
    const { sample, technician } = report;
    const { order } = sample;
    const password = derivePassword(report);
    const pageW = 495;

    const approvedKlausuls = (report.data || []).filter(k => klausulStatuses[k.klausul]?.status === 'APPROVED');

    // Pre-generate QR codes
    const qrMap = {};
    for (const k of approvedKlausuls) {
        const text = `ESHEET|K:${k.klausul}|T:${report.technicianId || 0}|R:${report.id}`;
        qrMap[k.klausul] = { text, buffer: await generateQR(text) };
    }

    const pdfBuffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 }, bufferPages: true });
        // Font used for note cells; falls back to Helvetica without the asset
        const NOTE_FONT = HAS_CATATAN_FONT ? 'CatatanFont' : 'Helvetica';
        if (HAS_CATATAN_FONT) doc.registerFont('CatatanFont', CATATAN_FONT_PATH);
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        let y = 50;

        // Cover — centered title, SUCOFINDO logo at the top-right corner
        // (matches the printed LEMBAR DATA UJI form header).
        const LOGO_W = 68; // source is 341×241 → renders ≈48pt tall
        if (LOGO_BUFFER) {
            doc.image(LOGO_BUFFER, 550 - LOGO_W, 38, { width: LOGO_W });
        }
        doc.fillColor('black').fontSize(16).font('Helvetica-Bold')
            .text('LEMBAR DATA UJI (DATASHEET)', 50, y, { align: 'center', width: pageW });
        y += 22;
        doc.fontSize(10).font('Helvetica').text('PT. SUCOFINDO', 50, y, { align: 'center', width: pageW });
        y += 10;
        // Keep the rule below the logo so they don't overlap
        if (LOGO_BUFFER) y = Math.max(y, 90);
        doc.save().moveTo(50, y).lineTo(550, y).lineWidth(1.5).strokeColor('black').stroke().restore();
        y += 14;

        // Metadata — label/value rows like the printed LEMBAR DATA UJI form.
        // Standar/Referensi lists every standard number on its own row.
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
            ['Penguji', technician?.name || '-'],
            ['Tanggal Terima Sampel', sample.received_date ? formatDate(sample.received_date) : '-'],
            ['Tanggal Pengujian', testDateRange(report, approvedKlausuls)],
        ];
        const kvColW = [pageW * 0.32, pageW * 0.68];
        metaRows.forEach(([label, value]) => {
            const valLines = wrapText(doc, String(value ?? '-'), kvColW[1] - 12, 9);
            const rh = Math.max(22, valLines.length * 12 + 10);
            y = checkPage(doc, y, rh);
            rectFillStroke(doc, 50, y, kvColW[0], rh, '#F2F2F2');
            rectStroke(doc, 50 + kvColW[0], y, kvColW[1], rh);
            doc.fillColor('black').fontSize(9).font('Helvetica-Bold')
                .text(label, 56, y + (rh - 10) / 2, { width: kvColW[0] - 12, lineBreak: false });
            doc.font('Helvetica');
            valLines.forEach((l, li) => doc.text(l, 56 + kvColW[0], y + 5 + li * 12, { width: kvColW[1] - 12, lineBreak: false }));
            y += rh;
        });
        y += 18;

        // ── Appendix table renderer (System A resolved tables) ──────────────
        // Draws one resolved table (key_value + table sections) starting at y,
        // returns the new y. Uses the module PDFKit helpers + NOTE_FONT so
        // symbols (Ω ⏚ ½ …) print in cells.
        const resultColor = (v) =>
            v === 'L' ? '#007A00' : v === 'G' ? '#B40000' : '#505050';

        const drawTemplateTable = (tbl, startY) => {
            let ty = startY;
            const RF = 8;

            // Table title
            if (tbl.title) {
                ty = checkPage(doc, ty, 20);
                doc.fillColor('#282828').fontSize(9).font('Helvetica-Bold')
                    .text(tbl.title, 50, ty, { width: pageW, lineBreak: false });
                ty += 15;
            }

            tbl.resolved.sections.forEach((section) => {
                if (section.label) {
                    ty = checkPage(doc, ty, 16);
                    doc.fillColor('#333333').fontSize(8).font('Helvetica-Bold')
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
                        rectFillStroke(doc, 50, ty, labelW, rh, '#F2F2F2');
                        rectStroke(doc, 50 + labelW, ty, valW, rh);
                        doc.fillColor('black').fontSize(RF).font('Helvetica');
                        lines.forEach((l, li) => doc.text(l, 56, ty + 4 + li * (RF + 3), { width: labelW - 8, lineBreak: false }));
                        doc.font(NOTE_FONT);
                        vLines.forEach((l, li) => doc.text(l, 56 + labelW, ty + 4 + li * (RF + 3), { width: valW - 8, lineBreak: false }));
                        doc.font('Helvetica');
                        if (hasResult) {
                            rectStroke(doc, 50 + labelW + valW, ty, resW, rh);
                            doc.fillColor(resultColor(r.result)).fontSize(9).font('Helvetica-Bold')
                                .text(r.result || '-', 50 + labelW + valW, ty + rh / 2 - 6, { width: resW, align: 'center', lineBreak: false });
                        }
                        ty += rh;
                    });
                } else if (section.type === 'table') {
                    const cols = section.columns;
                    // Column widths: honour width hints proportionally, else equal
                    const totalHint = cols.reduce((s, c) => s + (c.width || 0), 0);
                    const colW = cols.map((c) =>
                        totalHint > 0 && c.width
                            ? (c.width / totalHint) * pageW
                            : pageW / cols.length,
                    );
                    // normalise to exactly pageW
                    const sum = colW.reduce((s, w) => s + w, 0);
                    for (let ci = 0; ci < colW.length; ci++) colW[ci] = (colW[ci] / sum) * pageW;

                    // Header
                    ty = checkPage(doc, ty, 20);
                    rectFill(doc, 50, ty, pageW, 18, '#DCDCDC');
                    let cx = 50;
                    cols.forEach((c, ci) => {
                        rectStroke(doc, cx, ty, colW[ci], 18);
                        doc.fillColor('black').fontSize(7.5).font('Helvetica-Bold')
                            .text(c.header || '', cx + 3, ty + 5, { width: colW[ci] - 6, align: 'center', lineBreak: false });
                        cx += colW[ci];
                    });
                    ty += 18;

                    // Rows
                    let renderedGroup = null;
                    section.rows.forEach((row) => {
                        if (row.groupLabel && row.groupLabel !== renderedGroup) {
                            renderedGroup = row.groupLabel;
                            ty = checkPage(doc, ty, 16);
                            rectFillStroke(doc, 50, ty, pageW, 14, '#F0F0F0', '#CCCCCC');
                            doc.fillColor('#555555').fontSize(7).font('Helvetica-Bold')
                                .text(row.groupLabel, 56, ty + 3.5, { width: pageW - 12, lineBreak: false });
                            ty += 14;
                        }
                        let maxL = 1;
                        cols.forEach((c, ci) => {
                            maxL = Math.max(maxL, wrapText(doc, String(row.cells[c.id] ?? ''), colW[ci] - 6, RF).length);
                        });
                        const rh = Math.max(16, maxL * (RF + 3) + 6);
                        ty = checkPage(doc, ty, rh);
                        cx = 50;
                        cols.forEach((c, ci) => {
                            rectStroke(doc, cx, ty, colW[ci], rh);
                            const val = row.cells[c.id];
                            if (c.isResult) {
                                doc.fillColor(resultColor(val)).fontSize(9).font('Helvetica-Bold')
                                    .text(val || '-', cx, ty + rh / 2 - 6, { width: colW[ci], align: 'center', lineBreak: false });
                            } else {
                                doc.fillColor('black').fontSize(RF).font(NOTE_FONT);
                                const lines = wrapText(doc, String(val ?? ''), colW[ci] - 6, RF);
                                const oy = ty + (rh - lines.length * (RF + 2)) / 2;
                                lines.forEach((l, li) => doc.text(l, cx + 3, oy + li * (RF + 2), { width: colW[ci] - 6, align: 'center', lineBreak: false }));
                                doc.font('Helvetica');
                            }
                            cx += colW[ci];
                        });
                        ty += rh;
                    });

                    // Footnote
                    if (section.footnote) {
                        const fnLines = wrapText(doc, section.footnote, pageW - 4, 7);
                        ty = checkPage(doc, ty, fnLines.length * 10 + 4);
                        doc.fillColor('#555555').fontSize(7).font('Helvetica-Oblique');
                        fnLines.forEach((l, li) => doc.text(l, 52, ty + 2 + li * 9, { width: pageW - 4, lineBreak: false }));
                        doc.font('Helvetica').fillColor('black');
                        ty += fnLines.length * 9 + 4;
                    }
                }
                ty += 6;
            });
            return ty;
        };

        // Per-klausul
        for (let i = 0; i < approvedKlausuls.length; i++) {
            const k = approvedKlausuls[i];
            const kStatus = klausulStatuses[k.klausul];
            const qr = qrMap[k.klausul];

            if (i > 0) { doc.addPage(); y = PAGE_TOP; }

            // Title bar
            rectFill(doc, 50, y, pageW, 26, '#282828');
            doc.fillColor('white').fontSize(11).font('Helvetica-Bold')
                .text(`KLAUSUL ${k.klausul} — ${(k.judul || '').toUpperCase()}`, 56, y + 7, { width: pageW - 12, lineBreak: false });
            doc.fillColor('black');
            y += 30;

            // Info + QR
            const QR_SIZE = 60;
            const infoW = qr.buffer ? pageW - QR_SIZE - 6 : pageW;
            const boxH = 62;

            rectStroke(doc, 50, y, infoW, boxH);
            // 3 columns × 2 rows: people/dates + room conditions (from the
            // klausul meta the technician filled in the editor).
            const suhu = k.meta?.temperature != null && k.meta.temperature !== ''
                ? `${k.meta.temperature} °C (20 ± 5)` : '-';
            const lembab = k.meta?.humidity != null && k.meta.humidity !== ''
                ? `${k.meta.humidity} %RH (≤ 65)` : '-';
            const infoItems = [
                ['Diuji oleh', kStatus?.submittedBy?.name || technician?.name || '-'],
                ['Disetujui oleh', kStatus?.approvedBy?.name || '-'],
                ['Suhu Ruang', suhu],
                ['Tanggal Uji', formatDateShort(k.meta?.test_datetime || kStatus?.submittedAt)],
                ['Tanggal Disetujui', formatDateShort(kStatus?.approvedAt)],
                ['Kelembapan Ruang', lembab],
            ];
            const thirdW = infoW / 3;
            infoItems.forEach(([label, value], idx) => {
                const col = idx % 3, row = Math.floor(idx / 3);
                const ix = 50 + col * thirdW + 6, iy = y + row * 28 + 6;
                doc.fontSize(7).font('Helvetica-Bold').fillColor('#666666').text(label + ':', ix, iy, { lineBreak: false });
                doc.fontSize(8.5).font('Helvetica').fillColor('#111111').text(value, ix, iy + 9, { lineBreak: false, width: thirdW - 12 });
            });
            doc.fillColor('black');

            if (qr.buffer) {
                rectStroke(doc, 50 + infoW + 6, y, QR_SIZE, boxH);
                doc.image(qr.buffer, 50 + infoW + 8, y + 4, { width: QR_SIZE - 4, height: QR_SIZE - 4 });
            }
            y += boxH + 4;

            if (qr.buffer) {
                doc.fontSize(5.5).font('Helvetica').fillColor('#AAAAAA')
                    .text(qr.text, 50 + infoW + 6, y - 2, { width: QR_SIZE, align: 'center', lineBreak: false });
                doc.fillColor('black');
            }

            // Correction note
            if (kStatus?.corrections) {
                y = checkPage(doc, y, 24);
                rectFillStroke(doc, 50, y, pageW, 22, '#FFF8E1', '#E6A817');
                doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#8B5E00')
                    .text('Koreksi: ', 56, y + 6, { continued: true, lineBreak: false });
                doc.font('Helvetica').text(kStatus.corrections, { lineBreak: false });
                doc.fillColor('black');
                y += 26;
            }
            y += 8;

            // Butir table
            const bColW = [pageW * 0.07, pageW * 0.50, pageW * 0.27, pageW * 0.16];
            const bHeaders = ['No.', 'Syarat-syarat Pengujian', 'Hasil / Catatan', 'Keputusan'];

            y = checkPage(doc, y, 24);
            rectFill(doc, 50, y, pageW, 22, '#D2D2D2');
            let cx = 50;
            bHeaders.forEach((h, hi) => {
                rectStroke(doc, cx, y, bColW[hi], 22);
                doc.fillColor('black').fontSize(8.5).font('Helvetica-Bold')
                    .text(h, cx + 3, y + 6, { width: bColW[hi] - 6, align: 'center', lineBreak: false });
                cx += bColW[hi];
            });
            y += 22;

            // Render the L/TB/G cell — either plain or, if corrected, as
            // "~~orig~~ new" (side-by-side) with a "by: ..." attribution
            // below. Extracted so both butir and sub-klausul rows can use it.
            const renderDecisionCell = (item, cellX, cellY, cellH) => {
                const isCorrected = item.is_corrected && item.original_keputusan;
                const midY = cellY + cellH / 2 - 7;
                if (isCorrected) {
                    doc.fontSize(9).font('Helvetica');
                    const origW = doc.widthOfString(item.original_keputusan);
                    doc.fontSize(11).font('Helvetica-Bold');
                    const newW = doc.widthOfString(item.keputusan || '-');
                    const gap = 5;
                    const totalW = origW + gap + newW;
                    const startX = cellX + (bColW[3] - totalW) / 2;
                    const baselineY = cellY + 5;

                    // Original — red with horizontal strikethrough
                    doc.fillColor('#B40000').fontSize(9).font('Helvetica')
                        .text(item.original_keputusan, startX, baselineY + 2, { lineBreak: false });
                    doc.save()
                        .moveTo(startX, baselineY + 6)
                        .lineTo(startX + origW, baselineY + 6)
                        .lineWidth(1).strokeColor('#B40000').stroke().restore();

                    // New keputusan — standard color
                    const rc = item.keputusan === 'L' ? '#007A00'
                        : item.keputusan === 'G' ? '#B40000' : '#505050';
                    doc.fillColor(rc).fontSize(11).font('Helvetica-Bold')
                        .text(item.keputusan || '-', startX + origW + gap, baselineY, { lineBreak: false });

                    // "Rev by <name>" attribution below
                    if (item.corrected_by) {
                        doc.fillColor('#555555').fontSize(6).font('Helvetica-Bold')
                            .text(`Rev by ${item.corrected_by}`, cellX + 2, cellY + cellH - 9,
                                { width: bColW[3] - 4, align: 'center', lineBreak: false });
                    }
                } else {
                    const rc = item.keputusan === 'L' ? '#007A00'
                        : item.keputusan === 'G' ? '#B40000' : '#505050';
                    doc.fillColor(rc).fontSize(11).font('Helvetica-Bold')
                        .text(item.keputusan || '-', cellX + 3, midY,
                            { width: bColW[3] - 6, align: 'center', lineBreak: false });
                }
                doc.fillColor('black');
            };

            let rowIdx = 0;
            for (const sub of (k.sub_klausul || [])) {
                const subCorrected = sub.is_corrected && sub.original_keputusan;
                const subHasDecision = !!sub.keputusan || subCorrected;
                const subRowH = subCorrected ? 30 : (subHasDecision ? 22 : 18);

                y = checkPage(doc, y, subRowH + 10);
                rectFillStroke(doc, 50, y, pageW, subRowH, '#F0F0F0', '#CCCCCC');

                // Sub-klausul label — leave the last column free for keputusan
                const labelWidth = subHasDecision
                    ? pageW - bColW[3] - 12
                    : pageW - 12;
                doc.fillColor('black').fontSize(8).font('Helvetica-Bold')
                    .text(`${sub.kode}${sub.judul ? ` — ${sub.judul}` : ''}`,
                        56, y + (subRowH - 10) / 2,
                        { width: labelWidth, lineBreak: false });

                if (subHasDecision) {
                    renderDecisionCell(sub, 50 + pageW - bColW[3], y, subRowH);
                }
                y += subRowH;

                for (const b of (sub.butir || [])) {
                    const isCorrected = b.is_corrected && b.original_keputusan;
                    doc.font('Helvetica');
                    const textLines = wrapText(doc, b.teks || '', bColW[1] - 6, 8);
                    // Measure notes with the symbol-capable font they render in
                    doc.font(NOTE_FONT);
                    const noteLines = wrapText(doc, b.hasil_catatan || '-', bColW[2] - 6, 8);
                    doc.font('Helvetica');
                    const rowH = Math.max(isCorrected ? 32 : 22,
                        Math.max(textLines.length, noteLines.length) * 11 + 8);

                    y = checkPage(doc, y, rowH);
                    rectFill(doc, 50, y, pageW, rowH, rowIdx % 2 === 0 ? '#FFFFFF' : '#FAFAFA');
                    cx = 50;

                    // No.
                    rectStroke(doc, cx, y, bColW[0], rowH);
                    doc.fillColor('black').fontSize(8).font('Helvetica')
                        .text(b.kode, cx + 2, y + rowH / 2 - 5, { width: bColW[0] - 4, align: 'center', lineBreak: false });
                    cx += bColW[0];

                    // Teks
                    rectStroke(doc, cx, y, bColW[1], rowH);
                    textLines.forEach((l, li) => doc.fillColor('black').fontSize(8).font('Helvetica')
                        .text(l, cx + 4, y + 4 + li * 11, { width: bColW[1] - 8, lineBreak: false }));
                    cx += bColW[1];

                    // Hasil — symbol-capable font (Ω, ⏚, ⎓, ⧈, pecahan, …)
                    rectStroke(doc, cx, y, bColW[2], rowH);
                    noteLines.forEach((l, li) => doc.fillColor('black').fontSize(8).font(NOTE_FONT)
                        .text(l, cx + 4, y + 4 + li * 11, { width: bColW[2] - 8, lineBreak: false }));
                    doc.font('Helvetica');
                    cx += bColW[2];

                    // Keputusan (with correction indicator when applicable)
                    rectStroke(doc, cx, y, bColW[3], rowH);
                    renderDecisionCell(b, cx, y, rowH);

                    y += rowH;
                    rowIdx++;
                }
            }

            // Appendix tables (LAMPIRAN) belonging to this klausul's sub-clauses
            const klausulTables = [];
            for (const sub of (k.sub_klausul || [])) {
                (resolvedTables[sub.kode] || []).forEach((t) => klausulTables.push(t));
            }
            if (klausulTables.length > 0) {
                y = checkPage(doc, y, 30);
                y += 6;
                doc.fillColor('#282828').fontSize(9.5).font('Helvetica-Bold')
                    .text('LAMPIRAN TABEL', 50, y, { width: pageW, lineBreak: false });
                y += 15;
                klausulTables
                    .sort((a, b) => a.order - b.order)
                    .forEach((t) => { y = drawTemplateTable(t, y); });
            }

            y += 14;
        }

        if (approvedKlausuls.length === 0) {
            doc.fillColor('#999999').fontSize(12).font('Helvetica')
                .text('Belum ada klausul yang disetujui.', 50, y + 40, { align: 'center', width: pageW });
            doc.fillColor('black');
        }

        // Footer — document-control strip like the printed form:
        // FOR-LAB-CHY-09 | Rev.01 | Mulai Berlaku : 18/12/2023 | Hal X dari Y
        // The form number differs per standard (stored on TestStandard).
        const formNo = sample.testStandard?.form_code || DOC_CONTROL.form;
        const range = doc.bufferedPageRange();
        for (let p = 0; p < range.count; p++) {
            doc.switchToPage(range.start + p);

            // Full-size logo on every page, same position as the cover
            // (content on continuation pages starts at PAGE_TOP=95, below it).
            if (LOGO_BUFFER && p > 0) {
                doc.image(LOGO_BUFFER, 550 - LOGO_W, 38, { width: LOGO_W });
            }

            // Drawing text below the bottom margin makes PDFKit auto-add a
            // page (which is why the footer never appeared). Zero the margin
            // while stamping the footer, then restore it.
            const savedBottom = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;

            const fy = doc.page.height - 38;
            doc.save().moveTo(50, fy - 6).lineTo(550, fy - 6).lineWidth(0.5).strokeColor('#999999').stroke().restore();
            doc.fillColor('#555555').fontSize(7.5).font('Helvetica')
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
