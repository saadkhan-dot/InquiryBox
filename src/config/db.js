const { Pool } = require('pg');

/**
 * Configure PostgreSQL connection pool using environment variables.
 * Using a connection pool ensures efficient connection reuse across HTTP requests.
 */
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'inquirybox',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

// Event listener for unexpected errors on idle database clients
pool.on('error', (err) => {
  console.error('[Database Pool Error]:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
