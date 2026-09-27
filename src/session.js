// FncSession — contrato canónico PROMPT-CREAR-APP / ADAPTAR-APP A1 (Express).
// Ambos proveedores (legacy bloqueado / keycloak) producen exactamente esta forma.
const crypto = require('crypto');

const SESSION_TTL = 28800; // 8h absoluto

function mapKcRolesToAppRole(roles) {
  const r = (roles || []).map((x) => String(x).toLowerCase());
  return r.includes('admin') ? 'ADMIN' : 'FUNCIONARIO';
}

function getRealIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).split(',')[0].trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '0.0.0.0';
}

function fingerprintFor(req) {
  const ua = String(req.headers['user-agent'] || '').substring(0, 64);
  const ip = getRealIp(req).split('.').slice(0, 3).join('.');
  return crypto.createHash('sha256').update(`${ua}:${ip}`).digest('hex').substring(0, 32);
}

function buildFncSession({ sub, email, displayName, roles, req }) {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: String(sub || email),
    email: String(email).toLowerCase(),
    displayName: String(displayName || email),
    roles: Array.isArray(roles) ? roles : [],
    role: mapKcRolesToAppRole(roles),
    fingerprint: fingerprintFor(req),
    iat: now,
    exp: now + SESSION_TTL,
  };
}

function isFncValid(fnc) {
  if (!fnc || !fnc.email || !fnc.role) return false;
  return Math.floor(Date.now() / 1000) < (fnc.exp || 0);
}

module.exports = { SESSION_TTL, mapKcRolesToAppRole, getRealIp, fingerprintFor, buildFncSession, isFncValid };
