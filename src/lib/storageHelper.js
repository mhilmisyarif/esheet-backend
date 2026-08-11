const fs = require('fs');
const path = require('path');

// Base server network location (Adjust drive letter or network path as needed)
const SERVER_BASE_PATH = process.env.STORAGE_BASE_PATH || 'X:\\1. FILE ORDER';

// Map lab keys to their exact folder names
const LAB_FOLDERS = {
    1: '1. (20-104-01) PEMANFAATAN LISTRIK RUMAH TANGGA',
    2: '2. (20-104-02) INSTALASI LISTRIK (PIL)',
    3: '3. (20-104-03) TEKNIK OTOMOTIF & SNI TEKNIK',
    4: '4. (20-104-04) PENCAHAYAAN',
    5: '5. (20-104-05) AUDIO VIDEO & MAINAN ANAK LISTRIK',
    6: '6. (20-104-06) RADIO FREKUENSI',
    7: '7. (20-104-07) INFORMASI TEKNOLOGI',
    8: '8. (20-104-08) TEKNIK SIPIL MEKANIK & MESIN',
};

// Indonesian Month Names
const INDONESIAN_MONTHS = [
    '1. JANUARI', '2. FEBRUARI', '3. MARET', '4. APRIL',
    '5. MEI', '6. JUNI', '7. JULI', '8. AGUSTUS',
    '9. SEPTEMBER', '10. OKTOBER', '11. NOVEMBER', '12. DESEMBER'
];

/**
 * Builds and ensures the dynamic directory structure exists.
 */
function getTargetImageDirectory(labId, orderFolderName, date = new Date()) {
    const year = date.getFullYear();
    const yearFolder = `ORDER ${year}`;
    const labFolder = LAB_FOLDERS[labId] || LAB_FOLDERS[1];
    const monthFolder = INDONESIAN_MONTHS[date.getMonth()];

    // Build the complete path
    const targetDir = path.join(
        SERVER_BASE_PATH,
        yearFolder,
        labFolder,
        monthFolder,
        orderFolderName,
        'FOTO'
    );

    // Recursively create directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    return targetDir;
}

module.exports = {
    getTargetImageDirectory,
    SERVER_BASE_PATH
};