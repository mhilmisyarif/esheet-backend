// prisma/example-table-templates.js
//
// Two example appendix-table templates that demonstrate the System-A
// definition shape — used by scripts/seed-example-templates.js and as a
// reference when authoring real templates via TemplateBuilder.

// LAMPIRAN 1 — Komponen: free-form component table with addable rows + footnote.
const KOMPONEN = {
    subClauseCode: '5.1',
    title: 'LAMPIRAN — Komponen',
    definition: {
        layout: 'table',
        sections: [
            {
                type: 'table',
                label: 'Komponen',
                footnote:
                    'Diuji bersama piranti menggunakan standar terkait. Keberterimaan komponen berdasarkan sertifikat komponen dari LSPro.',
                allowAddRows: true,
                columns: [
                    { id: 'c-objek', header: 'Objek / part No.', inputType: 'text', editable: true, isResult: false, width: 130 },
                    { id: 'c-pabrikan', header: 'Pabrikan / merk dagang', inputType: 'text', editable: true, isResult: false, width: 120 },
                    { id: 'c-tipe', header: 'Tipe / model', inputType: 'text', editable: true, isResult: false, width: 110 },
                    { id: 'c-data', header: 'Data teknis', inputType: 'text', editable: true, isResult: false, width: 130 },
                    { id: 'c-standar', header: 'Standar', inputType: 'text', editable: true, isResult: false, width: 90 },
                    { id: 'c-tanda', header: 'Tanda sertifikasi', inputType: 'text', editable: true, isResult: false, width: 100 },
                ],
                fixedRows: [
                    { id: 'k1', cells: { 'c-objek': 'Fitting' } },
                    { id: 'k2', cells: { 'c-objek': 'Kabel Suplai' } },
                    { id: 'k3', cells: { 'c-objek': 'Tusuk Kontak' } },
                    { id: 'k4', cells: { 'c-objek': 'Saklar' } },
                ],
            },
        ],
    },
};

// LAMPIRAN 2 — Pengecekan dimensi: measurements 1/2/3 with an auto Average
// column (demonstrates the new aggregate formula).
const DIMENSI = {
    subClauseCode: '9.1',
    title: 'LAMPIRAN — Pemeriksaan Dimensi',
    definition: {
        layout: 'table',
        sections: [
            {
                type: 'table',
                label: 'Pemeriksaan Dimensi (mm)',
                footnote:
                    '* Ukuran ini berlaku pada kontak pembumian pada posisi bebas normalnya.',
                allowAddRows: true,
                columns: [
                    { id: 'd-no', header: 'No.', inputType: 'text', editable: true, isResult: false, width: 40 },
                    { id: 'd-kode', header: 'Kode', inputType: 'text', editable: true, isResult: false, width: 50 },
                    { id: 'd-spec', header: 'Spesifikasi (mm)', inputType: 'text', editable: true, isResult: false, width: 100 },
                    { id: 'd-m1', header: '1', inputType: 'number', editable: true, isResult: false, width: 55 },
                    { id: 'd-m2', header: '2', inputType: 'number', editable: true, isResult: false, width: 55 },
                    { id: 'd-m3', header: '3', inputType: 'number', editable: true, isResult: false, width: 55 },
                    {
                        id: 'd-avg', header: 'Average', inputType: 'number', editable: false, isResult: false, width: 65,
                        formula: { op: 'average', cols: ['d-m1', 'd-m2', 'd-m3'] },
                    },
                    { id: 'd-ket', header: 'Keterangan', inputType: 'text', editable: true, isResult: false, width: 90 },
                ],
                fixedRows: [
                    { id: 'r-a', cells: { 'd-no': '1', 'd-kode': 'A', 'd-spec': '33.0 - 33.5' } },
                    { id: 'r-b', cells: { 'd-no': '2', 'd-kode': 'B', 'd-spec': '5.0 - 5.5' } },
                    { id: 'r-c', cells: { 'd-no': '3', 'd-kode': 'C', 'd-spec': '38 - 40' } },
                ],
            },
        ],
    },
};

module.exports = { KOMPONEN, DIMENSI };
