/**
 * Pure diff of two report.data klausul trees → audit-trail change rows.
 * Kept dependency-free (no prisma) so it is unit-testable in isolation.
 */

/**
 * Diffs old vs new report.data and returns one row per keputusan /
 * hasil_catatan value that actually changed. Computed server-side so the
 * audit trail cannot be spoofed by the client.
 */
function diffReportData(oldData, newData) {
    // null / undefined / "" all count as "empty" so initialisation writes
    // don't produce noise rows.
    const norm = (v) => (v === undefined || v === null || v === '' ? null : String(v));

    // Index the old tree by klausul|sub|butir — butir letter codes repeat
    // across subs, so the key must include the sub kode.
    const oldIndex = new Map();
    (Array.isArray(oldData) ? oldData : []).forEach((k) => {
        (k.sub_klausul || []).forEach((s) => {
            oldIndex.set(`${k.klausul}|${s.kode}|`, {
                keputusan: norm(s.keputusan),
                hasil_catatan: norm(s.hasil_catatan),
            });
            (s.butir || []).forEach((b) => {
                oldIndex.set(`${k.klausul}|${s.kode}|${b.kode}`, {
                    keputusan: norm(b.keputusan),
                    hasil_catatan: norm(b.hasil_catatan),
                });
            });
        });
    });

    const changes = [];
    const compare = (key, klausulCode, subKode, butirKode, item) => {
        const old = oldIndex.get(key) || { keputusan: null, hasil_catatan: null };
        for (const field of ['keputusan', 'hasil_catatan']) {
            const oldVal = old[field];
            const newVal = norm(item[field]);
            if (oldVal !== newVal) {
                changes.push({
                    klausulCode,
                    subKode,
                    butirKode,
                    field,
                    old_value: oldVal,
                    new_value: newVal,
                });
            }
        }
    };

    (Array.isArray(newData) ? newData : []).forEach((k) => {
        (k.sub_klausul || []).forEach((s) => {
            compare(`${k.klausul}|${s.kode}|`, k.klausul, s.kode, null, s);
            (s.butir || []).forEach((b) => {
                compare(`${k.klausul}|${s.kode}|${b.kode}`, k.klausul, s.kode, b.kode, b);
            });
        });
    });

    return changes;
}

module.exports = { diffReportData };
