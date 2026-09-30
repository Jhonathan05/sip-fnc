// Envío de correo vía Resend (fetch, cero dependencias).
// Config desde BD (módulo SMTP, cifrada) con fallback a .env.
// Sin configuración → Error('smtp-no-configurado') en vez de fallar mudo.
const { getPool } = require('./db');
const { decSecret } = require('./crypto');

async function mailConfig() {
  let apiKey = process.env.RESEND_API_KEY || '';
  let from = process.env.MAIL_FROM || '';
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query(`SELECT clave, valor FROM app_settings WHERE clave IN ('resend_api_key','mail_from')`);
      for (const r of rows) {
        if (r.clave === 'resend_api_key') {
          try { apiKey = decSecret(r.valor); } catch { /* corrupto: conserva fallback */ }
        }
        if (r.clave === 'mail_from') from = r.valor;
      }
    } catch { /* sin tabla: fallback .env */ }
  }
  return { apiKey, from };
}

function baseHtml(title, body) {
  return `<!DOCTYPE html><html lang="es"><body style="font-family:sans-serif;color:#1E293B;max-width:560px;margin:0 auto;padding:24px;">
<div style="border-bottom:3px solid #8D1024;padding-bottom:12px;margin-bottom:16px;"><strong>SIP-FNC</strong> · Comité de Cafeteros del Tolima</div>
<h2 style="margin:0 0 12px;">${title}</h2><div>${body}</div>
<p style="color:#64748B;font-size:12px;margin-top:24px;">Mensaje automático del Sistema de Información de Proyectos. No responder.</p>
</body></html>`;
}

async function sendMail({ to, subject, title, body }) {
  const { apiKey, from } = await mailConfig();
  if (!apiKey || !from) {
    const e = new Error('Correo no configurado: define API key y remitente en el módulo SMTP.');
    e.code = 'smtp-no-configurado';
    throw e;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html: baseHtml(title || subject, body || '') }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((data && data.message) || `Resend HTTP ${res.status}.`);
    e.code = 'smtp-resend';
    throw e;
  }
  return data;
}

module.exports = { sendMail, mailConfig, baseHtml };
