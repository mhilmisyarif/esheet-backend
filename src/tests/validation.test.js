const { test } = require('node:test');
const assert = require('node:assert');
const { validate, v } = require('../middleware/validation.middleware');

// Minimal express-like mocks
function run(schema, body) {
    let statusCode = null, jsonBody = null, nexted = false;
    const req = { body };
    const res = {
        status(c) { statusCode = c; return this; },
        json(b) { jsonBody = b; return this; },
    };
    validate(schema)(req, res, () => { nexted = true; });
    return { statusCode, jsonBody, nexted };
}

test('valid body passes through', () => {
    const r = run({
        order_no: v.string({ required: true, max: 100 }),
        labId: v.int({ required: true, min: 1 }),
    }, { order_no: 'CBT/3801/20-104-04/00331/06/2026-01', labId: 4 });
    assert.strictEqual(r.nexted, true);
});

test('missing required field → 400 with detail', () => {
    const r = run({ order_no: v.string({ required: true }) }, {});
    assert.strictEqual(r.statusCode, 400);
    assert.match(r.jsonBody.details[0], /order_no/);
});

test('wrong type rejected', () => {
    const r = run({ labId: v.int({ required: true }) }, { labId: 'abc' });
    assert.strictEqual(r.statusCode, 400);
});

test('enum enforced', () => {
    const r = run({ role: v.string({ enum: ['TECHNICIAN', 'ENGINEER'] }) }, { role: 'HACKER' });
    assert.strictEqual(r.statusCode, 400);
});

test('email format enforced', () => {
    assert.strictEqual(run({ email: v.email({ required: true }) }, { email: 'not-an-email' }).statusCode, 400);
    assert.strictEqual(run({ email: v.email({ required: true }) }, { email: 'a@b.co' }).nexted, true);
});

test('klausulTree accepts a valid tree', () => {
    const tree = [{ klausul: '5', sub_klausul: [{ kode: '5.1', butir: [] }] }];
    assert.strictEqual(run({ data: v.klausulTree() }, { data: tree }).nexted, true);
});

test('klausulTree rejects malformed payloads', () => {
    assert.strictEqual(run({ data: v.klausulTree() }, { data: 'x' }).statusCode, 400);
    assert.strictEqual(run({ data: v.klausulTree() }, { data: [{}] }).statusCode, 400);
    assert.strictEqual(
        run({ data: v.klausulTree() }, { data: [{ klausul: '5', sub_klausul: [{ kode: '5.1' }] }] }).statusCode,
        400, // butir missing
    );
});
