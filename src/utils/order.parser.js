// (Q2)
function parseLabCodeFromOrder(orderNo) {
    const match = orderNo.match(/20-104-(\d{2})/);
    if (match && match[1]) {
        return match[1]; // Returns "01", "04", etc.
    }
    return null;
}

module.exports = { parseLabCodeFromOrder };