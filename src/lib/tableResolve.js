// src/lib/tableResolve.js
//
// Backend port of the appendix-table formula engine + a render-ready
// resolver, shared by the datasheet PDF and draft DOCX generators.
//
// Mirrors esheet-frontend/src/utils/tableFormulas.js (keep in sync) and the
// row-merge logic in TableInstanceEditor.jsx. Pure — no prisma, no I/O — so
// it is unit-testable in isolation.

/**
 * Evaluate all computed columns for a single table row.
 * Returns a new cells object with computed + result values filled in.
 *
 * Supports two formula shapes on a column:
 *   binary   : { op: "add"|"subtract"|"multiply"|"divide", a: colId, b: colId }
 *   aggregate: { op: "average"|"sum", cols: [colId, ...] }
 */
function resolveComputedCells(cells, columns) {
    const resolved = { ...cells };

    const numVal = (colId) => {
        const v = resolved[colId];
        if (v === undefined || v === null || v === '') return null;
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
    };

    // Pass 1 — formula columns
    columns.forEach((col) => {
        if (!col.formula || col.editable) return;
        const f = col.formula;

        let result = null;

        if (Array.isArray(f.cols)) {
            // Aggregate over N columns, ignoring empty/non-numeric cells
            const nums = f.cols.map(numVal).filter((n) => n !== null);
            if (nums.length === 0) {
                resolved[col.id] = '';
                return;
            }
            const total = nums.reduce((s, n) => s + n, 0);
            result = f.op === 'sum' ? total : total / nums.length; // default: average
        } else {
            // Binary a op b
            const a = numVal(f.a);
            const b = numVal(f.b);
            if (a === null || b === null) {
                resolved[col.id] = '';
                return;
            }
            switch (f.op) {
                case 'add': result = a + b; break;
                case 'subtract': result = a - b; break;
                case 'multiply': result = a * b; break;
                case 'divide': result = b !== 0 ? a / b : null; break;
                default: result = null;
            }
        }

        resolved[col.id] = result !== null ? parseFloat(result.toFixed(4)) : '';
    });

    // Pass 2 — result (L/G) columns
    columns.forEach((col) => {
        if (!col.isResult || !col.passRule) return;
        const rule = col.passRule;
        const v = numVal(rule.col);
        if (v === null) {
            resolved[col.id] = '';
            return;
        }
        let passes = false;
        switch (rule.op) {
            case 'lte': passes = v <= rule.threshold; break;
            case 'gte': passes = v >= rule.threshold; break;
            case 'lt': passes = v < rule.threshold; break;
            case 'gt': passes = v > rule.threshold; break;
            case 'eq': passes = v === rule.threshold; break;
            case 'range': passes = v >= rule.rangeMin && v <= rule.rangeMax; break;
            default: passes = false;
        }
        resolved[col.id] = passes ? 'L' : 'G';
    });

    return resolved;
}

/**
 * Merge a table section's fixedRows + stored overrides + addedRows into a
 * single ordered list of rows with fully-resolved cells. Mirrors the
 * `allRows`/`resolvedRows` logic in TableInstanceEditor.jsx.
 */
function resolveTableRows(section, sData) {
    const columns = section.columns || [];
    const fixedRows = section.fixedRows || [];
    const addedRows = sData.addedRows || [];
    const storedRows = sData.rows || {};

    const groupLabels = {};
    (section.rowGroups || []).forEach((g) => {
        (g.rowIds || []).forEach((id) => { groupLabels[id] = g.label; });
    });

    const allRows = [
        ...fixedRows.map((fr) => ({
            rowId: fr.id,
            isAdded: false,
            rawCells: { ...fr.cells, ...((storedRows[fr.id] || {}).cells || {}) },
        })),
        ...addedRows.map((ar) => ({
            rowId: ar.rowId,
            isAdded: true,
            rawCells: ar.cells || {},
        })),
    ];

    return allRows.map((row) => ({
        rowId: row.rowId,
        isAdded: row.isAdded,
        groupLabel: groupLabels[row.rowId] || null,
        cells: resolveComputedCells(row.rawCells, columns),
    }));
}

/**
 * Turn a template definition + instance data into a flat, render-ready
 * structure both generators can walk without knowing formula internals.
 *
 * @returns {{
 *   sections: Array<
 *     | { type:'key_value', label, rows: Array<{ label, value, result, required }> }
 *     | { type:'table', label, footnote, columns, rows: Array<{ rowId, isAdded, groupLabel, cells }> }
 *   >
 * }}
 */
function resolveInstance(definition, data) {
    const def = definition || {};
    const sectionsData = (data && data.sections) || {};
    const outSections = [];

    (def.sections || []).forEach((section, idx) => {
        const sData = sectionsData[idx] || {};

        if (section.type === 'key_value') {
            const kv = sData.kv || {};
            outSections.push({
                type: 'key_value',
                label: section.label || '',
                rows: (section.rows || []).map((r) => ({
                    label: r.label || '',
                    value: (kv[r.id] && kv[r.id].value) ?? '',
                    result: (kv[r.id] && kv[r.id].result) ?? '',
                    required: !!r.required,
                })),
            });
        } else if (section.type === 'table') {
            outSections.push({
                type: 'table',
                label: section.label || '',
                footnote: section.footnote || '',
                columns: section.columns || [],
                rows: resolveTableRows(section, sData),
            });
        }
    });

    return { sections: outSections };
}

module.exports = { resolveComputedCells, resolveTableRows, resolveInstance };
