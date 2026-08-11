/**
 * Check if ALL butir in ALL klausuls are filled.
 * Used by the old full-submit flow (now less relevant but kept for reference).
 */
function isReportComplete(reportData) {
    if (!Array.isArray(reportData)) return false;
    for (const klausul of reportData) {
        if (!isKlausulComplete(klausul)) return false;
    }
    return true;
}

/**
 * Check if all butir in a SINGLE klausul are filled.
 * Used by the new per-klausul submit validation.
 *
 * @param {object} klausul - a single klausul object from report.data
 * @returns {boolean}
 */
function isKlausulComplete(klausul) {
    if (!klausul || !Array.isArray(klausul.sub_klausul)) return false;
    for (const sub of klausul.sub_klausul) {
        if (!Array.isArray(sub.butir)) continue;
        for (const butir of sub.butir) {
            if (!['L', 'G', 'TB'].includes(butir.keputusan)) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Get the list of unfilled butir kodes in a klausul.
 * Useful for error messages telling the technician exactly what's missing.
 *
 * @param {object} klausul
 * @returns {string[]} array of butir kodes that are unfilled
 */
function getUnfilledButir(klausul) {
    const unfilled = [];
    if (!klausul || !Array.isArray(klausul.sub_klausul)) return unfilled;
    for (const sub of klausul.sub_klausul) {
        if (!Array.isArray(sub.butir)) continue;
        for (const butir of sub.butir) {
            if (!['L', 'G', 'TB'].includes(butir.keputusan)) {
                unfilled.push(butir.kode);
            }
        }
    }
    return unfilled;
}

module.exports = { isReportComplete, isKlausulComplete, getUnfilledButir };
