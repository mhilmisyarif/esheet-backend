const { test } = require('node:test');
const assert = require('node:assert');
const {
    resolveComputedCells,
    resolveTableRows,
    resolveInstance,
} = require('../lib/tableResolve');

// ── Formula engine ──────────────────────────────────────────────────────────

test('average of N columns ignores empty cells', () => {
    const columns = [
        { id: 'm1', editable: true },
        { id: 'm2', editable: true },
        { id: 'm3', editable: true },
        { id: 'avg', editable: false, formula: { op: 'average', cols: ['m1', 'm2', 'm3'] } },
    ];
    assert.strictEqual(
        resolveComputedCells({ m1: '33', m2: '34', m3: '35' }, columns).avg,
        34,
    );
    // empty m3 → average of the two present values
    assert.strictEqual(
        resolveComputedCells({ m1: '10', m2: '20', m3: '' }, columns).avg,
        15,
    );
    // all empty → blank
    assert.strictEqual(resolveComputedCells({}, columns).avg, '');
});

test('sum aggregate', () => {
    const columns = [
        { id: 'a', editable: true },
        { id: 'b', editable: true },
        { id: 't', editable: false, formula: { op: 'sum', cols: ['a', 'b'] } },
    ];
    assert.strictEqual(resolveComputedCells({ a: '2.5', b: '3.5' }, columns).t, 6);
});

test('binary operators still work', () => {
    const columns = [
        { id: 'suhu', editable: true },
        { id: 'amb', editable: true },
        { id: 'dt', editable: false, formula: { op: 'subtract', a: 'suhu', b: 'amb' } },
    ];
    assert.strictEqual(resolveComputedCells({ suhu: '55.8', amb: '25' }, columns).dt, 30.8);
});

test('result column via passRule lte', () => {
    const columns = [
        { id: 'dt', editable: true },
        { id: 'res', isResult: true, passRule: { col: 'dt', op: 'lte', threshold: 60 } },
    ];
    assert.strictEqual(resolveComputedCells({ dt: '45' }, columns).res, 'L');
    assert.strictEqual(resolveComputedCells({ dt: '75' }, columns).res, 'G');
    assert.strictEqual(resolveComputedCells({ dt: '' }, columns).res, '');
});

test('result depends on a computed column (two-pass)', () => {
    const columns = [
        { id: 'suhu', editable: true },
        { id: 'amb', editable: true },
        { id: 'dt', editable: false, formula: { op: 'subtract', a: 'suhu', b: 'amb' } },
        { id: 'res', isResult: true, passRule: { col: 'dt', op: 'lte', threshold: 60 } },
    ];
    const r = resolveComputedCells({ suhu: '90', amb: '25' }, columns);
    assert.strictEqual(r.dt, 65);
    assert.strictEqual(r.res, 'G');
});

// ── Row merge ───────────────────────────────────────────────────────────────

test('resolveTableRows merges fixedRows, overrides and addedRows', () => {
    const section = {
        columns: [
            { id: 'part', editable: true },
            { id: 'val', editable: true },
        ],
        fixedRows: [{ id: 'r1', cells: { part: 'Bodi' } }],
        rowGroups: [{ label: 'Grup A', rowIds: ['r1'] }],
    };
    const sData = {
        rows: { r1: { cells: { val: '40.4' } } },
        addedRows: [{ rowId: 'added-1', cells: { part: 'Extra', val: '10' } }],
    };
    const rows = resolveTableRows(section, sData);
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(rows[0].cells, { part: 'Bodi', val: '40.4' });
    assert.strictEqual(rows[0].groupLabel, 'Grup A');
    assert.strictEqual(rows[1].isAdded, true);
    assert.strictEqual(rows[1].cells.part, 'Extra');
});

// ── Full instance resolve ───────────────────────────────────────────────────

test('resolveInstance produces render-ready key_value + table sections', () => {
    const definition = {
        layout: 'mixed',
        sections: [
            {
                type: 'key_value',
                label: 'Kondisi',
                rows: [{ id: 'kv1', label: 'Type / model', required: true }],
            },
            {
                type: 'table',
                label: 'Dimensi',
                footnote: 'Ukuran ini berlaku pada posisi bebas',
                columns: [
                    { id: 'm1', editable: true },
                    { id: 'm2', editable: true },
                    { id: 'avg', editable: false, formula: { op: 'average', cols: ['m1', 'm2'] } },
                ],
                fixedRows: [{ id: 'r1', cells: {} }],
            },
        ],
    };
    const data = {
        sections: {
            0: { kv: { kv1: { value: 'AT827', result: 'L' } } },
            1: { rows: { r1: { cells: { m1: '33.0', m2: '33.4' } } } },
        },
    };
    const out = resolveInstance(definition, data);
    assert.strictEqual(out.sections.length, 2);
    assert.strictEqual(out.sections[0].type, 'key_value');
    assert.strictEqual(out.sections[0].rows[0].value, 'AT827');
    assert.strictEqual(out.sections[0].rows[0].result, 'L');
    assert.strictEqual(out.sections[1].type, 'table');
    assert.strictEqual(out.sections[1].footnote, 'Ukuran ini berlaku pada posisi bebas');
    assert.strictEqual(out.sections[1].rows[0].cells.avg, 33.2);
});

test('resolveInstance tolerates empty / missing data', () => {
    assert.deepStrictEqual(resolveInstance(null, null), { sections: [] });
    assert.deepStrictEqual(resolveInstance({ sections: [] }, {}), { sections: [] });
});
