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
    return csrfFail(req, res);
  }
  try {
    if (!crypto.timingSafeEqual(good, Buffer.from(sent))) {
      return csrfFail(req, res);
    }
  } catch {
    return csrfFail(req, res);
  }
  return next();
}

// Fallo CSRF: idempotente y sin callejón. Clientes HTML (forms del navegador,
// Accept text/html) van a /login?reason=sesion con mensaje; APIs/fetch
// reciben el 403 de siempre (contrato + e2e intactos).
function csrfFail(req, res) {
  const accept = String(req.headers.accept || '');
  if (accept.includes('text/html')) {
    return res.redirect('/login?reason=sesion');
  }
  return res.status(403).send('CSRF inválido.');
}

module.exports = { ensureToken, csrfInput, csrfMeta, verifyCsrf };
