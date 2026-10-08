// Bandeja de salida: campana en app + email (Resend) + Discord.
// Scheduler de vencimientos de tareas (3-1-0 días) con ref UNIQUE (idempotente).
// Worker con claim FOR UPDATE SKIP LOCKED: multi-instancia seguro.
// Best-effort: nunca tumba el request ni el arranque.
const { getPool } = require('./db');
const { sendMail } = require('./mail');

const TICK_MS = Number(process.env.NOTIFY_MS || 30000);
const MAX_INTENTOS = Number(process.env.NOTIFY_MAX_INTENTOS || 5);
const RETRY_MIN = Number(process.env.NOTIFY_RETRY_MIN || 5); // espera entre reintentos (×intento)

// Encola una notificación. ref = clave de idempotencia (null = siempre inserta).
// Devuelve id, o null si ya existía (duplicado idempotente).
async function encolar({ canal, titulo, detalle = '', destino = '', url = '', roles = [], ref = null }) {
  const pool = getPool();
  if (!pool) return null;
  if (!['email', 'discord', 'campana'].includes(canal)) throw new Error('Canal inválido.');
  if (!titulo || !String(titulo).trim()) throw new Error('Título requerido.');
  const { rows } = await pool.query(
    `INSERT INTO outbox (canal, titulo, detalle, destino, url, roles, ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (ref) DO NOTHING RETURNING id`,
    [canal, String(titulo).trim(), String(detalle || ''), String(destino || ''), String(url || ''), roles, ref]);
  return rows.length ? rows[0].id : null;
}

// Discord fire-and-forget (timeout 10s, sin secretos en el mensaje).
// Sin webhook → error (el worker reintenta y luego marca fallido).
async function notifyDiscord(titulo, detalle) {
  const url = process.env.DISCORD_WEBHOOK_URL || '';
  if (!url) {
    const e = new Error('Discord no configurado.');
    e.code = 'discord-no-configurado';
    throw e;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ content: `[FNC sip-fnc] ${titulo}${detalle ? ' — ' + detalle : ''}`.slice(0, 1900) }),
    });
    if (!res.ok) {
      const e = new Error(`Discord HTTP ${res.status}.`);
      e.code = 'discord-http';
      throw e;
    }
  } finally {
    clearTimeout(t);
  }
}

async function entregar(row) {
  if (row.canal === 'campana') return; // la entrega es la fila visible en BD
  if (row.canal === 'email') {
    await sendMail({ to: row.destino, subject: row.titulo, title: row.titulo, body: row.detalle });
    return;
  }
  if (row.canal === 'discord') {
    await notifyDiscord(row.titulo, row.detalle);
    return;
  }
  throw new Error('Canal desconocido.');
}

async function procesarPendientes() {
  const pool = getPool();
  if (!pool) return 0;
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const { rows } = await cli.query(
      `SELECT * FROM outbox WHERE estado = 'pendiente' AND next_at <= now()
       ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED`);
    for (const r of rows) {
      try {
        await entregar(r);
        await cli.query(`UPDATE outbox SET estado = 'enviado', intentos = intentos + 1 WHERE id = $1`, [r.id]);
      } catch (e) {
        const ni = r.intentos + 1;
        if (ni >= MAX_INTENTOS) {
          await cli.query(`UPDATE outbox SET estado = 'fallido', intentos = $2 WHERE id = $1`, [r.id, ni]);
        } else {
          await cli.query(`UPDATE outbox SET intentos = $2, next_at = now() + ($3 || ' minutes')::interval WHERE id = $1`, [r.id, ni, String(ni * RETRY_MIN)]);
        }
      }
    }
    await cli.query('COMMIT');
    return rows.length;
  } catch (e) {
    try { await cli.query('ROLLBACK'); } catch { /* noop */ }
    return 0;
  } finally {
    cli.release();
  }
}

// Scheduler 3-1-0: tareas pendientes cuya fecha_limite cae en 3, 1 o 0 días.
// Solo campana (el email necesita destino y Discord es para eventos, no spam).
async function programarVencimientos() {
  const pool = getPool();
  if (!pool) return 0;
  let n = 0;
  for (const d of [3, 1, 0]) {
    const { rows } = await pool.query(
      `SELECT id, titulo, rol, responsable, fecha_limite FROM tasks
       WHERE estado = 'pendiente' AND fecha_limite::date = CURRENT_DATE + $1::int`, [d]);
    for (const t of rows) {
      const cuando = d === 0 ? 'vence hoy' : `vence en ${d} día${d === 1 ? '' : 's'}`;
      const roles = t.rol ? [String(t.rol).toLowerCase()] : [];
      const id = await encolar({
        canal: 'campana',
        titulo: `Tarea ${cuando}: ${t.titulo}`,
        detalle: `${t.responsable || t.rol || ''} · límite ${t.fecha_limite}`,
        url: `/dashboard#tarea-${t.id}`,
        roles,
        ref: `tarea:${t.id}:${d}d`,
      });
      if (id) n++;
    }
  }
  return n;
}

let timer = null;
function startWorker() {
  if (timer) return timer;
  if (process.env.SIP_NO_WORKER === '1') return null;
  const tick = async () => {
    try { await programarVencimientos(); } catch (e) { console.error('[notify:scheduler]', e.message); }
    try { await procesarPendientes(); } catch (e) { console.error('[notify:worker]', e.message); }
  };
  timer = setInterval(tick, TICK_MS);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { encolar, procesarPendientes, programarVencimientos, notifyDiscord, startWorker, TICK_MS, MAX_INTENTOS, RETRY_MIN };
