// Run only against a dedicated database whose DB_NAME ends in `_test`.
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

if (!process.env.DB_NAME || !/_test$/.test(process.env.DB_NAME)) {
  console.error('Refusing integration test: configure DB_NAME to a dedicated database ending in _test.');
  process.exit(2);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Configure a test-only JWT_SECRET of at least 32 characters.');
  process.exit(2);
}

const app = require('../src/app');
const db = require('../src/config/db');
const checks = [];
function check(name, condition, actual) {
  assert.ok(condition, `${name} failed: ${JSON.stringify(actual)}`);
  checks.push({ scenario: name, result: 'PASS', actual });
}

(async () => {
  let server;
  try {
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, options = {}) => {
      const response = await fetch(base + path, options);
      let body;
      try { body = await response.json(); } catch {}
      return { status: response.status, body };
    };
    const post = (body, token) => ({
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const aliceEmail = `alice-${suffix}@example.com`;
    const bobEmail = `bob-${suffix}@example.com`;
    const adminEmail = `admin-${suffix}@example.com`;
    const baseline = Number((await db.query('SELECT COUNT(*)::int AS total FROM enquiries')).rows[0].total);

    let response = await request('/api/auth/register', post({ name: 'Alice', email: aliceEmail, password: 'GoodPassword123' }));
    check('Alice registration', response.status === 201, response.status);
    response = await request('/api/auth/register', post({ name: 'Bob', email: bobEmail, password: 'GoodPassword123' }));
    check('Bob registration', response.status === 201, response.status);
    const alice = (await request('/api/auth/login', post({ email: aliceEmail, password: 'GoodPassword123' }))).body;
    const bob = (await request('/api/auth/login', post({ email: bobEmail, password: 'GoodPassword123' }))).body;
    check('valid login and JWT issuance', typeof alice.token === 'string' && typeof bob.token === 'string', true);
    response = await request('/api/auth/login', post({ email: aliceEmail, password: 'wrong' }));
    check('invalid password rejected', response.status === 401, response.status);

    const create = (token, name, email) => request('/api/enquiries', post({
      customer_name: name, email, subject: 'Integration question', message: 'Please help', user_id: 999999
    }, token));
    const aliceEnquiry = await create(alice.token, 'Alice enquiry', aliceEmail);
    const bobEnquiry = await create(bob.token, 'Bob enquiry', bobEmail);
    check('authenticated enquiry creation', aliceEnquiry.status === 201 && bobEnquiry.status === 201, [aliceEnquiry.status, bobEnquiry.status]);
    check('server-derived ownership ignores request user_id', aliceEnquiry.body.data.user_id !== 999999 && bobEnquiry.body.data.user_id !== 999999, [aliceEnquiry.body.data.user_id, bobEnquiry.body.data.user_id]);
    const aliceList = await request('/api/enquiries', { headers: { authorization: `Bearer ${alice.token}` } });
    const bobList = await request('/api/enquiries', { headers: { authorization: `Bearer ${bob.token}` } });
    check('regular-user listing isolation', aliceList.body.total === 1 && bobList.body.total === 1, [aliceList.body.total, bobList.body.total]);

    response = await request(`/api/enquiries/${aliceEnquiry.body.data.id}`, { headers: { authorization: `Bearer ${bob.token}` } });
    check('cross-user retrieval concealed as 404', response.status === 404, response.status);
    response = await request(`/api/enquiries/${aliceEnquiry.body.data.id}/status`, { ...post({ status: 'resolved' }, bob.token), method: 'PATCH' });
    check('cross-user update concealed as 404', response.status === 404, response.status);
    response = await request(`/api/enquiries/${aliceEnquiry.body.data.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${bob.token}` } });
    check('cross-user delete concealed as 404', response.status === 404, response.status);
    response = await request(`/api/enquiries/${aliceEnquiry.body.data.id}/status`, { ...post({ status: 'in_progress' }, alice.token), method: 'PATCH' });
    check('owner can update status', response.status === 200 && response.body.data.status === 'in_progress', response.status);
    const filtered = await request('/api/enquiries?limit=1&offset=0&search=Alice&sort=created_at&order=desc', { headers: { authorization: `Bearer ${alice.token}` } });
    check('pagination and search filter', filtered.status === 200 && filtered.body.count === 1 && filtered.body.total === 1, filtered.body);
    const me = await request('/api/auth/me', { headers: { authorization: `Bearer ${alice.token}` } });
    check('safe current-user profile', me.status === 200 && !JSON.stringify(me.body).includes('password_hash'), me.status);

    const legacy = (await db.query('INSERT INTO enquiries(customer_name,email,subject,message,user_id) VALUES($1,$2,$3,$4,NULL) RETURNING id', ['Legacy', `legacy-${suffix}@example.com`, 'Legacy record', 'Unowned'])).rows[0];
    const adminHash = await bcrypt.hash('AdminPassword123', 4);
    await db.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'admin')", ['Admin', adminEmail, adminHash]);
    const adminLogin = await request('/api/auth/login', post({ email: adminEmail, password: 'AdminPassword123' }));
    check('admin login', adminLogin.status === 200 && typeof adminLogin.body.token === 'string', adminLogin.status);
    const adminToken = adminLogin.body.token;
    const all = await request('/api/enquiries', { headers: { authorization: `Bearer ${adminToken}` } });
    check('admin lists all including legacy row', all.status === 200 && all.body.total === baseline + 3, all.body.total);
    response = await request(`/api/enquiries/${legacy.id}`, { headers: { authorization: `Bearer ${adminToken}` } });
    check('admin retrieves unowned legacy row', response.status === 200 && response.body.data.user_id === null, response.status);
    response = await request(`/api/enquiries/${legacy.id}/status`, { ...post({ status: 'resolved' }, adminToken), method: 'PATCH' });
    check('admin updates unowned legacy row', response.status === 200 && response.body.data.status === 'resolved', response.status);
    response = await request(`/api/enquiries/${bobEnquiry.body.data.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${adminToken}` } });
    check('admin deletes another user enquiry', response.status === 200, response.status);

    const bobId = (await db.query('SELECT id FROM users WHERE email = $1', [bobEmail])).rows[0].id;
    const forged = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { subject: String(bobId), expiresIn: '1h' });
    const forgedList = await request('/api/enquiries', { headers: { authorization: `Bearer ${forged}` } });
    check('forged admin JWT role ignored in favor of DB role', forgedList.status === 200 && forgedList.body.total === 0, forgedList.body.total);

    console.log(JSON.stringify({ database: process.env.DB_NAME, checks }, null, 2));
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.pool.end();
  }
})();
