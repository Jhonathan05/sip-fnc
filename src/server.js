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
const { MODULES, NAV, canAccess, flattenLeaves, findLeaf } = require('./modules');
const { getPool, dbReady } = require('./db');
const { writeAudit } = require('./audit');

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
  writeAudit(req, { action: 'login.mock', modulo: 'auth' });
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
  writeAudit(req, { action: 'logout', modulo: 'auth' });
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

const needDb = async (req, res, next) => {
  if (await dbReady()) return next();
  return res.status(503).json({ error: 'Base de datos no disponible.' });
};

const fmtMoney = (n) => Number(n || 0);

// GET /api/saldos — 4 distribuciones con saldo y % ejecutado (franja KPI).
app.get('/api/saldos', needLogin, needDb, async (req, res) => {
  const { rows } = await getPool().query(
    'SELECT tipo, vigencia, asignado, ejecutado FROM distribuciones ORDER BY vigencia DESC, tipo');
  res.json(rows.map((r) => {
    const asignado = fmtMoney(r.asignado);
    const ejecutado = fmtMoney(r.ejecutado);
    return { ...r, asignado, ejecutado, saldo: asignado - ejecutado, pct: asignado > 0 ? +(ejecutado / asignado * 100).toFixed(1) : 0 };
  }));
});

// GET /api/actividad — últimos 15 movimientos (bitácora, resumen abstracto).
app.get('/api/actividad', needLogin, needDb, async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT created_at AS at, actor_email, action, modulo, entidad_id, detalle
     FROM audit_log ORDER BY id DESC LIMIT 15`);
  res.json(rows);
});

// GET /api/tareas — pendientes visibles según rol (consultor: lectura).
app.get('/api/tareas', needLogin, needDb, async (req, res) => {
  const fnc = req.session.fnc;
  const roles = (fnc.roles || []).map((r) => String(r).toLowerCase());
  let q = `SELECT id, created_at AS at, rol, titulo, detalle, responsable, area, proceso, fecha_limite, automatica, estado
           FROM tasks WHERE estado = 'pendiente'`;
  const params = [];
  if (fnc.role !== 'ADMIN' && !roles.includes('coordinador')) {
    q += ` AND rol = ANY($1)`;
    params.push(roles);
  }
  q += ' ORDER BY fecha_limite NULLS LAST, id';
  const { rows } = await getPool().query(q, params);
  res.json(rows);
});

// POST /api/tareas/:id/completar — con guard (consultor solo lectura) + auditoría.
app.post('/api/tareas/:id/completar', needLogin, needDb, async (req, res) => {
  const fnc = req.session.fnc;
  const roles = (fnc.roles || []).map((r) => String(r).toLowerCase());
  const allowed = fnc.role === 'ADMIN' || roles.some((r) => ['admin', 'coordinador', 'analista', 'auxiliar'].includes(r));
  if (!allowed) return res.status(403).send(views.errorPage(fnc, 'forbidden'));
  const { rowCount } = await getPool().query(
    `UPDATE tasks SET estado = 'hecha', hecha_por = $1, hecha_at = now() WHERE id = $2 AND estado = 'pendiente'`,
    [fnc.email, Number(req.params.id)]);
  if (!rowCount) return res.redirect('/dashboard?msg=ya_hecha');
  await writeAudit(req, { action: 'tarea.completar', modulo: 'tareas', entidadId: String(req.params.id), detalle: 'Tarea marcada hecha' });
  return res.redirect('/dashboard?msg=tarea_ok');
});

const page = (fnc, mod, body) => views.layout(APP_NAME, fnc, mod.path, body);

app.get('/dashboard', needLogin, needDb, async (req, res) => {
  const fnc = req.session.fnc;
  try {
    // Formulario inline: ?form=/ruta/hoja (informes → vista independiente).
    let form = null;
    if (req.query.form) {
      const hit = findLeaf(String(req.query.form));
      if (!hit || !canAccess(fnc.role, hit.leaf)) {
        return res.status(403).send(views.errorPage(fnc, 'forbidden'));
      }
      if (hit.sub.kind === 'informe') return res.redirect(hit.leaf.path);
      form = hit;
    }
    const pool = getPool();
    const [s, a] = await Promise.all([
      pool.query('SELECT tipo, vigencia, asignado, ejecutado FROM distribuciones ORDER BY vigencia DESC, tipo'),
      // Mini panel: solo plataforma (auth/sistema queda fuera: login.*, logout).
      pool.query(`SELECT created_at AS at, actor_email, action, modulo, detalle FROM audit_log WHERE action NOT IN ('login.mock','login.keycloak','logout') ORDER BY id DESC LIMIT 15`),
    ]);
    const roles = (fnc.roles || []).map((r) => String(r).toLowerCase());
    let tq = `SELECT id, titulo, detalle, responsable, area, proceso, fecha_limite, automatica FROM tasks WHERE estado='pendiente'`;
    const tp = [];
    if (fnc.role !== 'ADMIN' && !roles.includes('coordinador')) {
      tq += ` AND rol = ANY($1)`;
      tp.push(roles);
    }
    tq += ' ORDER BY fecha_limite NULLS LAST, id';
    const t = await pool.query(tq, tp);
    // Ejercicio completo: últimas hechas visibles con el mismo filtro de rol.
    let dq = `SELECT id, titulo, rol, hecha_por, hecha_at FROM tasks WHERE estado='hecha'`;
    const dp = [];
    if (fnc.role !== 'ADMIN' && !roles.includes('coordinador')) {
      dq += ` AND rol = ANY($1)`;
      dp.push(roles);
    }
    dq += ' ORDER BY hecha_at DESC NULLS LAST, id DESC LIMIT 10';
    const d = await pool.query(dq, dp);
    const saldos = s.rows.map((r) => {
      const as = Number(r.asignado), ej = Number(r.ejecutado);
      return { ...r, saldo: as - ej, pct: as > 0 ? +(ej / as * 100).toFixed(1) : 0 };
    });
    // Selección del árbol: el formulario inline marca su hoja como activa
    // (abre módulo/sub y resalta la hoja; sin form queda Dashboard).
    const activePath = form ? form.leaf.path : MODULES[0].path;
    res.send(page(fnc, { path: activePath }, views.dashboardPage(fnc, { saldos, tareas: t.rows, hechas: d.rows, actividad: a.rows, form })));
  } catch (e) {
    console.error('[dashboard]', e.message);
    // Si el error ocurre con ?form válido, conservar la selección del árbol.
    let activePath = MODULES[0].path;
    try {
      if (req.query.form) {
        const hit = findLeaf(String(req.query.form));
        if (hit && canAccess(fnc.role, hit.leaf) && hit.sub.kind !== 'informe') activePath = hit.leaf.path;
      }
    } catch { /* mantener Dashboard */ }
    res.send(page(fnc, { path: activePath }, `<div class="alert-err">No se pudo cargar el tablero.</div>`));
  }
});

// (imports consolidados arriba: MODULES, NAV, canAccess, flattenLeaves)

// Landings de módulo: portada con sus subcategorías (el negocio llega en Fase 2).
for (const mod of NAV.filter((m) => (m.children || []).length > 0)) {
  app.get(mod.path, needLogin, (req, res) => {
    const fnc = req.session.fnc;
    if (!canAccess(fnc.role, mod)) {
      return res.status(403).send(views.errorPage(fnc, 'forbidden'));
    }
    const subs = (mod.children || []).map((s) =>
      `<div class="card"><h1>${views.esc(s.title)}</h1><p>${views.esc(s.desc || '')}</p><p>${(s.children || []).length} opciones.</p></div>`).join('');
    res.send(page(fnc, { path: mod.path, title: mod.title },
      `<div class="card"><h1>${views.esc(mod.title)}</h1><p>Negocio en Fase 2. Tu acceso actual: <span class="badge">${views.esc(fnc.role)}</span></p></div>${subs}`));
  });
}

// Mi perfil vive en el modal de Configuración; URL vieja redirige al dashboard.
app.get('/perfil/perfil/mi-perfil', needLogin, (req, res) => res.redirect('/dashboard'));

// POST /api/perfil/solicitar-clave — opción C: solicitud auditada al admin
// (payload listo para webhook Discord en staging; el reset KC se cablea con fnc-keycloak-users).
app.post('/api/perfil/solicitar-clave', needLogin, needDb, async (req, res) => {
  const fnc = req.session.fnc;
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS n FROM audit_log WHERE actor_sub = $1 AND action = 'clave.solicitar' AND created_at > now() - INTERVAL '1 day'`,
    [fnc.sub]);
  if (rows[0].n === 0) {
    await writeAudit(req, { action: 'clave.solicitar', modulo: 'seguridad', detalle: `Solicitud de cambio de contraseña de ${fnc.email} (pendiente reset admin + UPDATE_PASSWORD)` });
  }
  return res.redirect('/dashboard?msg=clave_solicitada');
});

