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
const { MODULES, NAV, canAccess, flattenLeaves, findLeaf, tokenFor, realFor } = require('./modules');
const { PROCESO_FORM } = require('./task-meta');
const { hydrate } = require('./prefs');

// Guards granulares Fase 2 (primera granularidad fina real):
// leer: todos · crear/editar: todos menos consultor · borrar: admin + coordinador.
function canWrite(fnc) {
  if (!fnc) return false;
  if (fnc.role === 'ADMIN') return true;
  const roles = (fnc.roles || []).map((r) => String(r).toLowerCase());
  return roles.some((r) => ['admin', 'coordinador', 'analista', 'auxiliar'].includes(r));
}
function canDelete(fnc) {
  if (!fnc) return false;
  if (fnc.role === 'ADMIN') return true;
  const roles = (fnc.roles || []).map((r) => String(r).toLowerCase());
  return roles.some((r) => ['admin', 'coordinador'].includes(r));
}

// Maestros Distribución: catálogo tabla/pk/columnas (Fase 2).
// upper: mayúsculas forzadas · numpk: pk serial (no se envía) ·
// required: obligatorios · numeric: validación numérica.
const MAESTROS = {
  'circunscripciones': { table: 'circunscripciones', pk: 'codigo', cols: ['codigo', 'nombre'], upper: true, required: ['codigo', 'nombre'] },
  'municipios': { table: 'municipios', pk: 'codigo', cols: ['codigo', 'nombre', 'circunscripcion'], upper: true, required: ['codigo', 'nombre'] },
  'tipos-distribuciones': { table: 'tipos_distribucion', pk: 'codigo', cols: ['codigo', 'nombre'], upper: true, required: ['codigo', 'nombre'] },
  'distribuciones': { table: 'distribuciones', pk: 'id', numpk: true, cols: ['tipo', 'vigencia', 'asignado', 'ejecutado'], required: ['tipo', 'vigencia'], numeric: ['vigencia', 'asignado', 'ejecutado'] },
  'distribucion-municipio': { table: 'distribucion_municipio', pk: 'id', numpk: true, cols: ['numero', 'tipo', 'ano', 'ppto', 'municipio', 'valor'], required: ['numero', 'tipo', 'ano', 'municipio', 'valor'], numeric: ['numero', 'tipo', 'ano', 'ppto', 'valor'] },
};

function validCodigo(v) {
  return typeof v === 'string' && /^[A-Z0-9-]{2,12}$/.test(v.trim().toUpperCase());
}

// Normaliza un valor según meta (undefined = inválido, null = ausente).
function normVal(m, col, raw) {
  let v = String(raw ?? '').trim();
  if (m.upper) v = v.toUpperCase();
  if ((m.numeric || []).includes(col)) {
    if (v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    if (col !== 'ano' && col !== 'vigencia' && col !== 'numero' && col !== 'tipo' && n < 0) return undefined;
    return n;
  }
  return v;
}

function pkVal(m, raw) {
  const v = String(raw ?? '').trim();
  if (m.numpk) {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  }
  return validCodigo(v) ? v.toUpperCase() : undefined;
}

const { ensureToken, verifyCsrf } = require('./csrf');
const { getPool, dbReady } = require('./db');
const { writeAudit } = require('./audit');
const notify = require('./notify');

// Roles del usuario para la campana (rol + roles, minúsculas, sin vacíos).
const myRoles = (fnc) => [...new Set([String(fnc.role || '').toLowerCase(), ...((fnc.roles || []).map((r) => String(r).toLowerCase()))])].filter(Boolean);

const crypto = require('crypto');
const APP_NAME = process.env.APP_NAME || 'app-fnc';
const APP_VERSION = require('../package.json').version;
const app = express();
app.set('trust proxy', 1); // IP real tras nginx (cf-connecting-ip / x-forwarded-for)
// URLs opacas: /v/:token → ruta real (conserva query). Primero de todo;
// los guards y el resto operan sobre la ruta real. Token inválido → 404.
app.use((req, res, next) => {
  if (req.path === '/v' || req.path.startsWith('/v/')) {
    const real = realFor(req.path.slice(3));
    if (!real) return res.status(404).send(views.errorPage(req.session?.fnc, 'callback'));
    req.url = real + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
  }
  next();
});
// Nonce CSP por request (las vistas lo inyectan en cada <script> inline).
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  req.nonce = res.locals.nonce;
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [(_req, res) => `'nonce-${res.locals.nonce}'`],
      // style-src 'unsafe-inline': los style="..." de vistas van a clases poco a
      // poco; bloquearlos hoy rompería el layout. Scripts siguen con nonce.
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));
app.use(compression());
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  // Cookie propia por proyecto (nunca el default connect.sid): las cookies no
  // distinguen puertos y otra app en localhost la pisaría (doble login).
  name: 'sip.sid',
  secret: process.env.SESSION_SECRET || 'cambiar-en-env-minimo-32-chars',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600 * 1000 },
}));

// Modo B: mock = dev offline sin KC | keycloak = staging/prod. Cero cambios de negocio al flipear.
// Rutas sin guard de sesion: /login, /auth/app, /auth/mock, /auth/callback/app, /error.

// P7 — rate-limit /api/* obligatorio. max como función: override volátil en
// caliente (revierte al env al reiniciar). Handler con Retry-After (skill).
const ENV_MAX = parseInt(process.env.RATE_LIMIT_API_PER_MIN || '60', 10);
let hotMax = null;
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: () => (hotMax == null ? ENV_MAX : hotMax),
  standardHeaders: true,
  legacyHeaders: false,
  // Exento: es la llave para subir el límite (sin esto un bloqueo sería irreversible sin restart).
  skip: (req) => req.path === '/admin/rate-limit',
  handler: (req, res) => {
    const reset = req.rateLimit && req.rateLimit.resetTime ? req.rateLimit.resetTime.getTime() : Date.now() + 60000;
    res.set('Retry-After', String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))));
    res.status(429).json({ error: 'Too Many Requests' });
  },
});
app.use('/api/', apiLimiter);

function rateLimitMax() {
  return hotMax == null ? ENV_MAX : hotMax;
}

// Antifuerza en autenticación (skill fnc-login): /auth/* con límite propio.
// Sin credenciales locales (mock de un botón + KC) no hay lockout de clave;
// Keycloak gobierna brute-force en staging/prod (realm failureFactor 5).
const AUTH_MAX = parseInt(process.env.RATE_LIMIT_AUTH_PER_MIN || '60', 10);
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: AUTH_MAX,
  standardHeaders: false,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Demasiados intentos. Espera un minuto.' }),
});
app.use('/auth/', authLimiter);

// Sondas de monitoreo (públicas, sin sesión): Kuma → /api/ready.
// /health no toca BD; /ready verifica SELECT 1 (503 si la BD cae).
app.get('/api/health', (req, res) => res.json({ ok: true, version: APP_VERSION }));
app.get('/api/ready', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json({ ok: false, error: 'Sin BD.' });
    await pool.query('SELECT 1');
    return res.json({ ok: true, version: APP_VERSION, db: true });
  } catch (e) {
    return res.status(503).json({ ok: false, error: 'BD no disponible.' });
  }
});

// CSRF synchronizer en todos los POST (tras parsers y sesión).
app.use(verifyCsrf);

const INACTIVITY_MS = 5 * 60 * 1000; // 5 min (acta F0)

const needLogin = (req, res, next) => {
  const fnc = req.session?.fnc;
  if (isFncValid(fnc)) {
    if (fnc.fingerprint && fnc.fingerprint !== fingerprintFor(req)) {
      req.session.destroy(() => res.redirect('/error?reason=state'));
      return;
    }
    // Inactividad: sin actividad 5 min → destruir + login con motivo.
    const last = req.session.lastActivity || 0;
    if (last && Date.now() - last > INACTIVITY_MS) {
      req.session.destroy(() => {
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sesión cerrada por inactividad.', code: 'INACTIVE' });
        return res.redirect('/login?reason=inactivity');
      });
      return;
    }
    req.session.lastActivity = Date.now();
    return next();
  }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'No autenticado.' });
  return res.redirect('/login');
};
const needRole = (role) => (req, res, next) => {
  if (req.session?.fnc?.role === role) return next();
  return res.status(403).send(views.errorPage(req.session?.fnc, 'forbidden'));
};

// Badge notificaciones: vencidas visibles según rol (0 sin sesión).
// Badge + lista de vencidas (mismo filtro de rol). Best-effort, nunca tumba.
app.use(async (req, res, next) => {
  res.locals.nVencidas = 0;
  res.locals.vencidasList = [];
  try {
    const fnc = req.session?.fnc;
    const pool = getPool();
    if (isFncValid(fnc) && pool) {
      const roles = (fnc.roles || []).map((r) => String(r).toLowerCase());
      let filt = '';
      const p = [];
      if (fnc.role !== 'ADMIN' && !roles.includes('coordinador')) { filt = ` AND rol = ANY($1)`; p.push(roles); }
      const c = await pool.query(`SELECT COUNT(*)::int AS n FROM tasks WHERE estado='pendiente' AND fecha_limite < CURRENT_DATE${filt}`, p);
      res.locals.nVencidas = (c.rows[0] && c.rows[0].n) || 0;
      if (res.locals.nVencidas) {
        const { rows } = await pool.query(
          `SELECT id, titulo, rol, fecha_limite FROM tasks WHERE estado='pendiente' AND fecha_limite < CURRENT_DATE${filt} ORDER BY fecha_limite, id LIMIT 5`, p);
        res.locals.vencidasList = rows;
      }
    }
  } catch { /* badge en 0 */ }
  next();
});

