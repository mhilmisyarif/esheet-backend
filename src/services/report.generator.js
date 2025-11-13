// src/services/report.generator.js
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ImageRun } = require("docx");
const path = require('path');
const fs = require('fs');

// Helper to create a table row for the main metadata
function createMetaRow(title, value) {
    return new TableRow({
        children: [
            new TableCell({
                children: [new Paragraph({ text: title, style: "MetaKey" })],
                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                padding: { top: 20, bottom: 20, left: 100, right: 100 },
            }),
            new TableCell({
                children: [new Paragraph({ text: ":", style: "MetaKey" })],
                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                padding: { top: 20, bottom: 20, left: 100, right: 100 },
            }),
            new TableCell({
                children: [new Paragraph({ text: value || '-', style: "MetaValue" })],
                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                padding: { top: 20, bottom: 20, left: 100, right: 100 },
                width: { size: 6000, type: WidthType.DXA },
            }),
        ],
    });
}

// Helper to create the main results table
function createResultsTable(reportData) {
    const rows = [
        // Header Row
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph("Klausul")], width: { size: 1000, type: WidthType.DXA } }),
                new TableCell({ children: [new Paragraph("Syarat-syarat Pengujian")] }),
                new TableCell({ children: [new Paragraph("Hasil - Catatan")] }),
                new TableCell({ children: [new Paragraph("Keputusan")] }),
            ],
            tableHeader: true,
        }),
    ];

    // Data Rows
    for (const klausul of reportData) {
        // Main Klausul Row (spans all columns)
        rows.push(new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({ text: `${klausul.klausul} - ${klausul.judul}`, style: "KlausulHeader" })],
                    gridSpan: 4,
                    shading: { fill: "D9EAD3" },
                }),
            ],
        }));

        // Butir Rows
        for (const sub of klausul.sub_klausul) {
            for (const butir of sub.butir) {
                rows.push(new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph(butir.kode)] }),
                        new TableCell({ children: [new Paragraph(butir.teks)] }),
                        new TableCell({ children: [new Paragraph(butir.hasil_catatan || '')] }),
                        new TableCell({ children: [new Paragraph(butir.keputusan || '')] }),
                    ],
                }));
            }
        }
    }
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENT } });
}

// Main generator function
async function generateReportDocx(report) {
    const { sample, order } = report;

    // Read images from disk
    // Note: This is a simplified image handler.
    let images = [];
    if (report.ReportImages && report.ReportImages.length > 0) {
        for (const img of report.ReportImages) {
            const imagePath = path.join(__dirname, '..', '..', img.url);
            if (fs.existsSync(imagePath)) {
                images.push(
                    new Paragraph({
                        children: [
                            new TextRun({ text: img.caption || 'Lampiran Gambar', break: 1 }),
                            new ImageRun({
                                data: fs.readFileSync(imagePath),
                                transformation: { width: 400, height: 300 },
                            }),
                        ],
                    })
                );
            }
        }
    }

    const doc = new Document({
        styles: {
            paragraphStyles: [
                { id: "KlausulHeader", name: "Klausul Header", run: { bold: true } },
                { id: "MetaKey", name: "Meta Key", run: { size: 20 } },
                { id: "MetaValue", name: "Meta Value", run: { size: 20, bold: true } },
            ],
        },
        sections: [{
            children: [
                new Paragraph({
                    text: "LAPORAN HASIL UJI",
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                }),

                // Metadata Table
                new Table({
                    width: { size: 100, type: WidthType.PERCENT },
                    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                    rows: [
                        createMetaRow("APLIKAN / PEMOHON", order.applicant),
                        createMetaRow("ALAMAT", order.address),
                        createMetaRow("NAMA CONTOH", sample.name),
                        createMetaRow("MEREK", sample.brand),
                        createMetaRow("KODE TIPE / MODEL", sample.model),
                        createMetaRow("NOMOR IWO", sample.iwo_no),
                        // ... add other fields from the docx as needed
                    ],
                }),

                new Paragraph({ text: "HASIL PENGUJIAN", heading: HeadingLevel.HEADING_2 }),

                // Main Results Table
                createResultsTable(report.data),

                // ... (Add Attachment Tables here by looping report.data[...].tables)

                // Add Images
                new Paragraph({ text: "LAMPIRAN GAMBAR", heading: HeadingLevel.HEADING_2 }),
                ...images,
            ],
        }],
    });

    // Convert the document to a buffer
    const buffer = await Packer.toBuffer(doc);
    return buffer;
}

module.exports = { generateReportDocx };