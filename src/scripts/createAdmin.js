require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../config/db');
async function main() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12 || ADMIN_PASSWORD.length > 72) throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and a 12–72 character ADMIN_PASSWORD');
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = await db.query('SELECT id, role FROM users WHERE email = $1', [email]);
  if (existing.rows.length) throw new Error('An account with ADMIN_EMAIL already exists; refusing to change its role');
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await db.query("INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'admin')", [ADMIN_NAME.trim(), email, hash]);
  console.log('Administrator account created. Remove ADMIN_PASSWORD from the environment now.');
}
main().catch(error => { console.error('[InquiryBox] Admin creation failed:', error.message); process.exitCode = 1; }).finally(() => db.pool.end());