// Campana: notificaciones no leídas visibles según roles (best-effort).
app.use(async (req, res, next) => {
  res.locals.nNotif = 0;
  res.locals.notifList = [];
  try {
    const fnc = req.session?.fnc;
    const pool = getPool();
    if (isFncValid(fnc) && pool) {
      const c = await pool.query(
        `SELECT COUNT(*)::int AS n FROM outbox WHERE canal = 'campana' AND estado = 'enviado' AND roles && $1`, [myRoles(fnc)]);
      res.locals.nNotif = (c.rows[0] && c.rows[0].n) || 0;
      if (res.locals.nNotif) {
        const { rows } = await pool.query(
          `SELECT id, titulo, detalle, url FROM outbox WHERE canal = 'campana' AND estado = 'enviado' AND roles && $1 ORDER BY id DESC LIMIT 8`, [myRoles(fnc)]);
        res.locals.notifList = rows;
      }
    }
  } catch { /* campana en 0 (p. ej. sin migrar 006) */ }
  next();
});


function setFnc(req, fnc, idToken) {
  req.session.fnc = fnc;
  req.session.lastActivity = Date.now();
  req.session.email = fnc.email;
  req.session.role = fnc.role;
  req.session.roles = fnc.roles;
  if (idToken) req.session.idToken = idToken;
}

app.get('/', (req, res) => {
  if (isFncValid(req.session?.fnc)) return res.redirect(tokenFor('/dashboard'));
  return res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (isFncValid(req.session?.fnc)) return res.redirect(tokenFor('/dashboard'));
  // Sin caché: atrás tras login revalida y redirige al dashboard
  // (nunca se reenvía un formulario viejo con token huérfano).
  res.set('Cache-Control', 'no-store');
  res.send(views.loginPage(APP_NAME, isKeycloakMode(), ensureToken(req), req.query.reason));
});

