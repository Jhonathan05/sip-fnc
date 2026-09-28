// Postgres (dev Docker Desktop / prod host FNC). Pool único + migraciones versionadas.
// Sin DATABASE_URL la app arranca igual (rutas DB responden 503 con mensaje claro).
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) return null;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.on('error', (e) => console.error('[sip-fnc][db] pool:', e.message));
  return pool;
}

async function dbReady() {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = { getPool, dbReady };
