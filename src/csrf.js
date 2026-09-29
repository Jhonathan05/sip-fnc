// CSRF synchronizer (skill fnc-security-8layers, adaptado Express vanilla).
// Token por sesión (express-session es server-side): se inyecta como campo
// oculto en forms y como header x-csrf-token en fetch (meta en layout).
// Verificación con timingSafeEqual. Sin token válido → 403.
const crypto = require('crypto');

function ensureToken(req) {
  if (!req.session) return '';
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrf;
}

function csrfInput(req) {
  const t = ensureToken(req);
  return `<input type="hidden" name="_csrf" value="${t}">`;
}

function csrfMeta(req) {
  return `<meta name="csrf-token" content="${ensureToken(req)}">`;
}

function verifyCsrf(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const good = Buffer.from(String((req.session && req.session.csrf) || ''));
  const sent = String((req.body && req.body._csrf) || req.headers['x-csrf-token'] || '');
  if (!good.length || !sent.length || good.length !== sent.length) {
    return res.status(403).send('CSRF inválido.');
  }
  try {
    if (!crypto.timingSafeEqual(good, Buffer.from(sent))) {
      return res.status(403).send('CSRF inválido.');
    }
  } catch {
    return res.status(403).send('CSRF inválido.');
  }
  return next();
}

module.exports = { ensureToken, csrfInput, csrfMeta, verifyCsrf };
