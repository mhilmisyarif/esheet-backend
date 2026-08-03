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
            .map((inst) => ({
                instanceId: inst.id,
                order: inst.order,
                title: inst.template?.title || '',
                subClauseCode: subKode,
                resolved: resolveInstance(inst.template?.definition, inst.data),
            }))
            // keep only tables that actually have content to render
            .filter((t) => t.resolved.sections.length > 0);
    }

    return out;
}

module.exports = { getResolvedTablesForReport };
