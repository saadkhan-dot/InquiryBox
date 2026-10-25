const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/config/db');

let server, baseUrl, queryImpl;
const SECRET = 'test-only-signing-secret-that-is-long-enough';
process.env.JWT_SECRET = SECRET;
before(async () => { server = http.createServer(app); await new Promise(r => server.listen(0, '127.0.0.1', r)); baseUrl = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise(r => server.close(r)); await db.pool.end(); });
beforeEach(() => { db.query = (...args) => queryImpl(...args); });
async function request(path, options = {}) { return fetch(`${baseUrl}${path}`, options); }
const json = (body, method = 'POST', token) => ({ method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const tokenFor = (id = 1) => jwt.sign({}, SECRET, { subject: String(id), expiresIn: '1h' });
const good = { customer_name: 'A Person', email: 'a@example.com', subject: 'Help', message: 'Please help' };

test('health, legacy health path, unknown route, malformed JSON, headers, and body limit', async () => {
  queryImpl = () => { throw new Error('unexpected query'); };
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/health')).status, 200);
  const unknown = await request('/nope'); assert.equal(unknown.status, 404);
  const malformed = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }); assert.equal(malformed.status, 400);
  const headers = await request('/'); assert.equal(headers.headers.get('x-content-type-options'), 'nosniff');
  const large = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ huge: 'x'.repeat(40000) }) }); assert.equal(large.status, 413);
});

test('registration hashes password, normalizes email, forces user role, duplicate handled', async () => {
  let inserted;
  queryImpl = async (sql, values) => {
    if (sql.includes('INSERT INTO users')) { inserted = values; return { rows: [{ id: 1, name: values[0], email: values[1], role: values[3] }] }; }
    throw new Error('unexpected query');
  };
  const response = await request('/api/auth/register', json({ name: ' Person ', email: ' A@EXAMPLE.COM ', password: 'GoodPassword123', role: 'admin' }));
  assert.equal(response.status, 201); assert.equal(inserted[1], 'a@example.com'); assert.notEqual(inserted[2], 'GoodPassword123'); assert.equal(await bcrypt.compare('GoodPassword123', inserted[2]), true); assert.equal(inserted[3], 'user'); assert.equal(JSON.stringify(await response.json()).includes('password'), false);
  queryImpl = async () => { const e = new Error('unique'); e.code = '23505'; throw e; };
  assert.equal((await request('/api/auth/register', json({ name: 'Person', email: 'a@example.com', password: 'GoodPassword123' }))).status, 409);
});

test('registration rejects invalid email, missing fields, weak passwords and hides SQL errors', async () => {
  queryImpl = () => { throw new Error('must not query'); };
  for (const body of [{ name: 'a', email: 'bad', password: 'GoodPassword123' }, { email: 'a@b.com', password: 'GoodPassword123' }, { name: 'a', email: 'a@b.com', password: 'weak' }]) assert.equal((await request('/api/auth/register', json(body))).status, 400);
  queryImpl = async () => { throw new Error('password=private SQL SELECT'); };
  const response = await request('/api/auth/register', json({ name: 'Person', email: 'a@example.com', password: 'GoodPassword123' }));
  assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /private|SELECT/);
});

test('login returns JWT for valid credentials and generic errors for bad credentials', async () => {
  const hash = await bcrypt.hash('GoodPassword123', 4);
  queryImpl = async () => ({ rows: [{ id: 7, name: 'A', email: 'a@example.com', role: 'user', password_hash: hash }] });
  const res = await request('/api/auth/login', json({ email: ' A@EXAMPLE.com ', password: 'GoodPassword123' }));
  assert.equal(res.status, 200); const data = await res.json(); assert.equal(jwt.verify(data.token, SECRET).sub, '7'); assert.equal(data.user.email, 'a@example.com'); assert.equal('password_hash' in data.user, false);
  assert.equal((await request('/api/auth/login', json({ email: 'a@example.com', password: 'wrong' }))).status, 401);
  queryImpl = async () => ({ rows: [] });
  const noUser = await request('/api/auth/login', json({ email: 'missing@example.com', password: 'wrong' })); assert.equal(noUser.status, 401); assert.match((await noUser.json()).message, /Invalid email or password/);
});

test('auth rejects absent and invalid tokens; /me returns safe db-backed profile', async () => {
  queryImpl = async (sql, values) => ({ rows: values[0] === 1 ? [{ id: 1, name: 'Owner', email: 'owner@example.com', role: 'user' }] : [] });
  assert.equal((await request('/api/auth/me')).status, 401);
  assert.equal((await request('/api/auth/me', { headers: { authorization: 'Bearer broken' } })).status, 401);
  const me = await request('/api/auth/me', { headers: { authorization: `Bearer ${tokenFor()}` } }); assert.equal(me.status, 200); assert.equal((await me.json()).data.name, 'Owner');
  assert.equal((await request('/api/auth/me', { headers: { authorization: `Bearer ${jwt.sign({}, 'wrong-secret', { subject: '1' })}` } })).status, 401);
  const expired = jwt.sign({}, SECRET, { subject: '1', expiresIn: -1 });
  assert.equal((await request('/api/auth/me', { headers: { authorization: `Bearer ${expired}` } })).status, 401);
});

