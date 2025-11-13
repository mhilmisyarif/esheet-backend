// (Q3)
function isReportComplete(reportData) {
    if (!Array.isArray(reportData)) return false;

    for (const klausul of reportData) {
        if (!klausul.sub_klausul) continue;
        for (const sub of klausul.sub_klausul) {
            if (!sub.butir) continue;
            for (const butir of sub.butir) {
                // Check if 'keputusan' is null, undefined, or empty string
                // 'TB' (Tidak Berlaku) is a valid, filled-in decision.
                if (!['L', 'G', 'TB'].includes(butir.keputusan)) {
                    return false; // Found an incomplete item
                }
            }
        }
    }
    return true; // All items are filled
}

module.exports = { isReportComplete };