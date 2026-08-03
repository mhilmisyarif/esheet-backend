const { test } = require('node:test');
const assert = require('node:assert');
const { diffReportData } = require('../api/reports/report-diff');

const baseTree = () => ([{
    klausul: '5',
    judul: 'PENANDAAN',
    sub_klausul: [{
        kode: '5.1',
        judul: 'Penandaan wajib',
        keputusan: 'L',
        hasil_catatan: '',
        butir: [
            { kode: 'a', teks: 'Merek dagang', keputusan: 'TB', hasil_catatan: 'Visalux' },
            { kode: 'b', teks: 'Tegangan', keputusan: 'L', hasil_catatan: null },
        ],
    }, {
        kode: '5.2',
        judul: 'Lainnya',
        keputusan: null,
        hasil_catatan: null,
        butir: [
            { kode: 'a', teks: 'Lambang', keputusan: 'TB', hasil_catatan: '' },
        ],
    }],
}]);

test('identical trees produce no changes', () => {
    const a = baseTree();
    const b = baseTree();
    assert.deepStrictEqual(diffReportData(a, b), []);
});

test('empty-string vs null is not a change (no noise)', () => {
    const a = baseTree();
    const b = baseTree();
    b[0].sub_klausul[0].hasil_catatan = null;    // was ''
    b[0].sub_klausul[1].butir[0].hasil_catatan = null; // was ''
    assert.deepStrictEqual(diffReportData(a, b), []);
});

test('butir keputusan change is captured with sub scope', () => {
    const a = baseTree();
    const b = baseTree();
    b[0].sub_klausul[0].butir[0].keputusan = 'L'; // TB → L
    const changes = diffReportData(a, b);
    assert.strictEqual(changes.length, 1);
    assert.deepStrictEqual(changes[0], {
        klausulCode: '5',
        subKode: '5.1',
        butirKode: 'a',
        field: 'keputusan',
        old_value: 'TB',
        new_value: 'L',
    });
});

test('same butir letter in different sub does not collide', () => {
    const a = baseTree();
    const b = baseTree();
    // change butir "a" of 5.2 only — butir "a" of 5.1 must stay untouched
    b[0].sub_klausul[1].butir[0].keputusan = 'G';
    const changes = diffReportData(a, b);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].subKode, '5.2');
    assert.strictEqual(changes[0].old_value, 'TB');
    assert.strictEqual(changes[0].new_value, 'G');
});

test('sub-klausul level change has null butirKode', () => {
    const a = baseTree();
    const b = baseTree();
    b[0].sub_klausul[1].keputusan = 'TB'; // null → TB
    const changes = diffReportData(a, b);
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].butirKode, null);
    assert.strictEqual(changes[0].new_value, 'TB');
});

test('catatan change captured alongside keputusan change', () => {
    const a = baseTree();
    const b = baseTree();
    b[0].sub_klausul[0].butir[0].keputusan = 'L';
    b[0].sub_klausul[0].butir[0].hasil_catatan = 'Visalux Pro';
    const changes = diffReportData(a, b);
    assert.strictEqual(changes.length, 2);
    const fields = changes.map((c) => c.field).sort();
    assert.deepStrictEqual(fields, ['hasil_catatan', 'keputusan']);
});

test('non-array inputs are tolerated', () => {
    assert.deepStrictEqual(diffReportData(null, null), []);
    assert.deepStrictEqual(diffReportData(undefined, baseTree()).length > 0, true); // all values are "new"
    assert.deepStrictEqual(diffReportData(baseTree(), 'garbage'), []);
});
