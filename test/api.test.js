const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const db = require('../src/config/db');
const http = require('node:http');

let server;
let baseUrl;
let queryImpl;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.pool.end();
});
beforeEach(() => { db.query = (...args) => queryImpl(...args); });

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}
const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const good = { customer_name: 'A Person', email: 'a@example.com', subject: 'Help', message: 'Please help' };

test('creates an enquiry with parameterized values', async () => {
  queryImpl = async (sql, values) => {
    assert.match(sql, /INSERT INTO enquiries/); assert.deepEqual(values.slice(0, 2), ['A Person', 'a@example.com']);
    return { rows: [{ id: 1, ...good, status: 'new' }] };
  };
  const response = await request('/api/enquiries', json(good));
  assert.equal(response.status, 201);
});

test('rejects bad field types, missing values, invalid email, and oversized fields before database access', async () => {
  queryImpl = () => { throw new Error('should not query'); };
  for (const body of [{ ...good, customer_name: 4 }, { ...good, status: [] }, { ...good, phone: 3 }, { ...good, email: 'bad' }, { ...good, message: '' }]) {
    assert.equal((await request('/api/enquiries', json(body))).status, 400);
  }
});

test('rejects malformed JSON and invalid query status', async () => {
  assert.equal((await request('/api/enquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await request('/api/enquiries?status=new&status=resolved')).status, 400);
});

test('validates positive integer IDs and rejects unsupported update status', async () => {
  queryImpl = () => { throw new Error('should not query'); };
  for (const id of ['0', '-1', '1.2', 'abc', '9007199254740992']) assert.equal((await request(`/api/enquiries/${id}`)).status, 400);
  const response = await request('/api/enquiries/1/status', { ...json({ status: 'closed' }), method: 'PATCH' });
  assert.equal(response.status, 400);
});

test('returns not found for missing records and hides database errors', async () => {
  queryImpl = async () => ({ rows: [] });
  assert.equal((await request('/api/enquiries/123')).status, 404);
  queryImpl = async () => { throw new Error('password=secret database detail'); };
  const response = await request('/api/enquiries');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal Server Error', message: 'An unexpected error occurred' });
});