test('enquiry create associates server identity and list is ownership scoped with pagination', async () => {
  const calls = [];
  queryImpl = async (sql, values) => { calls.push([sql, values]); if (sql.includes('SELECT id, name, email, role FROM users')) return { rows: [{ id: 9, role: 'user' }] }; if (sql.includes('INSERT INTO enquiries')) return { rows: [{ id: 3, user_id: values[0], ...good }] }; if (sql.includes('COUNT')) return { rows: [{ total: 1 }] }; return { rows: [{ id: 3, user_id: 9 }] }; };
  const token = tokenFor(9);
  const create = await request('/api/enquiries', json({ ...good, user_id: 777 }, 'POST', token)); assert.equal(create.status, 201); assert.equal(calls.find(c => c[0].includes('INSERT INTO enquiries'))[1][0], 9);
  const list = await request('/api/enquiries?limit=5&offset=2&status=new&sort=customer_name&order=asc', { headers: { authorization: `Bearer ${token}` } });
  assert.equal(list.status, 200); const result = await list.json(); assert.equal(result.total, 1); assert.equal(result.count, 1); assert.match(calls.at(-1)[0], /user_id = \$1/); assert.equal(calls.at(-1)[1][0], 9); assert.deepEqual(calls.at(-1)[1].slice(-2), [5,2]);
});

test('ownership checks are in SQL for read/update/delete; admins get all rows including legacy', async () => {
  let userRole = 'user'; const executed = [];
  queryImpl = async (sql, values) => { executed.push([sql, values]); if (sql.startsWith('SELECT id, name, email, role FROM users')) return { rows: [{ id: 2, role: userRole }] }; if (sql.startsWith('SELECT * FROM enquiries')) return userRole === 'admin' ? { rows: [{ id: 4, user_id: null }] } : { rows: [] }; if (sql.startsWith('UPDATE')) return userRole === 'admin' ? { rows: [{ id: 4, status: values[0] }] } : { rows: [] }; if (sql.startsWith('DELETE')) return userRole === 'admin' ? { rows: [{ id: 4 }] } : { rows: [] }; if (sql.includes('COUNT')) return { rows: [{ total: 0 }] }; return { rows: [] }; };
  const token = tokenFor(2);
  assert.equal((await request('/api/enquiries/4', { headers: { authorization: `Bearer ${token}` } })).status, 404);
  assert.equal((await request('/api/enquiries/4/status', json({ status: 'resolved' }, 'PATCH', token))).status, 404);
  assert.equal((await request('/api/enquiries/4', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })).status, 404);
  assert.match(executed.find(x => x[0].startsWith('UPDATE'))[0], /user_id = \$3/); assert.match(executed.find(x => x[0].startsWith('DELETE'))[0], /user_id = \$2/);
  userRole = 'admin';
  const admin = tokenFor(2);
  const list = await request('/api/enquiries', { headers: { authorization: `Bearer ${admin}` } }); assert.equal(list.status, 200); assert.doesNotMatch(executed.at(-1)[0], /user_id =/);
  assert.equal((await request('/api/enquiries/4', { headers: { authorization: `Bearer ${admin}` } })).status, 200);
  assert.equal((await request('/api/enquiries/4/status', json({ status: 'resolved' }, 'PATCH', admin))).status, 200);
  assert.equal((await request('/api/enquiries/4', { method: 'DELETE', headers: { authorization: `Bearer ${admin}` } })).status, 200);
});

test('enquiry validation, query allowlists, not found and safe SQL errors', async () => {
  queryImpl = async (sql, values) => sql.includes('SELECT id, name, email, role FROM users') ? { rows: [{ id: 1, role: 'user' }] } : (() => { throw new Error('private SQL detail'); })();
  const token = tokenFor();
  for (const id of ['0','-1','1.2','abc','9007199254740992']) assert.equal((await request(`/api/enquiries/${id}`, { headers: { authorization: `Bearer ${token}` } })).status, 400);
  assert.equal((await request('/api/enquiries?sort=id%3Bdrop%20table%20users', { headers: { authorization: `Bearer ${token}` } })).status, 400);
  assert.equal((await request('/api/enquiries?limit=101', { headers: { authorization: `Bearer ${token}` } })).status, 400);
  assert.equal((await request('/api/enquiries?search=%27%20OR%201%3D1', { headers: { authorization: `Bearer ${token}` } })).status, 500);
  const status = await request('/api/enquiries/1/status', json({ status: 'closed' }, 'PATCH', token)); assert.equal(status.status, 400);
  assert.equal((await request('/api/enquiries/4', { headers: { authorization: `Bearer ${token}` } })).status, 500);
});
