/**
 * Parses the lab code suffix from an order number.
 * e.g. "CBT/3801/20-104-04/000038/01/2023-1" → "04"
 *
 * @param {string} orderNo
 * @returns {string|null} two-digit lab code, or null if not found
 */
function parseLabCodeFromOrder(orderNo) {
    if (!orderNo || typeof orderNo !== 'string') return null;
    const match = orderNo.match(/20-104-(\d{2})/);
    return match ? match[1] : null;
}

module.exports = { parseLabCodeFromOrder };