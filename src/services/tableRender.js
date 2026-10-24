// src/services/tableRender.js
//
// Single source of truth for appendix-table rendering data, used by BOTH
// the datasheet PDF and the draft DOCX generators. Fetches a report's table
// instances (+ their templates), resolves every instance to a flat
// render-ready structure, and groups them by sub-clause code.

const { getInstancesGrouped } = require('../api/table-instances/table-instances.service');
const { resolveInstance } = require('../lib/tableResolve');

/**
 * @param {number} reportId
 * @returns {Promise<{ [subClauseCode: string]: Array<{
 *   instanceId: number,
 *   order: number,
 *   title: string,
 *   subClauseCode: string,
 *   resolved: { sections: [...] }   // see resolveInstance
 * }>}>}
 *
 * Sub-clause codes ("6.1", "12", ...) map to sub_klausul.kode in report.data.
 * Empty object when the report has no table instances.
 */
async function getResolvedTablesForReport(reportId) {
    const grouped = await getInstancesGrouped(reportId); // { subKode: [instance(+template)] }
    const out = {};

    for (const [subKode, instances] of Object.entries(grouped)) {
        out[subKode] = instances
            .map((inst) => {
                const tplGrid = inst.template?.definition?.spreadsheetGrid;
                const instGrid = inst.data?.spreadsheetGrid;
                let combinedGrid = instGrid || tplGrid || null;
                if (tplGrid && instGrid && instGrid.cells) {
                    const mergedCells = { ...tplGrid.cells };
                    Object.keys(instGrid.cells).forEach((k) => {
                        mergedCells[k] = {
                            ...(mergedCells[k] || {}),
                            ...instGrid.cells[k],
                        };
                    });
                    combinedGrid = {
                        ...tplGrid,
                        ...instGrid,
                        cells: mergedCells,
                    };
                }
                if (combinedGrid && combinedGrid.cells) {
                    Object.keys(combinedGrid.cells).forEach((k) => {
                        const c = combinedGrid.cells[k];
                        if (c && !c.f && c.v !== undefined && c.v !== null && c.v !== '') {
                            c.computed = c.v;
                        }
                    });
                }
                return {
                    instanceId: inst.id,
                    order: inst.order,
                    title: inst.template?.title || '',
                    subClauseCode: subKode,
                    resolved: resolveInstance(inst.template?.definition, inst.data),
                    spreadsheetGrid: combinedGrid,
                };
            })
            // keep only tables that actually have content to render
            .filter((t) => t.resolved.sections.length > 0 || (t.spreadsheetGrid && Object.keys(t.spreadsheetGrid.cells || {}).length > 0));
    }

    return out;
}

module.exports = { getResolvedTablesForReport };
