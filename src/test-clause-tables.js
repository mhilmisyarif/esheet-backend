// test-clause-tables.js
// Run from esheet-backend root: node test-clause-tables.js
// Requires a running server and a valid report ID

const axios = require('axios');

const BASE = 'http://localhost:5000/api';
const REPORT_ID = 47; // change to a real report ID in your DB

let token = null;
let createdTableId = null;

async function run() {
    console.log('=== Clause Tables API Test ===\n');

    // 1. Login
    console.log('1. Logging in...');
    const login = await axios.post(`${BASE}/auth/login`, {
        email: 'afif.zainullah@sucofindo.com', // change to your test user
        password: 'sucofindo123',
    });
    token = login.data.token;
    const headers = { Authorization: `Bearer ${token}` };
    console.log('   ✓ Logged in as', login.data.user.name, `(${login.data.user.role})\n`);

    // 2. Create a table
    console.log('2. Creating a clause table for clause 6.1...');
    const create = await axios.post(
        `${BASE}/reports/${REPORT_ID}/clause-tables`,
        {
            clauseCode: '6.1',
            title: 'TABEL I: PENGUJIAN MAMPU SILIH TUKAR KAKI LAMPU E27',
            headers: ['Parameter', '01', '02', '03', 'Keterangan'],
            rows: [
                ['Max screw thread (7006-27B)', 'L', 'L', 'L', 'L'],
                ['Min major diameter (7006-28A)', 'L', 'L', 'L', 'L'],
                ['Dimension S1 (7006-27C)', 'L', 'L', 'L', 'L'],
                ['Contact making (7006-50)', 'L', 'L', 'L', 'L'],
            ],
            notes: 'Standar gauge sesuai IEC 60061-1',
        },
        { headers }
    );
    createdTableId = create.data.id;
    console.log('   ✓ Created table ID:', createdTableId, '\n');

    // 3. Fetch all tables for the report
    console.log('3. Fetching all tables for report', REPORT_ID, '...');
    const all = await axios.get(`${BASE}/reports/${REPORT_ID}/clause-tables`, { headers });
    console.log('   ✓ Found', all.data.length, 'table(s)\n');

    // 4. Fetch filtered by clauseCode
    console.log('4. Fetching tables for clause 6.1 only...');
    const filtered = await axios.get(
        `${BASE}/reports/${REPORT_ID}/clause-tables?clauseCode=6.1`,
        { headers }
    );
    console.log('   ✓ Found', filtered.data.length, 'table(s) for clause 6.1\n');

    // 5. Update the table
    console.log('5. Updating table', createdTableId, '...');
    const update = await axios.put(
        `${BASE}/clause-tables/${createdTableId}`,
        {
            title: 'TABEL I: PENGUJIAN MAMPU SILIH TUKAR E27 (Updated)',
            headers: ['Parameter', '01', '02', '03', '04', 'Keterangan'],
            rows: [
                ['Max screw thread (7006-27B)', 'L', 'L', 'L', 'L', 'L'],
                ['Min major diameter (7006-28A)', 'L', 'L', 'L', 'L', 'L'],
            ],
            notes: '',
        },
        { headers }
    );
    console.log('   ✓ Updated. New header count:', update.data.headers.length, '\n');

    // 6. Delete the table
    console.log('6. Deleting table', createdTableId, '...');
    await axios.delete(`${BASE}/clause-tables/${createdTableId}`, { headers });
    console.log('   ✓ Deleted\n');

    // 7. Confirm deletion
    const afterDelete = await axios.get(
        `${BASE}/reports/${REPORT_ID}/clause-tables?clauseCode=6.1`,
        { headers }
    );
    console.log('7. Tables remaining for clause 6.1:', afterDelete.data.length);
    console.log('\n=== All tests passed ✓ ===');
}

run().catch((err) => {
    console.error('\n✗ Test failed:');
    if (err.response) {
        console.error('  Status:', err.response.status);
        console.error('  Body:', JSON.stringify(err.response.data, null, 2));
    } else {
        console.error(err.message);
    }
    process.exit(1);
});
