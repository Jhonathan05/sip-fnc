// Admin de BD para e2e (crear/verificar/eliminar sip_fnc_test). Uso: node tests/db-admin.cjs <create|exists|drop>
const { Pool } = require('pg');

const ADMIN_DB = 'postgresql://sip:sip-dev-sololocal@localhost:5433/postgres';

(async () => {
  const cmd = process.argv[2];
  const p = new Pool({ connectionString: ADMIN_DB });
  try {
    if (cmd === 'create') {
      await p.query('DROP DATABASE IF EXISTS sip_fnc_test');
      await p.query('CREATE DATABASE sip_fnc_test');
      console.log('created');
    } else if (cmd === 'exists') {
      const r = await p.query("SELECT COUNT(*)::int AS n FROM pg_database WHERE datname='sip_fnc_test'");
      console.log(r.rows[0].n);
    } else if (cmd === 'drop') {
      await p.query('DROP DATABASE IF EXISTS sip_fnc_test');
      console.log('dropped');
    } else {
      console.error('cmd?');
      process.exit(2);
    }
  } finally {
    await p.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
