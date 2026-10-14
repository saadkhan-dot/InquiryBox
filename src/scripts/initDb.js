require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function initializeDatabase() {
  let exitCode = 0;
  try {
    const schemaPath = path.join(__dirname, '../../schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('[InquiryBox] Applying database schema from schema.sql...');
    await db.query(sql);
    console.log('[InquiryBox] Database schema initialized successfully!');
  } catch (err) {
    exitCode = 1;
    console.error('[InquiryBox] Error initializing database schema:', err.message);
  } finally {
    try {
      await db.pool.end();
    } catch (err) {
      exitCode = 1;
      console.error('[InquiryBox] Error closing database pool:', err.message);
    }
  }
  process.exitCode = exitCode;
}

initializeDatabase();