// Hojas del árbol: /:modulo/:sub/:item con guard por hoja (planas "Fase 2" por ahora).
for (const { leaf, sub, mod } of flattenLeaves()) {
  app.get(leaf.path, needLogin, (req, res) => {
    const fnc = req.session.fnc;
    if (!canAccess(fnc.role, leaf)) {
      return res.status(403).send(views.errorPage(fnc, 'forbidden'));
    }
    res.send(page(fnc, { path: leaf.path, title: leaf.title },
      `<p><a href="${mod.path}">${views.esc(mod.title)}</a> / ${views.esc(sub.title)}</p><div class="card"><h1>${views.esc(leaf.title)}</h1><p>Negocio en Fase 2. Tu acceso actual: <span class="badge">${views.esc(fnc.role)}</span></p></div>`));
  });
}

app.get('/seguridad', needLogin, needRole('ADMIN'), async (req, res) => {
  const fnc = req.session.fnc;
  let solis = [];
  try {
    const r = await getPool().query(
      `SELECT actor_email, detalle, created_at AS at FROM audit_log WHERE action = 'clave.solicitar' ORDER BY id DESC LIMIT 20`);
    solis = r.rows;
  } catch { /* sin DB: panel mínimo */ }
  const lis = solis.map((s) => `<li><strong>${views.esc(s.actor_email)}</strong> · ${views.esc(new Date(s.at).toLocaleString('es-CO'))}<br><span>${views.esc(s.detalle || '')}</span></li>`).join('');
  res.send(page(fnc, { path: '/seguridad', title: 'Seguridad' }, `<div class="card"><h1>Seguridad</h1><p>Solo <span class="badge">ADMIN</span>. Rate-limit vigente: <strong>${views.esc(process.env.RATE_LIMIT_API_PER_MIN || '60')}/min</strong> (override en caliente en Fase 2).</p></div>
<div class="card"><h2>Solicitudes de cambio de contraseña (${solis.length})</h2><ul class="feed">${lis || '<li>Sin solicitudes.</li>'}</ul><p>Flujo: reset en consola Keycloak + acción requerida <code>UPDATE_PASSWORD</code> (skill fnc-keycloak-users, staging).</p></div>`));
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
