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
const { PROCESO_FORM } = require('./task-meta');
const { hydrate } = require('./prefs');
const { ensureToken, verifyCsrf } = require('./csrf');
const { getPool, dbReady } = require('./db');
const { writeAudit } = require('./audit');

const crypto = require('crypto');
const APP_NAME = process.env.APP_NAME || 'app-fnc';
const app = express();
app.set('trust proxy', 1); // IP real tras nginx (cf-connecting-ip / x-forwarded-for)
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
      styleSrc: ["'self'"],
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
  return res.redirect('/login');
};
const needRole = (role) => (req, res, next) => {
  if (req.session?.fnc?.role === role) return next();
  return res.status(403).send(views.errorPage(req.session?.fnc, 'forbidden'));
};

function setFnc(req, fnc, idToken) {
  req.session.fnc = fnc;
  req.session.lastActivity = Date.now();
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
  res.send(views.loginPage(APP_NAME, isKeycloakMode(), ensureToken(req), req.query.reason));
});

app.post('/auth/mock', async (req, res) => {
  if (isKeycloakMode()) return res.redirect('/auth/app');
  setFnc(req, getMockSession(req));
  await hydrate(req.session.fnc);
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
    req.session.fnc.givenName = String(claims.given_name || '').trim();
    req.session.fnc.familyName = String(claims.family_name || '').trim();
    await hydrate(req.session.fnc);
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

// GET /api/actividad — últimos 15 movimientos (bitácora, resumen abstracto).
app.get('/api/actividad', needLogin, needDb, async (req, res) => {
  const { rows } = await getPool().query(
    `SELECT id, created_at AS at, actor_email, action, modulo, entidad_id, detalle
     FROM audit_log ORDER BY id DESC LIMIT 15`);
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
    t.formUrl = PROCESO_FORM[t.proceso] || null;
    res.json(t);
  } catch (e) {
    console.error('[api/tareas:id]', e.message);
    res.status(500).json({ error: 'Error interno.' });
  }
});

const page = (req, fnc, mod, body) => views.layout(APP_NAME, fnc, mod.path, body, ensureToken(req), req.nonce);

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
      pool.query(`SELECT id, created_at AS at, actor_email, action, modulo, detalle FROM audit_log WHERE action NOT IN ('login.mock','login.keycloak','logout') ORDER BY id DESC LIMIT 15`),
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
    res.send(page(req, fnc, { path: activePath }, views.dashboardPage(fnc, { saldos, tareas: t.rows, hechas: d.rows, actividad: a.rows, form })));
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
  return res.redirect('/seguridad?msg=ratelimit_ok');
});

app.get('/seguridad', needLogin, needRole('ADMIN'), async (req, res) => {
  const fnc = req.session.fnc;
  let solis = [];
  try {
    const r = await getPool().query(
      `SELECT actor_email, detalle, created_at AS at FROM audit_log WHERE action = 'clave.solicitar' ORDER BY id DESC LIMIT 20`);
    solis = r.rows;
  } catch { /* sin DB: panel mínimo */ }
  const lis = solis.map((s) => `<li><strong>${views.esc(s.actor_email)}</strong> · ${views.esc(new Date(s.at).toLocaleString('es-CO'))}<br><span>${views.esc(s.detalle || '')}</span></li>`).join('');
  res.send(page(req, fnc, { path: '/seguridad', title: 'Seguridad' }, `<div class="card"><h1>Seguridad</h1><p>Solo <span class="badge">ADMIN</span>. Rate-limit vigente: <strong class="tnum">${rateLimitMax()}/min</strong>${hotMax != null ? ' <span class="badge">override</span>' : ''} (env: ${ENV_MAX}/min).</p>
<form method="post" action="/api/admin/rate-limit" style="margin:12px 0 0"><input type="hidden" name="_csrf" value="${ensureToken(req)}"><label class="fld"><span>Nuevo límite por minuto y por IP</span><input name="perMin" type="number" min="1" max="100000" value="${rateLimitMax()}"></label><button class="btn-primary" type="submit">Aplicar en caliente</button></form>
<p>Volátil: revierte al env al reiniciar. Queda en bitácora.</p></div>
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