app.post('/auth/mock', async (req, res) => {
  if (isKeycloakMode()) return res.redirect('/auth/app');
  setFnc(req, getMockSession(req));
  await hydrate(req.session.fnc);
  writeAudit(req, { action: 'login.mock', modulo: 'auth' });
  return res.redirect(tokenFor('/dashboard'));
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
    req.session.fnc.givenName = String(claims.given_name || '').trim();
    req.session.fnc.familyName = String(claims.family_name || '').trim();
    await hydrate(req.session.fnc);
    delete req.session.kc;
    return res.redirect(tokenFor('/dashboard'));
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

// POST /api/auth/activity — renueva actividad (el modal la llama al seguir activo).
app.post('/api/auth/activity', needLogin, (req, res) => {
  req.session.lastActivity = Date.now();
  res.json({ ok: true });
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

// GET /api/actividad — plataforma financiera (sin auth ni seguridad).
app.get('/api/actividad', needLogin, needDb, async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT id, created_at AS at, actor_email, action, modulo, entidad_id, detalle
     FROM audit_log WHERE modulo NOT IN ('auth','seguridad') ORDER BY id DESC LIMIT 15`);
  res.json(rows);
});

// GET /api/actividad/mia — todo lo propio, incluida mi seguridad.
app.get('/api/actividad/mia', needLogin, needDb, async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT id, created_at AS at, actor_email, action, modulo, entidad_id, detalle
     FROM audit_log WHERE actor_sub = $1 ORDER BY id DESC LIMIT 15`,
    [req.session.fnc.sub]);
  res.json(rows);
});

// GET /api/actividad/:id — detalle completo para el drawer.
app.get('/api/actividad/:id', needLogin, needDb, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido.' });
  try {
    const { rows } = await getPool().query(
      `SELECT id, created_at AS at, actor_sub, actor_email, action, modulo, entidad_id, detalle, ip
       FROM audit_log WHERE id = $1`,
      [id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado.' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[api/actividad:id]', e.message);
    res.status(500).json({ error: 'Error interno.' });
  }
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

// POST /api/tareas — crear tarea (todos menos consultor). Consume JSON del modal.
app.post('/api/tareas', needLogin, needDb, async (req, res) => {
  const fnc = req.session.fnc;
  const roles = (fnc.roles || []).map((r) => String(r).toLowerCase());
  const isConsultorOnly = roles.length > 0 && roles.every((r) => r === 'consultor');
  if (fnc.role !== 'ADMIN' && isConsultorOnly) {
    return res.status(403).json({ ok: false, error: 'Sin permiso para crear tareas.' });
  }
  const b = req.body || {};
  const titulo = String(b.titulo || '').trim();
  const catalogo = String(process.env.CLIENT_ROLES || 'admin,coordinador,consultor,analista,auxiliar').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
  const rol = String(b.rol || '').trim().toLowerCase();
  const fecha = String(b.fecha_limite || '').trim();
  if (titulo.length < 3 || titulo.length > 200) {
    return res.status(400).json({ ok: false, error: 'Título entre 3 y 200 caracteres.' });
  }
  if (!catalogo.includes(rol)) {
    return res.status(400).json({ ok: false, error: 'Rol destino inválido.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ ok: false, error: 'Fecha límite inválida (hoy o futuro, AAAA-MM-DD).' });
  }
  const proceso = Object.prototype.hasOwnProperty.call(PROCESO_FORM, b.proceso) ? b.proceso : '';
  try {
    const { rows } = await getPool().query(
      `INSERT INTO tasks (rol, titulo, detalle, responsable, area, proceso, fecha_limite, automatica)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [rol, titulo, String(b.detalle || '').slice(0, 2000), String(b.responsable || '').slice(0, 120),
       String(b.area || '').slice(0, 120), proceso, fecha, b.automatica === true]);
    await writeAudit(req, { action: 'tarea.crear', modulo: 'tareas', entidadId: String(rows[0].id), detalle: `Creada: ${titulo}` });
    return res.status(201).json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error('[api/tareas:create]', e.message);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// POST /api/tareas/:id/validar — botón único del modal: verifica el proceso
// (automáticas) o confirma (manuales); si verifica OK, marca completada + audita.
app.post('/api/tareas/:id/validar', needLogin, needDb, async (req, res) => {
  const fnc = req.session.fnc;
  const roles = (fnc.roles || []).map((r) => String(r).toLowerCase());
  const allowed = fnc.role === 'ADMIN' || roles.some((r) => ['admin', 'coordinador', 'analista', 'auxiliar'].includes(r));
  if (!allowed) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [Number(req.params.id)]);
  const t = rows[0];
  if (!t) return res.status(404).json({ ok: false, error: 'No encontrada.' });
  if (t.estado === 'hecha') return res.json({ ok: true, msg: 'Ya estaba completada.' });
  if (t.automatica) {
    const v = await verifyTask(pool, t);
    if (!v.ok) return res.json({ ok: false, msg: v.msg });
  }
  await pool.query(`UPDATE tasks SET estado = 'hecha', hecha_por = $1, hecha_at = now() WHERE id = $2`, [fnc.email, t.id]);
  await writeAudit(req, { action: 'tarea.validar', modulo: 'tareas', entidadId: String(t.id), detalle: `Validada: ${t.titulo}` });
  try {
    await notify.encolar({ canal: 'discord', titulo: `Tarea validada: ${t.titulo}`, detalle: `Por ${fnc.email || fnc.displayName || '?'}`, url: `/dashboard#tarea-${t.id}`, ref: `tarea-validada:${t.id}` });
  } catch { /* aviso best-effort, no tumba la validación */ }
  return res.json({ ok: true, msg: 'Tarea completada.' });
});


// Verificadores de procesos automáticos (el proceso ya se ejecutó → se puede completar).
async function verifyTask(pool, t) {
  const p = String(t.proceso || '').toLowerCase();
  if (p.includes('distribuci')) {
    const y = new Date().getFullYear();
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM distribuciones WHERE vigencia = $1`, [y]);
    return r.rows[0].n > 0
      ? { ok: true, msg: 'Distribuciones de la vigencia verificadas.' }
      : { ok: false, msg: 'Aún no hay distribuciones de la vigencia cargadas.' };
  }
  return { ok: false, msg: 'Este proceso aún no tiene verificación automática: ejecútalo desde su formulario.' };
}

// Traduce una URL interna con ruta real a su forma pública con token
// ('/dashboard?form=/x' → '/v/xxx?f=yyy'; resto → tokenFor directo).
function publicFormUrl(stored) {
  if (!stored) return null;
  const m = String(stored).match(/^\/dashboard\?form=(.+)$/);
  if (m) {
    const leafTok = tokenFor(decodeURIComponent(m[1])).replace('/v/', '');
    return `${tokenFor('/dashboard')}?f=${encodeURIComponent(leafTok)}`;
  }
  return tokenFor(stored);
}

// GET /api/tareas/:id — detalle completo para el drawer (mismo filtro de rol que la lista).
app.get('/api/tareas/:id', needLogin, needDb, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido.' });
  const fnc = req.session.fnc;
  const roles = (fnc.roles || []).map((r) => String(r).toLowerCase());
  let q = `SELECT id, created_at AS at, rol, titulo, detalle, responsable, area, proceso, fecha_limite, automatica, estado, hecha_por, hecha_at
           FROM tasks WHERE id = $1`;
  const params = [id];
  if (fnc.role !== 'ADMIN' && !roles.includes('coordinador')) {
    q += ` AND (estado = 'hecha' OR rol = ANY($2))`;
    params.push(roles);
  }
  try {
    const { rows } = await getPool().query(q, params);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado.' });
    const t = rows[0];
    t.formUrl = publicFormUrl(PROCESO_FORM[t.proceso] || null);
    res.json(t);
  } catch (e) {
    console.error('[api/tareas:id]', e.message);
    res.status(500).json({ error: 'Error interno.' });
  }
});


// CRUD maestros Distribuci�n (tras app + guards).
// GET /api/maestros/:id — lista (lectura: todos los roles).
app.get('/api/maestros/:id', needLogin, needDb, async (req, res) => {
  const m = MAESTROS[req.params.id];
  if (!m) return res.status(404).json({ error: 'Maestro desconocido.' });
  const sel = [...new Set([m.pk, ...m.cols])];
  const { rows } = await getPool().query(`SELECT ${sel.join(',')} FROM ${m.table} ORDER BY ${m.pk} LIMIT 500`);
  res.json(rows);
});

// POST /api/maestros/:id — crear (todos menos consultor).
app.post('/api/maestros/:id', needLogin, needDb, async (req, res) => {
  const m = MAESTROS[req.params.id];
  if (!m) return res.status(404).json({ ok: false, error: 'Maestro desconocido.' });
  if (!canWrite(req.session.fnc)) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  const cols = m.numpk ? m.cols : m.cols;
  const vals = {};
  for (const c of cols) {
    if (m.numpk && c === m.pk) continue;
    vals[c] = normVal(m, c, req.body && req.body[c]);
  }
  for (const c of (m.required || [])) {
    if (vals[c] === null || vals[c] === undefined || vals[c] === '') {
      return res.status(400).json({ ok: false, error: `Campo requerido: ${c}.` });
    }
  }
  if (Object.values(vals).some((v) => v === undefined)) {
    return res.status(400).json({ ok: false, error: 'Valor numérico inválido.' });
  }
  if (!m.numpk && !validCodigo(vals[m.pk])) {
    return res.status(400).json({ ok: false, error: 'Código inválido (2-12, A-Z 0-9 -).' });
  }
  const keys = Object.keys(vals).filter((c) => vals[c] !== null && !(m.numpk && c === m.pk));
  try {
    const { rows } = await getPool().query(
      `INSERT INTO ${m.table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING ${m.pk}`,
      keys.map((c) => vals[c]));
    const newPk = rows[0][m.pk];
    await writeAudit(req, { action: 'maestro.crear', modulo: 'distribucion', entidadId: String(newPk), detalle: `${req.params.id}: ${newPk}` });
    return res.status(201).json({ ok: true, id: newPk });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ ok: false, error: 'El registro ya existe.' });
    if (e.code === '23503') return res.status(400).json({ ok: false, error: 'Referencia inválida.' });
    if (e.code === '23514') return res.status(400).json({ ok: false, error: 'Rango inválido (revisa año y montos).' });
    console.error('[maestros:create]', e.message);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// PUT /api/maestros/:id/:codigo — editar (todos menos consultor; pk inmutable).
app.put('/api/maestros/:id/:codigo', needLogin, needDb, async (req, res) => {
  const m = MAESTROS[req.params.id];
  if (!m) return res.status(404).json({ ok: false, error: 'Maestro desconocido.' });
  if (!canWrite(req.session.fnc)) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  const pk = pkVal(m, req.params.codigo);
  if (pk === undefined) return res.status(400).json({ ok: false, error: 'Identificador inválido.' });
  const pairs = m.cols.filter((c) => c !== m.pk).map((c) => [c, normVal(m, c, req.body && req.body[c])]).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!pairs.length) return res.status(400).json({ ok: false, error: 'Nada que actualizar.' });
  if (pairs.some(([, v]) => typeof v === 'string' && v.length < 2)) return res.status(400).json({ ok: false, error: 'Valores muy cortos.' });
  try {
    const sets = pairs.map(([c], i) => `${c} = $${i + 2}`).join(',');
    const { rowCount } = await getPool().query(`UPDATE ${m.table} SET ${sets} WHERE ${m.pk} = $1`, [pk, ...pairs.map(([, v]) => v)]);
    if (!rowCount) return res.status(404).json({ ok: false, error: 'No encontrado.' });
    await writeAudit(req, { action: 'maestro.editar', modulo: 'distribucion', entidadId: String(pk), detalle: req.params.id });
    return res.json({ ok: true });
  } catch (e) {
    if (e.code === '23503') return res.status(400).json({ ok: false, error: 'Referencia inválida.' });
    if (e.code === '23514') return res.status(400).json({ ok: false, error: 'Rango inválido.' });
    console.error('[maestros:update]', e.message);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// DELETE /api/maestros/:id/:codigo — borrar (admin + coordinador).
app.delete('/api/maestros/:id/:codigo', needLogin, needDb, async (req, res) => {
  const m = MAESTROS[req.params.id];
  if (!m) return res.status(404).json({ ok: false, error: 'Maestro desconocido.' });
  if (!canDelete(req.session.fnc)) return res.status(403).json({ ok: false, error: 'Solo admin y coordinador.' });
  const pk = pkVal(m, req.params.codigo);
  if (pk === undefined) return res.status(400).json({ ok: false, error: 'Identificador inválido.' });
  try {
    const { rowCount } = await getPool().query(`DELETE FROM ${m.table} WHERE ${m.pk} = $1`, [pk]);
    if (!rowCount) return res.status(404).json({ ok: false, error: 'No encontrado.' });
    await writeAudit(req, { action: 'maestro.borrar', modulo: 'distribucion', entidadId: String(pk), detalle: req.params.id });
    try {
      await notify.encolar({ canal: 'discord', titulo: `Maestro borrado: ${req.params.id} ${pk}`, detalle: `Por ${req.session.fnc.email || '?'}`, ref: `maestro-borrado:${req.params.id}:${pk}` });
    } catch { /* aviso best-effort */ }
    return res.json({ ok: true });
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ ok: false, error: 'En uso: no se puede borrar.' });
    console.error('[maestros:delete]', e.message);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// PUT /api/distribucion-municipio/valor — fija ASIGNACIONES CREADAS por (ano, municipio).
// 1 fila → UPDATE · 0 filas → INSERT (numero=1, tipo=1) · N filas → 409 (ajustar por lote en Carga).
app.put('/api/distribucion-municipio/valor', needLogin, needDb, async (req, res) => {
  if (!canWrite(req.session.fnc)) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  const b = req.body || {};
  const ano = /^\d{4}$/.test(String(b.ano || '')) ? Number(b.ano) : NaN;
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return res.status(400).json({ ok: false, error: 'Año inválido.' });
  const mun = String(b.municipio || '').trim().toUpperCase();
  const valor = normVal(MAESTROS['distribucion-municipio'], 'valor', b.valor);
  if (valor === undefined || valor === null) return res.status(400).json({ ok: false, error: 'Valor inválido (número ≥ 0).' });
  try {
    const mc = await getPool().query('SELECT 1 FROM municipios WHERE codigo = $1', [mun]);
    if (!mc.rowCount) return res.status(400).json({ ok: false, error: 'Municipio inválido.' });
    const ex = await getPool().query('SELECT id, numero, tipo FROM distribucion_municipio WHERE ano = $1 AND municipio = $2 ORDER BY id', [ano, mun]);
    if (ex.rows.length > 1) {
      const lots = ex.rows.map((r) => `${r.numero}/${r.tipo}`).join(', ');
      return res.status(409).json({ ok: false, error: `Hay ${ex.rows.length} registros (${lots}): ajuste por lote en Carga.` });
    }
    if (ex.rows.length === 1) {
      await getPool().query('UPDATE distribucion_municipio SET valor = $1 WHERE id = $2', [valor, ex.rows[0].id]);
      await writeAudit(req, { action: 'maestro.editar', modulo: 'distribucion', entidadId: String(ex.rows[0].id), detalle: `distribucion-municipio valor ${mun}/${ano}` });
      return res.json({ ok: true, id: ex.rows[0].id });
    }
    const ins = await getPool().query(
      'INSERT INTO distribucion_municipio (numero, tipo, ano, municipio, valor) VALUES (1, 1, $1, $2, $3) RETURNING id',
      [ano, mun, valor]);
    await writeAudit(req, { action: 'maestro.crear', modulo: 'distribucion', entidadId: String(ins.rows[0].id), detalle: `distribucion-municipio valor ${mun}/${ano}` });
    return res.status(201).json({ ok: true, id: ins.rows[0].id });
  } catch (e) {
    console.error('[distmun:valor]', e.message);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// GET /api/notificaciones — campana no leída visible por mis roles (máx. 20).
app.get('/api/notificaciones', needLogin, needDb, async (req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT id, titulo, detalle, url, created_at FROM outbox
       WHERE canal = 'campana' AND estado = 'enviado' AND roles && $1 ORDER BY id DESC LIMIT 20`,
      [myRoles(req.session.fnc)]);
    return res.json(rows);
  } catch (e) {
    console.error('[notificaciones:list]', e.message);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// PUT /api/notificaciones/leidas — marca todas las visibles como leídas.
app.put('/api/notificaciones/leidas', needLogin, needDb, async (req, res) => {
  try {
    const { rowCount } = await getPool().query(
      `UPDATE outbox SET estado = 'leida' WHERE canal = 'campana' AND estado = 'enviado' AND roles && $1`,
      [myRoles(req.session.fnc)]);
    return res.json({ ok: true, n: rowCount });
  } catch (e) {
    console.error('[notificaciones:leidas]', e.message);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// PUT /api/notificaciones/:id/leida — marca una visible como leída (solo lectura: sin canWrite).
app.put('/api/notificaciones/:id/leida', needLogin, needDb, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Identificador inválido.' });
  try {
    const { rowCount } = await getPool().query(
      `UPDATE outbox SET estado = 'leida' WHERE id = $1 AND canal = 'campana' AND estado = 'enviado' AND roles && $2`,
      [id, myRoles(req.session.fnc)]);
    if (!rowCount) return res.status(404).json({ ok: false, error: 'No encontrada.' });
    await writeAudit(req, { action: 'notificacion.leida', modulo: 'plataforma', entidadId: String(id), detalle: 'Campana leída' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[notificaciones:leida]', e.message);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// GET /manifest.webmanifest — manifiesto PWA dual-UA (skill fnc-pwa-webpush).
// Móvil: standalone+portrait; escritorio: display_override window-controls-overlay.
app.get('/manifest.webmanifest', (req, res) => {
  const ua = String(req.get('User-Agent') || '');
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const manifest = {
    name: 'SIP-FNC · Comité de Cafeteros del Tolima',
    short_name: 'SIP FNC',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#6B4A2B',
    theme_color: '#6B4A2B',
    description: 'Sistema de Información de Proyectos — FNC Tolima',
    icons: [
      { src: '/icons/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/app-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  if (mobile) {
    manifest.orientation = 'portrait';
  } else {
    manifest.display_override = ['window-controls-overlay', 'standalone', 'browser'];
  }
  res.set('Content-Type', 'application/manifest+json');
  res.set('Cache-Control', 'no-store');
  return res.json(manifest);
});

// GET /api/push/public-key — clave VAPID pública (solo sesión; 503 sin configurar).
app.get('/api/push/public-key', needLogin, (req, res) => {
  try {
    const key = require('./push').publicKey();
    if (!key) return res.status(503).json({ ok: false, error: 'Push no configurado.' });
    return res.json({ ok: true, key });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// POST /api/push/subscribe — alta/idempotente por endpoint {endpoint,p256dh,auth}.
app.post('/api/push/subscribe', needLogin, needDb, async (req, res) => {
  const b = req.body || {};
  const endpoint = String(b.endpoint || '').trim();
  const p256dh = String(b.p256dh || '').trim();
  const auth = String(b.auth || '').trim();
  if (!/^https?:\/\/.{8,2000}$/.test(endpoint) || p256dh.length < 10 || auth.length < 5) {
    return res.status(400).json({ ok: false, error: 'Suscripción inválida.' });
  }
  const sub = req.session.fnc.sub || req.session.fnc.email || '';
  try {
    await getPool().query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, fnc_sub) VALUES ($1,$2,$3,$4)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, fnc_sub = EXCLUDED.fnc_sub`,
      [endpoint, p256dh, auth, sub]);
    await writeAudit(req, { action: 'push.suscribir', modulo: 'plataforma', detalle: 'Push activado en este equipo' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[push:subscribe]', e.message);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// DELETE /api/push/subscribe — revoca por endpoint (solo propias).
app.delete('/api/push/subscribe', needLogin, needDb, async (req, res) => {
  const endpoint = String((req.body && req.body.endpoint) || req.query.endpoint || '').trim();
  if (!endpoint) return res.status(400).json({ ok: false, error: 'Endpoint requerido.' });
  const sub = req.session.fnc.sub || req.session.fnc.email || '';
  try {
    const { rowCount } = await getPool().query(
      `DELETE FROM push_subscriptions WHERE endpoint = $1 AND fnc_sub = $2`, [endpoint, sub]);
    if (!rowCount) return res.status(404).json({ ok: false, error: 'No encontrada.' });
    await writeAudit(req, { action: 'push.revocar', modulo: 'plataforma', detalle: 'Push desactivado en este equipo' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[push:revoke]', e.message);
    return res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});
const page = (req, fnc, mod, body) => views.layout(APP_NAME, fnc, mod.path, body, ensureToken(req), req.nonce, { nVencidas: (req.res && req.res.locals.nVencidas) || 0, vencidasList: (req.res && req.res.locals.vencidasList) || [], nNotif: (req.res && req.res.locals.nNotif) || 0, notifList: (req.res && req.res.locals.notifList) || [] });

app.get('/dashboard', needLogin, needDb, async (req, res) => {
  const fnc = req.session.fnc;
  try {
    // Formulario inline: ?f=<token> (legacy ?form=<ruta>). Informes → vista independiente.
    let form = null;
    const fTok = req.query.f ? realFor(String(req.query.f)) : null;
    const fPath = fTok || (req.query.form ? String(req.query.form) : null);
    if (fPath === '/distribucion/actualizaciones/distribucion-municipio') {
      // Legacy: hoja eliminada del nav → vista unificada Distribuciones, tab mpio.
      const qs = new URLSearchParams({ f: tokenFor('/distribucion/actualizaciones/distribuciones').replace('/v/', ''), tab: 'mpio' });
      if (/^\d{4}$/.test(String(req.query.vigencia || ''))) qs.set('vigencia', String(req.query.vigencia));
      return res.redirect(`${tokenFor('/dashboard')}?${qs.toString()}`);
    }
    if (fPath) {
      const hit = findLeaf(fPath);
      if (!hit || !canAccess(fnc.role, hit.leaf)) {
        return res.status(403).send(views.errorPage(fnc, 'forbidden'));
      }
      if (hit.sub.kind === 'informe') return res.redirect(tokenFor(hit.leaf.path));
      form = hit;
      form.perms = { w: canWrite(fnc), d: canDelete(fnc) };
      form.tab = ['carga', 'mpio', 'circ', 'hist'].includes(req.query.tab) ? req.query.tab : 'mpio';
      form.msg = String(req.query.msg || '');
      form.msgOk = req.query.ok === '1';
      // Maestros con CRUD real: precarga filas + catálogos para el renderer.
      if (hit.leaf.crud && MAESTROS[hit.leaf.crud]) {
        const mc = MAESTROS[hit.leaf.crud];
        const r = await getPool().query(`SELECT ${mc.cols.join(',')} FROM ${mc.table} ORDER BY ${mc.pk}`);
        form.rows = r.rows;
        form.pkCol = mc.pk;
        if (hit.leaf.crud === 'municipios') {
          const c = await getPool().query('SELECT codigo, nombre FROM circunscripciones ORDER BY codigo');
          form.catalogs = { circunscripcion: c.rows };
        }
        if (hit.leaf.crud === 'distribucion-municipio') {
          const c = await getPool().query('SELECT codigo, nombre FROM municipios ORDER BY codigo');
          form.catalogs = { municipio: c.rows };
        }
      }
      // Tablas documento + 3 escenarios (vista unificada Distribuciones).
      if (hit.leaf.crud === 'distribuciones') {
        const yNow = new Date().getFullYear();
        const qv = String(req.query.vigencia || '');
        form.vigSel = /^\d{4}$/.test(qv) ? Number(qv) : yNow;
        if (form.vigSel < 2000 || form.vigSel > 2100) form.vigSel = yNow;
        const pool2 = getPool();
        const yy = await pool2.query(
          `SELECT vigencia AS y FROM distribuciones UNION SELECT ano FROM distribucion_municipio UNION SELECT vigencia FROM regla_oro_anual ORDER BY 1 DESC`);
        form.vigencias = [...new Set([yNow, ...yy.rows.map((r) => Number(r.y))])].filter((n) => Number.isInteger(n)).sort((a, b) => b - a);
        const rr = await pool2.query(
          `SELECT r.municipio, m.nombre AS municipio_nombre, m.circunscripcion AS circ_cod, c.nombre AS circ_nombre, r.regla
           FROM regla_oro_anual r JOIN municipios m ON m.codigo = r.municipio
           LEFT JOIN circunscripciones c ON c.codigo = m.circunscripcion
           WHERE r.vigencia = $1 ORDER BY c.nombre NULLS LAST, m.nombre`, [form.vigSel]);
        const vv = await pool2.query(
          `SELECT m.circunscripcion AS circ_cod, c.nombre AS circ_nombre, d.municipio,
                  m.nombre AS municipio_nombre, SUM(d.valor)::float8 AS total
           FROM distribucion_municipio d JOIN municipios m ON m.codigo = d.municipio
           LEFT JOIN circunscripciones c ON c.codigo = m.circunscripcion
           WHERE d.ano = $1 GROUP BY 1, 2, 3, 4 ORDER BY c.nombre NULLS LAST, m.nombre`, [form.vigSel]);
        const mm = await pool2.query(
          `SELECT id, tipo, vigencia, asignado, ejecutado FROM distribuciones WHERE vigencia = $1 ORDER BY tipo`, [form.vigSel]);
        const hh = await pool2.query(
          `SELECT tipo, vigencia, asignado, ejecutado FROM distribuciones ORDER BY vigencia, tipo`);
        form.doc = {
          regla: rr.rows, valores: vv.rows, montos: mm.rows, historial: hh.rows,
          hayRegla: rr.rows.length > 0,
          hayMontos: mm.rows.length > 0,
          hayValores: vv.rows.length > 0,
        };
      }
      // Regla de Oro (2 pasos): precarga regla + circunscripciones para la vigencia.
      if (hit.leaf.reglaOro) {
        const y0 = new Date().getFullYear() + 1;
        const qv = String(req.query.vigencia || '');
        form.vigencia = /^\d{4}$/.test(qv) && Number(qv) >= 2000 && Number(qv) <= 2100 ? Number(qv) : y0;
        const rr = await getPool().query(
          `SELECT r.municipio, m.nombre AS municipio_nombre, c.nombre AS circ_nombre, r.regla
           FROM regla_oro_anual r JOIN municipios m ON m.codigo = r.municipio
           LEFT JOIN circunscripciones c ON c.codigo = m.circunscripcion
           WHERE r.vigencia = $1 ORDER BY c.nombre NULLS LAST, m.nombre`, [form.vigencia]);
        form.reglaRows = rr.rows;
        form.tieneRegla = rr.rows.length > 0;
        const vv = await getPool().query(
          `SELECT municipio, SUM(valor)::float8 AS total FROM distribucion_municipio WHERE ano = $1 GROUP BY municipio`, [form.vigencia]);
        form.valores = {};
        vv.rows.forEach((x) => { form.valores[x.municipio] = Number(x.total); });
        const cc = await getPool().query('SELECT codigo, nombre FROM circunscripciones ORDER BY nombre');
        form.circs = cc.rows;
      }
    }
    const pool = getPool();
    const [s, a] = await Promise.all([
      pool.query('SELECT tipo, vigencia, asignado, ejecutado FROM distribuciones ORDER BY vigencia DESC, tipo'),
      // Mini panel: solo plataforma (auth/sistema queda fuera: login.*, logout).
      pool.query(`SELECT id, created_at AS at, actor_email, action, modulo, detalle FROM audit_log WHERE modulo NOT IN ('auth','seguridad') ORDER BY id DESC LIMIT 15`),
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
    res.send(page(req, fnc, { path: activePath }, views.dashboardPage(fnc, { saldos, tareas: t.rows, hechas: d.rows, actividad: a.rows, form, nonce: req.nonce })));
  } catch (e) {
    console.error('[dashboard]', e.message);
    // Si el error ocurre con ?form válido, conservar la selección del árbol.
    let activePath = MODULES[0].path;
    try {
      const fTok2 = req.query.f ? realFor(String(req.query.f)) : null;
      const fPath2 = fTok2 || (req.query.form ? String(req.query.form) : null);
      if (fPath2) {
        const hit = findLeaf(fPath2);
        if (hit && canAccess(fnc.role, hit.leaf) && hit.sub.kind !== 'informe') activePath = hit.leaf.path;
      }
    } catch { /* mantener Dashboard */ }
    res.send(page(req, fnc, { path: activePath }, `<div class="alert-err">No se pudo cargar el tablero.</div>`));
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
    res.send(page(req, fnc, { path: mod.path, title: mod.title },
      `<div class="card"><h1>${views.esc(mod.title)}</h1><p>Negocio en Fase 2. Tu acceso actual: <span class="badge">${views.esc(fnc.role)}</span></p></div>${subs}`));
  });
}

// Mi perfil vive en el modal de Configuración; URL vieja redirige al dashboard.
app.get('/perfil/perfil/mi-perfil', needLogin, (req, res) => res.redirect(tokenFor('/dashboard')));

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
  return res.redirect(tokenFor('/dashboard')+'?msg=clave_solicitada');
});

// POST /api/perfil/preferencia — {display_mode: full|first} (autoservicio).
app.post('/api/perfil/preferencia', needLogin, needDb, async (req, res) => {
  const mode = req.body && req.body.display_mode === 'first' ? 'first' : 'full';
  const { savePrefs } = require('./prefs');
  const ok = await savePrefs(req.session.fnc.sub, { display_mode: mode });
  if (!ok) return res.status(500).json({ ok: false, error: 'No se pudo guardar.' });
  req.session.fnc.displayMode = mode;
  await writeAudit(req, { action: 'perfil.preferencia', modulo: 'seguridad', detalle: `Nombre mostrado: ${mode}` });
  return res.json({ ok: true, display_mode: mode });
});

// POST /api/perfil/foto — subida propia (multipart, token por header).
// Límites: jpeg/png/webp, 5 MB, magic-bytes reales; salida webp 256px q80 (~20 KB).
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Tipo no permitido (solo jpeg, png, webp).'));
  },
});
app.post('/api/perfil/foto', needLogin, needDb, (req, res) => {
  uploadFoto.single('foto')(req, res, async (err) => {
    if (err) {
      const msg = String(err.message || '');
      const code = msg.includes('File too large') || msg.includes('5') ? 413 : 400;
      return res.status(code).json({ ok: false, error: msg.includes('Tipo') ? msg : 'Archivo inválido o mayor a 5 MB.' });
    }
    if (!req.file) return res.status(400).json({ ok: false, error: 'Sin archivo.' });
    try {
      const safe = String(req.session.fnc.sub).replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64) || 'user';
      const dir = require('path').join(__dirname, '..', 'public', 'img', 'user');
      fs.mkdirSync(dir, { recursive: true });
      const out = require('path').join(dir, `${safe}.webp`);
      await sharp(req.file.buffer).resize(256, 256, { fit: 'cover' }).webp({ quality: 80 }).toFile(out);
      const stat = fs.statSync(out);
      const { savePrefs } = require('./prefs');
      const photo = `/img/user/${safe}.webp`;
      const saved = await savePrefs(req.session.fnc.sub, { display_mode: req.session.fnc.displayMode === 'first' ? 'first' : 'full', photo });
      if (!saved) {
        try { fs.unlinkSync(out); } catch { /* sin archivo que borrar */ }
        return res.status(500).json({ ok: false, error: 'No se pudo guardar la preferencia.' });
      }
      req.session.fnc.photo = photo;
      await writeAudit(req, { action: 'perfil.foto', modulo: 'seguridad', detalle: `Foto actualizada (${Math.round(stat.size / 1024)} KB)` });
      return res.json({ ok: true, photo, kb: Math.round(stat.size / 1024) });
    } catch (e) {
      console.error('[perfil/foto]', e.message);
      return res.status(400).json({ ok: false, error: 'Imagen inválida o corrupta.' });
    }
  });
});

const { INFORMES, buildXlsx } = require('./informes');

// Informes Distribución reales (Fase 2): filtros + tabla + exportar Excel.
// Van ANTES del bucle genérico de hojas. Export: /api/informes/:id/xlsx.
const INFORME_LEAVES = {
  '/distribucion/informes/por-distribucion': 'por-distribucion',
  '/distribucion/informes/por-ano': 'por-ano',
  '/distribucion/informes/saldos': 'saldos',
  '/distribucion/informes/cuenta-corriente': 'cuenta-corriente',
};

for (const [leafPath, infId] of Object.entries(INFORME_LEAVES)) {
  app.get(leafPath, needLogin, needDb, async (req, res) => {
    const fnc = req.session.fnc;
    const hit = findLeaf(leafPath);
    if (!hit || !canAccess(fnc.role, hit.leaf)) {
      return res.status(403).send(views.errorPage(fnc, 'forbidden'));
    }
    try {
      const data = await INFORMES[infId].run(getPool(), req.query);
      res.send(page(req, fnc, { path: leafPath, title: hit.leaf.title },
        views.informePage(hit, req.query, data, { id: infId, filters: INFORMES[infId].filters })));
    } catch (e) {
      const code = e.status || 500;
      if (code === 400) return res.status(400).send(page(req, fnc, { path: leafPath, title: hit.leaf.title }, `<div class="alert-err">${views.esc(e.message)}</div>`));
      console.error('[informes]', e.message);
      return res.status(500).send(page(req, fnc, { path: leafPath, title: hit.leaf.title }, `<div class="alert-err">No se pudo generar el informe.</div>`));
    }
  });
}

app.get('/api/informes/:id/xlsx', needLogin, needDb, async (req, res) => {
  const def = INFORMES[req.params.id];
  if (!def) return res.status(404).json({ error: 'Informe desconocido.' });
  try {
    const data = await def.run(getPool(), req.query);
    const buf = await buildXlsx(def.title, data.cols, data.rows);
    await writeAudit(req, { action: 'informe.exportar', modulo: 'distribucion', detalle: `${req.params.id} (${data.rows.length} filas)` });
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="sip-${req.params.id}.xlsx"`);
    return res.send(buf);
  } catch (e) {
    console.error('[informes:xlsx]', e.message);
    return res.status(500).json({ error: 'No se pudo exportar.' });
  }
});

// Regla de Oro (2 pasos): cargar xlsx (paso 1) + asignar por circunscripción (paso 2).
// Escribe solo con canWrite (consultor: lectura). Rechazo estricto, sin parciales.
const { parseReglaOro } = require('./reglaoro');
const uploadRegla = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const okExt = /\.xlsx$/i.test(file.originalname || '');
    const okMime = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'].includes(file.mimetype);
    if (okExt && okMime) return cb(null, true);
    return cb(new Error('Solo xlsx hasta 5 MB.'));
  },
});
const DIST_TOK = () => tokenFor('/distribucion/actualizaciones/distribuciones').replace('/v/', '');
// Fallback no-JS: los forms de carga viven en la pestaña Carga de Distribuciones.
const REGLA_BACK = (qs) => `${tokenFor('/dashboard')}?f=${DIST_TOK()}&tab=carga&${qs}`;

app.post('/api/regla-oro/cargar', needLogin, needDb, (req, res) => {
  uploadRegla.single('archivo')(req, res, async (err) => {
    const wantJson = (req.headers.accept || '').includes('application/json');
    const fail = (code, error) => wantJson
      ? res.status(code).json({ ok: false, error })
      : res.redirect(REGLA_BACK('msg=' + encodeURIComponent(error)));
    const done = (msg, extra) => wantJson
      ? res.json({ ok: true, msg, ...(extra || {}) })
      : res.redirect(REGLA_BACK(`vigencia=${vy}&ok=1&msg=` + encodeURIComponent(msg)));
    if (err) return fail(400, 'Archivo inválido o mayor a 5 MB (solo xlsx).');
    const fnc = req.session.fnc;
    if (!canWrite(fnc)) return res.status(403).send(views.errorPage(fnc, 'forbidden'));
    const vy = Number(req.body && req.body.vigencia);
    if (!Number.isInteger(vy) || vy < 2000 || vy > 2100) return fail(400, 'Vigencia inválida (2000–2100).');
    // Perímetro: vigencias anteriores solo ADMIN (la actual/futura: canWrite).
    if (vy < new Date().getFullYear() && fnc.role !== 'ADMIN') {
      return fail(403, 'Solo ADMIN carga vigencias anteriores.');
    }
    if (!req.file) return fail(400, 'Sin archivo.');
    try {
      const pool = getPool();
      const mun = await pool.query('SELECT codigo, nombre FROM municipios');
      const byCodigo = {};
      const byNombre = {};
      const { normKey } = require('./reglaoro');
      mun.rows.forEach((m) => { byCodigo[m.codigo] = true; byNombre[normKey(m.nombre)] = m.codigo; });
      const { rows, errors } = await parseReglaOro(req.file.buffer, { byCodigo, byNombre });
      if (errors.length) {
        const det = errors.slice(0, 3).join(' ') + (errors.length > 3 ? ` (+${errors.length - 3} más)` : '');
        return fail(400, `Rechazado (0 guardados): ${det}`);
      }
      for (const r of rows) {
        await pool.query(
          `INSERT INTO regla_oro_anual (vigencia, municipio, regla) VALUES ($1,$2,$3)
           ON CONFLICT (vigencia, municipio) DO UPDATE SET regla = EXCLUDED.regla`,
          [vy, r.municipio, r.regla]);
      }
      await writeAudit(req, { action: 'regla.cargar', modulo: 'distribucion', detalle: `Regla ${vy}: ${rows.length} municipios` });
      return done(`Regla ${vy} cargada: ${rows.length} municipios (sin valores).`, { n: rows.length });
    } catch (e) {
      console.error('[regla/cargar]', e.message);
      return fail(500, 'No se pudo procesar el archivo.');
    }
  });
});

app.post('/api/regla-oro/asignar', needLogin, needDb, async (req, res) => {
  const fnc = req.session.fnc;
  if (!canWrite(fnc)) return res.status(403).send(views.errorPage(fnc, 'forbidden'));
  const wantJson = (req.headers.accept || '').includes('application/json');
  const fail = (code, error) => wantJson
    ? res.status(code).json({ ok: false, error })
    : res.redirect(REGLA_BACK('msg=' + encodeURIComponent(error)));
  const done = (msg, extra) => wantJson
    ? res.json({ ok: true, msg, ...(extra || {}) })
    : res.redirect(REGLA_BACK(`vigencia=${vy}&ok=1&msg=` + encodeURIComponent(msg)));
  try {
    const b = req.body || {};
    const vy = Number(b.vigencia);
    const numero = Number(b.numero);
    const tipo = Number(b.tipo);
    if (!Number.isInteger(vy) || vy < 2000 || vy > 2100) return fail(400, 'Vigencia inválida (2000–2100).');
    if (!Number.isInteger(numero) || numero < 0 || !Number.isInteger(tipo) || tipo < 0) return fail(400, 'Número y tipo deben ser enteros ≥ 0.');
    const pool = getPool();
    const rr = await pool.query(
      `SELECT r.municipio, r.regla, m.circunscripcion FROM regla_oro_anual r
       JOIN municipios m ON m.codigo = r.municipio WHERE r.vigencia = $1`, [vy]);
    if (!rr.rows.length) return fail(400, `Sin regla cargada para ${vy} (paso 1 primero).`);
    const totales = (b.totales && typeof b.totales === 'object') ? b.totales : {};
    for (const [k, v] of Object.entries(b)) {
      if (String(k).startsWith('tot_') && String(v).trim() !== '') totales[String(k).slice(4)] = v;
    }
    const porCirc = {};
    for (const r of rr.rows) {
      const c = r.circunscripcion || 'SIN';
      (porCirc[c] = porCirc[c] || []).push(r);
    }
    let n = 0;
    for (const [circ, items] of Object.entries(porCirc)) {
      const raw = totales[circ];
      if (raw === undefined || String(raw).trim() === '') continue; // vacío = no tocar
      const total = Number(raw);
      if (!Number.isFinite(total) || total < 0) return fail(400, `Total inválido para ${circ}.`);
      const suma = items.reduce((a, x) => a + Number(x.regla), 0);
      if (!(suma > 0)) return fail(400, `Regla en cero para ${circ}.`);
      for (const it of items) {
        const valor = Math.round((total * Number(it.regla) / suma) * 100) / 100;
        await pool.query(
          `INSERT INTO distribucion_municipio (numero, tipo, ano, ppto, municipio, valor) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (numero, tipo, ano, municipio) DO UPDATE SET valor = EXCLUDED.valor, ppto = EXCLUDED.ppto`,
          [numero, tipo, vy, total, it.municipio, valor]);
        n++;
      }
    }
    if (!n) return fail(400, 'Indica al menos un total por circunscripción.');
    await writeAudit(req, { action: 'regla.asignar', modulo: 'distribucion', detalle: `Vigencia ${vy} (núm ${numero}, tipo ${tipo}): ${n} municipios` });
    return done(`Vigencia ${vy}: ${n} municipios actualizados.`, { n });
  } catch (e) {
    console.error('[regla/asignar]', e.message);
    return fail(500, 'No se pudo asignar.');
  }
});

// POST /api/regla-oro/asignar-total — paso 2 con UN solo total: se reparte
// entre todos los municipios según la regla (Σ exacta en centavos; el residual
// del redondeo va al último). numero/tipo opcionales (default 1).
app.post('/api/regla-oro/asignar-total', needLogin, needDb, async (req, res) => {
  const fnc = req.session.fnc;
  if (!canWrite(fnc)) return res.status(403).send(views.errorPage(fnc, 'forbidden'));
  const wantJson = (req.headers.accept || '').includes('application/json');
  const fail = (code, error) => wantJson
    ? res.status(code).json({ ok: false, error })
    : res.redirect(REGLA_BACK('msg=' + encodeURIComponent(error)));
  const done = (msg, extra) => wantJson
    ? res.json({ ok: true, msg, ...(extra || {}) })
    : res.redirect(REGLA_BACK(`vigencia=${vy}&ok=1&msg=` + encodeURIComponent(msg)));
  try {
    const b = req.body || {};
    const vy = Number(b.vigencia);
    const numero = b.numero === undefined ? 1 : Number(b.numero);
    const tipo = b.tipo === undefined ? 1 : Number(b.tipo);
    const total = Number(b.total);
    if (!Number.isInteger(vy) || vy < 2000 || vy > 2100) return fail(400, 'Vigencia inválida (2000–2100).');
    if (!Number.isInteger(numero) || numero < 0 || !Number.isInteger(tipo) || tipo < 0) return fail(400, 'Número y tipo deben ser enteros ≥ 0.');
    if (!Number.isFinite(total) || total <= 0) return fail(400, 'Total inválido (> 0).');
    const pool = getPool();
    const rr = await pool.query(
      `SELECT r.municipio, r.regla FROM regla_oro_anual r WHERE r.vigencia = $1 ORDER BY r.municipio`, [vy]);
    if (!rr.rows.length) return fail(400, `Sin regla cargada para ${vy} (paso 1 primero).`);
    const suma = rr.rows.reduce((a, x) => a + Number(x.regla), 0);
    if (!(suma > 0)) return fail(400, `Regla en cero para ${vy}.`);
    const totalC = Math.round(total * 100);
    const items = rr.rows.map((r) => ({ municipio: r.municipio, c: Math.round((totalC * Number(r.regla)) / suma) }));
    const diff = totalC - items.reduce((a, x) => a + x.c, 0);
    items[items.length - 1].c += diff;
    if (items.some((x) => x.c < 0)) return fail(400, 'Total muy bajo para repartir entre los municipios.');
    for (const it of items) {
      await pool.query(
        `INSERT INTO distribucion_municipio (numero, tipo, ano, ppto, municipio, valor) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (numero, tipo, ano, municipio) DO UPDATE SET valor = EXCLUDED.valor, ppto = EXCLUDED.ppto`,
        [numero, tipo, vy, total, it.municipio, it.c / 100]);
    }
    await writeAudit(req, { action: 'regla.asignar', modulo: 'distribucion', detalle: `Vigencia ${vy} (núm ${numero}, tipo ${tipo}, total ${total}): ${items.length} municipios` });
    return done(`Vigencia ${vy}: ${items.length} municipios actualizados.`, { n: items.length });
  } catch (e) {
    console.error('[regla/asignar-total]', e.message);
    return fail(500, 'No se pudo asignar.');
  }
});

// GET /api/regla-oro/comparar?vigencias=2026,2027[,2028] — regla % lado a lado (2 o 3).
app.get('/api/regla-oro/comparar', needLogin, needDb, async (req, res) => {
  try {
    const vys = [...new Set(String(req.query.vigencias || '').split(',').map((x) => Number(String(x).trim())).filter((n) => Number.isInteger(n) && n >= 2000 && n <= 2100))].sort();
    if (vys.length < 2 || vys.length > 3) return res.status(400).json({ ok: false, error: 'Indica 2 o 3 vigencias (2000–2100).' });
    const { rows } = await getPool().query(
      `SELECT r.vigencia, r.municipio, m.nombre AS nombre, c.nombre AS circ, r.regla
       FROM regla_oro_anual r JOIN municipios m ON m.codigo = r.municipio
       LEFT JOIN circunscripciones c ON c.codigo = m.circunscripcion
       WHERE r.vigencia = ANY($1) ORDER BY m.nombre`, [vys]);
    res.json({ ok: true, vigencias: vys, rows });
  } catch (e) {
    console.error('[regla/comparar]', e.message);
    res.status(500).json({ ok: false, error: 'No se pudo comparar.' });
  }
});

function reglaRowsVigencia(pool, vy) {
  return pool.query(
    `SELECT m.nombre AS municipio, c.nombre AS circ,
            r.regla, COALESCE(v.total, 0) AS valor
     FROM regla_oro_anual r JOIN municipios m ON m.codigo = r.municipio
     LEFT JOIN circunscripciones c ON c.codigo = m.circunscripcion
     LEFT JOIN (SELECT municipio, SUM(valor)::float8 AS total FROM distribucion_municipio WHERE ano = $1 GROUP BY municipio) v ON v.municipio = r.municipio
     WHERE r.vigencia = $1 ORDER BY m.nombre`, [vy]);
}

function vigenciaParam(q) {
  const vy = Number(q.vigencia);
  return Number.isInteger(vy) && vy >= 2000 && vy <= 2100 ? vy : null;
}

// GET /api/regla-oro/xlsx?vigencia= — exporta regla + valores.
app.get('/api/regla-oro/xlsx', needLogin, needDb, async (req, res) => {
  const vy = vigenciaParam(req.query);
  if (!vy) return res.status(400).json({ ok: false, error: 'Vigencia inválida.' });
  try {
    const { rows } = await reglaRowsVigencia(getPool(), vy);
    if (!rows.length) return res.status(404).json({ ok: false, error: `Sin regla para ${vy}.` });
    const buf = await buildXlsx(`Regla de Oro ${vy}`,
      ['municipio', 'circunscripcion', 'regla_pct', 'valor'],
      rows.map((r) => ({ municipio: r.municipio, circunscripcion: r.circ || '', regla_pct: +(Number(r.regla) * 100).toFixed(4), valor: Number(r.valor) })));
    await writeAudit(req, { action: 'regla.exportar', modulo: 'distribucion', detalle: `Regla ${vy} xlsx (${rows.length} filas)` });
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="sip-regla-${vy}.xlsx"`);
    return res.send(buf);
  } catch (e) {
    console.error('[regla/xlsx]', e.message);
    return res.status(500).json({ ok: false, error: 'No se pudo exportar.' });
  }
});

// GET /api/regla-oro/pdf?vigencia= — documento simple (tabla regla + valores).
app.get('/api/regla-oro/pdf', needLogin, needDb, async (req, res) => {
  const vy = vigenciaParam(req.query);
  if (!vy) return res.status(400).json({ ok: false, error: 'Vigencia inválida.' });
  try {
    const { rows } = await reglaRowsVigencia(getPool(), vy);
    if (!rows.length) return res.status(404).json({ ok: false, error: `Sin regla para ${vy}.` });
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on('end', resolve));
    doc.fontSize(14).text(`SIP-FNC · Regla de Oro ${vy}`, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text('Municipio | Circunscripción | Regla % | Valor');
    doc.moveDown(0.5);
    doc.fontSize(9);
    for (const r of rows) {
      if (doc.y > 740) doc.addPage();
      doc.text(`${r.municipio} | ${r.circ || '—'} | ${(Number(r.regla) * 100).toFixed(2)}% | ${Number(r.valor).toLocaleString('es-CO')}`);
    }
    doc.end();
    await done;
    await writeAudit(req, { action: 'regla.exportar', modulo: 'distribucion', detalle: `Regla ${vy} pdf (${rows.length} filas)` });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="sip-regla-${vy}.pdf"`);
    return res.send(Buffer.concat(chunks));
  } catch (e) {
    console.error('[regla/pdf]', e.message);
    return res.status(500).json({ ok: false, error: 'No se pudo exportar.' });
  }
});

// Hojas del árbol: /:modulo/:sub/:item con guard por hoja (planas "Fase 2" por ahora).
for (const { leaf, sub, mod } of flattenLeaves()) {
  app.get(leaf.path, needLogin, (req, res) => {
    const fnc = req.session.fnc;
    if (!canAccess(fnc.role, leaf)) {
      return res.status(403).send(views.errorPage(fnc, 'forbidden'));
    }
    res.send(page(req, fnc, { path: leaf.path, title: leaf.title },
      `<p><a href="${mod.path}">${views.esc(mod.title)}</a> / ${views.esc(sub.title)}</p><div class="card"><h1>${views.esc(leaf.title)}</h1><p>Negocio en Fase 2. Tu acceso actual: <span class="badge">${views.esc(fnc.role)}</span></p></div>`));
  });
}

// Legacy: hoja Distribución por Municipio eliminada del nav → vista unificada, tab mpio.
app.get('/distribucion/actualizaciones/distribucion-municipio', needLogin, (req, res) => {
  const qs = new URLSearchParams({ f: tokenFor('/distribucion/actualizaciones/distribuciones').replace('/v/', ''), tab: 'mpio' });
  if (/^\d{4}$/.test(String(req.query.vigencia || ''))) qs.set('vigencia', String(req.query.vigencia));
  return res.redirect(`${tokenFor('/dashboard')}?${qs.toString()}`);
});

// GET/POST /api/admin/rate-limit — ver y cambiar en caliente (solo ADMIN, auditado).
app.get('/api/admin/rate-limit', needLogin, needRole('ADMIN'), (req, res) => {
  res.json({ perMin: rateLimitMax(), env: ENV_MAX, override: hotMax != null });
});
app.post('/api/admin/rate-limit', needLogin, needRole('ADMIN'), async (req, res) => {
  const perMin = Number((req.body && req.body.perMin) ?? req.query.perMin);
  if (!Number.isInteger(perMin) || perMin < 1 || perMin > 100000) {
    return res.status(400).json({ error: 'perMin entero entre 1 y 100000.' });
  }
  hotMax = perMin === ENV_MAX ? null : perMin;
  await writeAudit(req, { action: 'ratelimit.override', modulo: 'seguridad', detalle: `Límite a ${perMin}/min` });
  if ((req.headers.accept || '').includes('application/json')) return res.json({ ok: true, perMin });
  return res.redirect(tokenFor('/seguridad')+'?msg=ratelimit_ok');
});

// GET /smtp — formulario Resend (solo ADMIN; la clave jamás se muestra completa).
app.get('/smtp', needLogin, needRole('ADMIN'), async (req, res) => {
  const fnc = req.session.fnc;
  let masked = '—', from = '', hasKey = false;
  try {
    const pool = getPool();
    if (pool) {
      const { rows } = await pool.query(`SELECT clave, valor FROM app_settings WHERE clave IN ('resend_api_key','mail_from')`);
      const { maskSecret, decSecret } = require('./crypto');
      for (const r of rows) {
        if (r.clave === 'mail_from') from = r.valor;
        if (r.clave === 'resend_api_key') { try { masked = maskSecret(decSecret(r.valor)); hasKey = true; } catch { /* corrupto */ } }
      }
    }
  } catch { /* sin DB */ }
  const msg = req.query.msg === 'ok' ? `<div class="card"><p><span class="badge">Guardado.</span></p></div>`
    : req.query.msg ? `<div class="alert-err">${views.esc(String(req.query.msg))}</div>` : '';
  res.send(page(req, fnc, { path: '/smtp', title: 'SMTP' }, `${msg}<div class="card"><h1>SMTP · Resend</h1>
<p>API key actual: <strong class="tnum">${views.esc(masked)}</strong> ${hasKey ? '<span class="badge">configurada</span>' : '<span class="badge badge-warn">pendiente</span>'}</p>
<form method="post" action="/api/smtp/guardar" data-precheck style="margin:12px 0 0"><input type="hidden" name="_csrf" value="${ensureToken(req)}">
<label class="fld"><span>API key Resend (vacío = conservar)</span><input name="resend_api_key" type="password" autocomplete="off"></label>
<label class="fld"><span>Remitente (Nombre &lt;correo@dominio&gt;)</span><input name="mail_from" type="text" value="${views.esc(from)}" maxlength="160"></label>
<button class="btn-primary" type="submit">Guardar</button></form>
<p>Secretos cifrados (AES-256-GCM) en BD. Requiere <code>ENCRYPTION_KEY</code> en el host.</p></div>`));
});

// POST /api/smtp/guardar — guarda cifrado (solo ADMIN, auditado sin secretos).
app.post('/api/smtp/guardar', needLogin, needRole('ADMIN'), needDb, async (req, res) => {
  const key = String((req.body && req.body.resend_api_key) || '').trim();
  const from = String((req.body && req.body.mail_from) || '').trim().slice(0, 160);
  if (from && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from.replace(/^.*</, '').replace(/>$/, ''))) {
    return res.redirect(tokenFor('/smtp') + '?msg=' + encodeURIComponent('Remitente inválido.'));
  }
  try {
    const { encSecret } = require('./crypto');
    const pool = getPool();
    if (key) {
      await pool.query(`INSERT INTO app_settings (clave, valor, secreto) VALUES ('resend_api_key',$1,TRUE)
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`, [encSecret(key)]);
    }
    if (from) {
      await pool.query(`INSERT INTO app_settings (clave, valor, secreto) VALUES ('mail_from',$1,FALSE)
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`, [from]);
    }
    await writeAudit(req, { action: 'smtp.guardar', modulo: 'seguridad', detalle: `SMTP actualizado${key ? ' (key)' : ''}${from ? ' (remitente)' : ''}` });
    return res.redirect(tokenFor('/smtp') + '?msg=ok');
  } catch (e) {
    console.error('[smtp/guardar]', e.message);
    // Mensaje según causa: tabla ausente (migrate 004) vs clave ausente/corta vs otro.
    const msg = (e.code === '42P01' || /does not exist/i.test(e.message || ''))
      ? 'Falta la tabla app_settings: corre node db/migrate.js (004).'
      : (/ENCRYPTION_KEY/.test(e.message || ''))
        ? 'Falta ENCRYPTION_KEY (mín 32) en el .env: agrégala y reinicia.'
        : 'No se pudo guardar.';
    return res.redirect(tokenFor('/smtp') + '?msg=' + encodeURIComponent(msg));
  }
});

// GET /email — probar envío (solo ADMIN): un input mail + botón.
app.get('/email', needLogin, needRole('ADMIN'), (req, res) => {
  const fnc = req.session.fnc;
  const msg = req.query.msg === 'ok' ? `<div class="card"><p><span class="badge">Correo enviado.</span> Revisa el inbox.</p></div>`
    : req.query.msg ? `<div class="alert-err">${views.esc(String(req.query.msg))}</div>` : '';
  res.send(page(req, fnc, { path: '/email', title: 'Email' }, `${msg}<div class="card"><h1>Probar correo</h1>
<p>Envía un correo de prueba con la configuración del módulo SMTP.</p>
<form method="post" action="/api/email/probar" data-precheck style="margin:12px 0 0"><input type="hidden" name="_csrf" value="${ensureToken(req)}">
<label class="fld"><span>Correo destino</span><input name="to" type="email" required maxlength="160" placeholder="destino@dominio.com"></label>
<button class="btn-primary" type="submit">Enviar prueba</button></form></div>`));
});

// POST /api/email/probar — envío de prueba (solo ADMIN, auditado por dominio).
app.post('/api/email/probar', needLogin, needRole('ADMIN'), needDb, async (req, res) => {
  const to = String((req.body && req.body.to) || '').trim().toLowerCase().slice(0, 160);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return res.redirect(tokenFor('/email') + '?msg=' + encodeURIComponent('Correo inválido.'));
  }
  try {
    const { sendMail } = require('./mail');
    await sendMail({ to, subject: 'SIP-FNC · Correo de prueba', title: 'Correo de prueba', body: `<p>La configuración SMTP de <strong>SIP-FNC</strong> funciona correctamente.</p>` });
    const dom = to.split('@')[1];
    await writeAudit(req, { action: 'email.probar', modulo: 'seguridad', detalle: `Prueba a @${dom}` });
    return res.redirect(tokenFor('/email') + '?msg=ok');
  } catch (e) {
    console.error('[email/probar]', e.message);
    return res.redirect(tokenFor('/email') + '?msg=' + encodeURIComponent(e.message || 'No se pudo enviar.'));
  }
});

app.get('/seguridad', needLogin, needRole('ADMIN'), async (req, res) => {
  const fnc = req.session.fnc;
  let solis = [];
  let audit = [];
  try {
    const r = await getPool().query(
      `SELECT actor_email, detalle, created_at AS at FROM audit_log WHERE action = 'clave.solicitar' ORDER BY id DESC LIMIT 20`);
    solis = r.rows;
    const a = await getPool().query(
      `SELECT actor_email, action, modulo, detalle, created_at AS at FROM audit_log ORDER BY id DESC LIMIT 50`);
    audit = a.rows;
  } catch { /* sin DB: panel mínimo */ }
  const lis = solis.map((s) => `<li><strong>${views.esc(s.actor_email)}</strong> · ${views.esc(new Date(s.at).toLocaleString('es-CO'))}<br><span>${views.esc(s.detalle || '')}</span></li>`).join('');
  const auditRows = audit.map((a) => `<tr><td class="tnum">${views.esc(new Date(a.at).toLocaleString('es-CO'))}</td><td>${views.esc(a.actor_email)}</td><td><code>${views.esc(a.action)}</code></td><td><span class="badge">${views.esc(a.modulo || '')}</span></td><td>${views.esc(a.detalle || '')}</td></tr>`).join('');
  res.send(page(req, fnc, { path: '/seguridad', title: 'Seguridad' }, `<div class="card"><h1>Seguridad</h1><p>Solo <span class="badge">ADMIN</span>. Rate-limit vigente: <strong class="tnum">${rateLimitMax()}/min</strong>${hotMax != null ? ' <span class="badge">override</span>' : ''} (env: ${ENV_MAX}/min).</p>
<form method="post" action="/api/admin/rate-limit" style="margin:12px 0 0"><input type="hidden" name="_csrf" value="${ensureToken(req)}"><label class="fld"><span>Nuevo límite por minuto y por IP</span><input name="perMin" type="number" min="1" max="100000" value="${rateLimitMax()}"></label><button class="btn-primary" type="submit">Aplicar en caliente</button></form>
<p>Volátil: revierte al env al reiniciar. Queda en bitácora.</p></div>
<div class="card"><h2>Solicitudes de cambio de contraseña (${solis.length})</h2><ul class="feed">${lis || '<li>Sin solicitudes.</li>'}</ul><p>Flujo: reset en consola Keycloak + acción requerida <code>UPDATE_PASSWORD</code> (skill fnc-keycloak-users, staging).</p></div>
<div class="card"><h2>Auditoría completa (solo admin, incluye seguridad)</h2><table><thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Módulo</th><th>Detalle</th></tr></thead><tbody>${auditRows || '<tr><td colspan="5">Sin movimientos.</td></tr>'}</tbody></table></div>`));
});

// Matriz viva de roles: qué ve cada rol (permitido / deshabilitado / oculto).
app.get('/roles', needLogin, (req, res) => {
  res.send(page(req, req.session.fnc, { path: '/roles', title: 'Roles' }, views.rolesMatrix(req.session.fnc)));
});

app.get('/error', (req, res) => {
  res.send(views.errorPage(req.session?.fnc, req.query.reason));
});

// API desconocida: JSON (no HTML) para clientes viejos o rutas retiradas.
app.use('/api/', (req, res) => {
  res.status(404).json({ error: 'Ruta API desconocida.' });
});

const PORT = process.env.PORT || 3020;
if (require.main === module) {
  app.listen(PORT, () => console.log(`[${APP_NAME}] http://localhost:${PORT} provider=${process.env.AUTH_PROVIDER || 'mock'}`));
  notify.startWorker();
}
module.exports = app;



