// Bitácora indefinida (acta F0): best-effort, nunca tumba el request.
const { getPool } = require('./db');
const { getRealIp } = require('./session');

async function writeAudit(req, { action, modulo, entidadId, detalle }) {
  const pool = getPool();
  if (!pool) return;
  const fnc = req.session?.fnc || {};
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_sub, actor_email, action, modulo, entidad_id, detalle, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [fnc.sub || '', fnc.email || '', action, modulo || '', entidadId || null, detalle || null, getRealIp(req)],
    );
  } catch (e) {
    console.error('[audit]', e.message);
  }
}

module.exports = { writeAudit };
