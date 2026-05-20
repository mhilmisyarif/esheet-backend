/**
 * src/services/datasheet.generator.js
 * Dependencies: npm install pdfkit pdf-lib qrcode
 */

const PDFDocument = require('pdfkit');
const { PDFDocument: LibPDFDoc } = require('pdf-lib');
const QRCode = require('qrcode');
const crypto = require('crypto');

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

function checkPage(doc, y, needed = 80) {
    if (y + needed > doc.page.height - 60) { doc.addPage(); return 60; }
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

async function generateDatasheetPdf(report, klausulStatuses) {
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
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        let y = 50;

        // Cover
        doc.fillColor('black').fontSize(16).font('Helvetica-Bold')
            .text('LEMBAR DATA UJI (DATASHEET)', 50, y, { align: 'center', width: pageW });
        y += 22;
        doc.fontSize(10).font('Helvetica').text('PT. SUCOFINDO', 50, y, { align: 'center', width: pageW });
        y += 10;
        doc.save().moveTo(50, y).lineTo(550, y).lineWidth(1.5).strokeColor('black').stroke().restore();
        y += 14;

        // Metadata
        const metaRows = [
            ['No. Order', order.order_no || '-'],
            ['Nama Contoh', sample.name || '-'],
            ['Merek', sample.brand || '-'],
            ['Model', sample.model || '-'],
            ['Standar', sample.testStandard?.name || report.doc_standard || '-'],
            ['Jenis Pengujian', report.testing_type || 'FULL'],
            ['Teknisi', technician?.name || '-'],
            ['Tanggal Cetak', formatDate(new Date())],
        ];
        y = drawTable(doc, 50, y, pageW, ['Keterangan', 'Nilai'], metaRows, [pageW * 0.35, pageW * 0.65]);
        y += 18;

        // Per-klausul
        for (let i = 0; i < approvedKlausuls.length; i++) {
            const k = approvedKlausuls[i];
            const kStatus = klausulStatuses[k.klausul];
            const qr = qrMap[k.klausul];

            if (i > 0) { doc.addPage(); y = 50; }

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
            const infoItems = [
                ['Diuji oleh', kStatus?.submittedBy?.name || technician?.name || '-'],
                ['Tanggal submit', formatDateShort(kStatus?.submittedAt)],
                ['Disetujui oleh', kStatus?.approvedBy?.name || '-'],
                ['Tanggal setujui', formatDateShort(kStatus?.approvedAt)],
            ];
            const halfW = infoW / 2;
            infoItems.forEach(([label, value], idx) => {
                const col = idx % 2, row = Math.floor(idx / 2);
                const ix = 50 + col * halfW + 6, iy = y + row * 28 + 6;
                doc.fontSize(7).font('Helvetica-Bold').fillColor('#666666').text(label + ':', ix, iy, { lineBreak: false });
                doc.fontSize(8.5).font('Helvetica').fillColor('#111111').text(value, ix, iy + 9, { lineBreak: false, width: halfW - 12 });
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

            let rowIdx = 0;
            for (const sub of (k.sub_klausul || [])) {
                y = checkPage(doc, y, 28);
                rectFillStroke(doc, 50, y, pageW, 18, '#F0F0F0', '#CCCCCC');
                doc.fillColor('black').fontSize(8).font('Helvetica-Bold')
                    .text(`${sub.kode}${sub.judul ? ` — ${sub.judul}` : ''}`, 56, y + 4, { width: pageW - 12, lineBreak: false });
                y += 18;

                for (const b of (sub.butir || [])) {
                    const isCorrected = b.is_corrected && b.original_keputusan;
                    const textLines = wrapText(doc, b.teks || '', bColW[1] - 6, 8);
                    const noteLines = wrapText(doc, b.hasil_catatan || '-', bColW[2] - 6, 8);
                    const rowH = Math.max(22, Math.max(textLines.length, noteLines.length) * 11 + 8);

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

                    // Hasil
                    rectStroke(doc, cx, y, bColW[2], rowH);
                    noteLines.forEach((l, li) => doc.fillColor('black').fontSize(8).font('Helvetica')
                        .text(l, cx + 4, y + 4 + li * 11, { width: bColW[2] - 8, lineBreak: false }));
                    cx += bColW[2];

                    // Keputusan
                    rectStroke(doc, cx, y, bColW[3], rowH);
                    const cy2 = y + rowH / 2 - 7;
                    if (isCorrected) {
                        const ox = cx + bColW[3] / 2 - 10;
                        doc.fillColor('red').fontSize(8).font('Helvetica').text(b.original_keputusan, ox, cy2 - 5, { lineBreak: false });
                        const ow = doc.widthOfString(b.original_keputusan);
                        doc.save().moveTo(ox, cy2).lineTo(ox + ow, cy2).lineWidth(1).strokeColor('red').stroke().restore();
                        doc.fillColor('#007A00').fontSize(9).font('Helvetica-Bold').text(`→ ${b.keputusan}`, ox, cy2 + 5, { lineBreak: false });
                    } else {
                        const rc = b.keputusan === 'L' ? '#007A00' : b.keputusan === 'G' ? '#B40000' : '#505050';
                        doc.fillColor(rc).fontSize(11).font('Helvetica-Bold')
                            .text(b.keputusan || '-', cx + 3, cy2, { width: bColW[3] - 6, align: 'center', lineBreak: false });
                    }
                    doc.fillColor('black');
                    y += rowH;
                    rowIdx++;
                }
            }
            y += 14;
        }

        if (approvedKlausuls.length === 0) {
            doc.fillColor('#999999').fontSize(12).font('Helvetica')
                .text('Belum ada klausul yang disetujui.', 50, y + 40, { align: 'center', width: pageW });
            doc.fillColor('black');
        }

        // Footer
        const range = doc.bufferedPageRange();
        for (let p = 0; p < range.count; p++) {
            doc.switchToPage(range.start + p);
            const fy = doc.page.height - 38;
            doc.save().moveTo(50, fy - 6).lineTo(550, fy - 6).lineWidth(0.5).strokeColor('#CCCCCC').stroke().restore();
            doc.fillColor('#999999').fontSize(7).font('Helvetica')
                .text(`PT. SUCOFINDO — ${sample.name || ''} — ${formatDate(new Date())}`, 50, fy, { align: 'left', width: pageW * 0.7, lineBreak: false })
                .text(`Hal. ${p + 1} / ${range.count}`, 50, fy, { align: 'right', width: pageW, lineBreak: false });
            doc.fillColor('black');
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
