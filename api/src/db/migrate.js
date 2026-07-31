'use strict';

/**
 * Apply every SQL migration in api/src/db/migrations, in filename order.
 *
 * Every migration is written to be idempotent (CREATE ... IF NOT EXISTS,
 * ADD COLUMN IF NOT EXISTS), so this is safe to run on every deploy. Used by
 * `npm run migrate` and by the deployment start command, so a fresh Postgres
 * (e.g. a new Render database) is provisioned without needing psql on the host.
 */

const fs = require('fs');
const path = require('path');
// Load DATABASE_URL from the repo-root .env (as the server does), so
// `npm run migrate` works standalone. Real env vars (e.g. on Render) win.
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[migrate] FATAL: DATABASE_URL is not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString });
  pool.on('error', (err) => {
    console.error(`[migrate] idle client error: ${err && err.message ? err.message : err}`);
  });
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      process.stdout.write(`[migrate] applying ${file} ... `);
      await pool.query(sql);
      console.log('ok');
    }
    console.log(`[migrate] ${files.length} migration(s) applied`);
  } catch (err) {
    console.error(`\n[migrate] FAILED: ${err && err.message ? err.message : err}`);
    if (err && err.code) console.error(`[migrate] error code: ${err.code}`);
    if (err && err.stack) console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
