require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const db = require('../config/db');

async function migrate() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const { rows } = await client.query('SELECT version FROM schema_migrations WHERE version = $1', ['001_users_and_ownership']);
    if (!rows.length) {
      const sql = fs.readFileSync(path.join(__dirname, '../../migrations/001_users_and_ownership.sql'), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', ['001_users_and_ownership']);
    }
    await client.query('COMMIT');
    console.log('[InquiryBox] Migrations applied');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await db.pool.end(); }
}
migrate().catch(error => { console.error('[InquiryBox] Migration failed:', error.code || error.name); process.exitCode = 1; });
