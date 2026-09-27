require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const kc = require('./kc');
const views = require('./views');
const { buildFncSession, isFncValid, fingerprintFor } = require('./session');
const { getMockSession, isKeycloakMode } = require('./auth-provider');
const { MODULES, canAccess } = require('./modules');

const APP_NAME = process.env.APP_NAME || 'app-fnc';
const app = express();
app.set('trust proxy', 1); // IP real tras nginx (cf-connecting-ip / x-forwarded-for)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'cambiar-en-env-minimo-32-chars',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600 * 1000 },
}));

// Modo B: mock = dev offline sin KC | keycloak = staging/prod. Cero cambios de negocio al flipear.
// Rutas sin guard de sesion: /login, /auth/app, /auth/mock, /auth/callback/app, /error.

// P7 — rate-limit /api/* obligatorio (override en caliente via env + compose environment:)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_API_PER_MIN || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too Many Requests' }),
});
app.use('/api/', apiLimiter);

const needLogin = (req, res, next) => {
  const fnc = req.session?.fnc;
  if (isFncValid(fnc)) {
    if (fnc.fingerprint && fnc.fingerprint !== fingerprintFor(req)) {
      req.session.destroy(() => res.redirect('/error?reason=state'));
      return;
    }
    return next();
  }
  return res.redirect('/login');
};
const needRole = (role) => (req, res, next) => {
  if (req.session?.fnc?.role === role) return next();
  return res.status(403).send(views.errorPage(req.session?.fnc, 'forbidden'));
};

function setFnc(req, fnc, idToken) {
  req.session.fnc = fnc;
  req.session.email = fnc.email;
  req.session.role = fnc.role;
  req.session.roles = fnc.roles;
  if (idToken) req.session.idToken = idToken;
}

app.get('/', (req, res) => {
  if (isFncValid(req.session?.fnc)) return res.redirect('/dashboard');
  return res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (isFncValid(req.session?.fnc)) return res.redirect('/dashboard');
  res.send(views.loginPage(APP_NAME, isKeycloakMode()));
});

app.post('/auth/mock', (req, res) => {
  if (isKeycloakMode()) return res.redirect('/auth/app');
  setFnc(req, getMockSession(req));
  return res.redirect('/dashboard');
});

app.get('/auth/app', (req, res) => {
  if (!isKeycloakMode()) return res.redirect('/login');
  const { url, state, nonce, codeVerifier } = kc.startLogin();
  req.session.kc = { state, nonce, codeVerifier };
  return res.redirect(url);
});

app.get('/auth/callback/app', async (req, res) => {
  if (!isKeycloakMode()) return res.redirect('/login');
  try {
    const saved = req.session.kc;
    const { code, state } = req.query;
    if (!code || !state || !saved || state !== saved.state) {
      return res.redirect('/error?reason=state');
    }
    const client = kc.getClient();
    const tokenSet = await client.callback(kc.callbackUrl(), { code, state }, {
      state: saved.state, nonce: saved.nonce, code_verifier: saved.codeVerifier, response_type: 'code',
    });
    const claims = tokenSet.claims();
    const email = String(claims.email || claims.preferred_username || '').toLowerCase();
    const roles = kc.rolesFromToken(tokenSet.access_token);
    console.log(`[${APP_NAME}] login ${email} roles=${roles.join(',')} resource_access[${kc.CLIENT_ID}]`);
    if (!email || roles.length === 0) return res.redirect('/error?reason=callback');
    setFnc(req, buildFncSession({
      sub: claims.sub, email, displayName: claims.name || email, roles, req,
    }), tokenSet.id_token);
    delete req.session.kc;
    return res.redirect('/dashboard');
  } catch (e) {
    console.error(`[${APP_NAME}] callback:`, e.message);
    return res.redirect('/error?reason=callback');
  }
});

