'use strict';

/**
 * PostgreSQL connection pool.
 *
 * Exposes a thin `query` helper plus the underlying pool. On startup we run a
 * trivial query to verify connectivity and log the result.
 */

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fail fast — nothing in the API works without a database.
  console.error('[db] FATAL: DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString });

pool.on('error', (err) => {
  console.error('[db] Unexpected idle client error:', err.message);
});

/**
 * Run a parameterised query.
 * @param {string} text  SQL with $1, $2 placeholders
 * @param {Array}  params
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Verify the connection at boot. Logs success/failure but does not throw, so
 * the caller decides whether a failure is fatal.
 * @returns {Promise<boolean>}
 */
async function verifyConnection() {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now');
    console.log(`[db] Connected to PostgreSQL (server time: ${rows[0].now.toISOString()})`);
    return true;
  } catch (err) {
    console.error('[db] Connection check FAILED:', err.message);
    return false;
  }
}

module.exports = { pool, query, verifyConnection };