app.post('/auth/logout', (req, res) => {
  const idToken = req.session.idToken;
  req.session.destroy(() => {
    if (idToken && isKeycloakMode()) {
      const pubBase = (process.env.KEYCLOAK_PUBLIC_URL || kc.KC_URL).replace(/\/$/, '');
      const end = `${pubBase}/realms/${kc.REALM}/protocol/openid-connect/logout?id_token_hint=${encodeURIComponent(idToken)}&post_logout_redirect_uri=${encodeURIComponent(process.env.APP_BASE + '/')}`;
      return res.redirect(end);
    }
    return res.redirect('/login');
  });
});

app.get('/api/me', needLogin, (req, res) => {
  res.json(req.session.fnc);
});

const page = (fnc, mod, body) => views.layout(APP_NAME, fnc, mod.path, body);

app.get('/dashboard', needLogin, (req, res) => {
  const fnc = req.session.fnc;
  res.send(page(fnc, MODULES[0], `<div class="card"><h1>Dashboard</h1>
<p>Visible para <span class="badge">FUNCIONARIO</span> y <span class="badge">ADMIN</span>.</p>
<p>Usuario: <strong>${views.esc(fnc.email)}</strong> · Rol: <strong>${views.esc(fnc.role)}</strong> · Client roles: <strong>${views.esc(fnc.roles.join(','))}</strong></p></div>`));
});

const SIP_MODULES = [
  { path: '/distribucion', title: 'Distribución Recursos', desc: 'Circunscripciones, municipios, tipos y distribuciones por vigencia. Informes: saldos y cuenta corriente.' },
  { path: '/adjudicaciones', title: 'Adjudicaciones', desc: 'Maestros de contratistas e invitaciones. Sorteo de contrataciones auditable.' },
  { path: '/asignaciones', title: 'Asignaciones', desc: 'Creación con origen de recursos y descarga de su distribución. Informes por estado y supervisor.' },
  { path: '/ordenes-sap', title: 'Órdenes SAP', desc: 'Cargue de presupuesto y actualización de inversión mensual (orden de consumo duro).' },
  { path: '/contratos', title: 'Contratos', desc: 'Contratos, convenios, otrosíes y pólizas. Informes de vigencia y vencimientos.' },
];

for (const mod of SIP_MODULES) {
  app.get(mod.path, needLogin, (req, res) => {
    const fnc = req.session.fnc;
    if (!canAccess(fnc.role, MODULES.find((m) => m.path === mod.path))) {
      return res.status(403).send(views.errorPage(fnc, 'forbidden'));
    }
    res.send(page(fnc, { path: mod.path, title: mod.title },
      `<div class="card"><h1>${views.esc(mod.title)}</h1><p>${views.esc(mod.desc)}</p><p>Negocio en Fase 2. Tu acceso actual: <span class="badge">${views.esc(fnc.role)}</span></p></div>`));
  });
}

app.get('/seguridad', needLogin, needRole('ADMIN'), (req, res) => {
  const fnc = req.session.fnc;
  res.send(page(fnc, MODULES.find((m) => m.path === '/seguridad'), `<div class="card"><h1>Seguridad</h1><p>Solo <span class="badge">ADMIN</span>. Rate-limit vigente: <strong>${views.esc(process.env.RATE_LIMIT_API_PER_MIN || '60')}/min</strong> (override en caliente en Fase 2).</p></div>`));
});

// Matriz viva de roles: qué ve cada rol (permitido / deshabilitado / oculto).
app.get('/roles', needLogin, (req, res) => {
  res.send(page(req.session.fnc, { path: '/roles', title: 'Roles' }, views.rolesMatrix(req.session.fnc)));
});

app.get('/error', (req, res) => {
  res.send(views.errorPage(req.session?.fnc, req.query.reason));
});

const PORT = process.env.PORT || 3020;
if (require.main === module) {
  app.listen(PORT, () => console.log(`[${APP_NAME}] http://localhost:${PORT} provider=${process.env.AUTH_PROVIDER || 'mock'}`));
}
module.exports = app;
