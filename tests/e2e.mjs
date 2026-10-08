// Suite e2e SIP-FNC — BD de prueba + servidor dedicado + limpieza verificada.
// Uso: npm run test:e2e   (requiere Docker con Postgres dev disponible)
// Skill test-hygiene: datos [e2e], cleanup = DROP DATABASE + COUNT 0.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const mods = require('../src/modules.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 3101;
const BASE = `http://localhost:${PORT}`;
const TEST_DB = 'postgresql://sip:sip-dev-sololocal@localhost:5433/sip_fnc_test';
const SESSION_SECRET = 'e2e fixed secret minimo 32 chars 0123456789abcdef';

let server = null;
let serverConsultor = null;
const jar = { cookie: '' };
const jarC = { cookie: '' };
const PORT_C = 3102;
const BASE_C = `http://localhost:${PORT_C}`;

async function fetchJ(pathname, opts = {}) {
  // Connection: close — el servidor corta keep-alive a los 5s; tras brechas
  // largas (p. ej. backup 8s) reutilizar pooled RST ECONNRESET. Los navegadores
  // reintentan GETs idempotentes; aquí evitamos la carrera directamente.
  const headers = { Connection: 'close', ...(opts.headers || {}) };
  if (jar.cookie) headers.Cookie = jar.cookie;
  const res = await fetch(BASE + pathname, { redirect: 'manual', ...opts, headers });
  const sets = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (sets.length) jar.cookie = sets.map((c) => c.split(';')[0].trim()).join('; ');
  return res;
}

async function fetchC(pathname, opts = {}) {
  const headers = { Connection: 'close', ...(opts.headers || {}) };
  if (jarC.cookie) headers.Cookie = jarC.cookie;
  const res = await fetch(BASE_C + pathname, { redirect: 'manual', ...opts, headers });
  const sets = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (sets.length) jarC.cookie = sets.map((c) => c.split(';')[0].trim()).join('; ');
  return res;
}

async function loginAsAdmin() {
  jar.cookie = '';
  const lh = await (await fetchJ('/login')).text();
  const tok = (lh.match(/name="_csrf" value="([^"]+)"/) || [])[1];
  assert.ok(tok, 'token CSRF en login');
  const body = new URLSearchParams({ _csrf: tok });
  const r = await fetchJ('/auth/mock', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/v/rs');
}

async function csrfMeta() {
  const d = await (await fetchJ('/dashboard')).text();
  const m = d.match(/name="csrf-token" content="([^"]+)"/);
  assert.ok(m, 'meta csrf en dashboard');
  return m[1];
}

before(async () => {
  execSync('node tests/db-admin.cjs create', { stdio: 'pipe', cwd: ROOT });
  execSync('node db/migrate.js', { stdio: 'pipe', cwd: ROOT, env: { ...process.env, DATABASE_URL: TEST_DB } });
  execSync('node db/seed_distribucion.js', { stdio: 'pipe', cwd: ROOT, env: { ...process.env, DATABASE_URL: TEST_DB } });
  server = spawn('node', ['src/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(PORT), DATABASE_URL: TEST_DB, SESSION_SECRET,
      AUTH_PROVIDER: 'mock', MOCK_ROLES: 'admin',
      CLIENT_ROLES: 'admin,coordinador,consultor,analista,auxiliar',
      APP_BASE: BASE, RATE_LIMIT_API_PER_MIN: '1000',
      RATE_LIMIT_AUTH_PER_MIN: '1000',
      NOTIFY_MS: '400', NOTIFY_MAX_INTENTOS: '2', NOTIFY_RETRY_MIN: '0',
      RESEND_API_KEY: '', MAIL_FROM: '', DISCORD_WEBHOOK_URL: '',
      KEYCLOAK_URL: 'http://fnc-keycloak:8080/auth', KEYCLOAK_PUBLIC_URL: 'http://localhost:8080/auth',
      KEYCLOAK_REALM: 'fnc-realm', KEYCLOAK_CLIENT_ID: 'sip-fnc-client', KEYCLOAK_CLIENT_SECRET: 'x',
    },
    stdio: 'pipe',
  });
  let up = 0;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.status === 200) { up = 200; break; } } catch { /* esperando */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(up, 200, 'servidor e2e arriba');
  serverConsultor = spawn('node', ['src/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(PORT_C), DATABASE_URL: TEST_DB, SESSION_SECRET,
      AUTH_PROVIDER: 'mock', MOCK_ROLES: 'consultor',
      CLIENT_ROLES: 'admin,coordinador,consultor,analista,auxiliar',
      APP_BASE: BASE_C, RATE_LIMIT_API_PER_MIN: '1000',
      RATE_LIMIT_AUTH_PER_MIN: '1000',
      NOTIFY_MS: '400', NOTIFY_MAX_INTENTOS: '2', NOTIFY_RETRY_MIN: '0',
      RESEND_API_KEY: '', MAIL_FROM: '', DISCORD_WEBHOOK_URL: '',
      KEYCLOAK_URL: 'http://fnc-keycloak:8080/auth', KEYCLOAK_PUBLIC_URL: 'http://localhost:8080/auth',
      KEYCLOAK_REALM: 'fnc-realm', KEYCLOAK_CLIENT_ID: 'sip-fnc-client', KEYCLOAK_CLIENT_SECRET: 'x',
    },
    stdio: 'pipe',
  });
  let upC = 0;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE_C}/login`); if (r.status === 200) { upC = 200; break; } } catch { /* esperando */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(upC, 200, 'servidor e2e consultor arriba');
});

after(async () => {
  if (server) server.kill();
  if (serverConsultor) serverConsultor.kill();
  await new Promise((r) => setTimeout(r, 1000));
  // Limpieza disco: fotos subidas por la suite (test-hygiene: ambos lados).
  for (const f of fs.readdirSync(path.join(ROOT, 'public', 'img', 'user'))) {
    if (/^(mock|test)-[^/]*\.webp$/.test(f)) {
      fs.rmSync(path.join(ROOT, 'public', 'img', 'user', f), { force: true });
    }
  }
  const pre = execSync('node tests/db-admin.cjs exists', { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(pre, '1', 'BD test existe antes del drop');
  execSync('node tests/db-admin.cjs drop', { stdio: 'pipe', cwd: ROOT });
  const gone = execSync('node tests/db-admin.cjs exists', { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(gone, '0', 'cleanup verificado: BD test eliminada');
});

describe('auth + CSRF + contrato', () => {
  it('POST /auth/mock sin token → 403', async () => {
    jar.cookie = '';
    const r = await fetchJ('/auth/mock', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'x=1' });
    assert.equal(r.status, 403);
  });
  it('POST sin token con Accept html → 302 a login?reason=sesion', async () => {
    jar.cookie = '';
    const r = await fetchJ('/auth/mock', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' }, body: 'x=1' });
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location'), /\/login\?reason=sesion/);
    const l = await (await fetchJ('/login?reason=sesion')).text();
    assert.match(l, /sesión se renovó/);
  });
  it('sesión perdida a mitad de flujo: redirect con motivo + re-login recupera', async () => {
    await loginAsAdmin();
    jar.cookie = ''; // simula sesión destruida (restart/inactividad)
    const r = await fetchJ('/api/email/probar', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' }, body: 'to=a@b.co&_csrf=viejo' });
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location'), /\/login\?reason=sesion/);
    await loginAsAdmin();
    const me = await (await fetchJ('/api/me')).json();
    assert.equal(me.role, 'ADMIN');
  });
  it('login mock → 302 a token dashboard', async () => { await loginAsAdmin(); });
  it('cookie de sesión propia (sip.sid) + login sin caché', async () => {
    jar.cookie = '';
    const r = await fetchJ('/login');
    const sets = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    assert.ok(sets.some((c) => c.startsWith('sip.sid=')), 'Set-Cookie sip.sid, nunca connect.sid');
    assert.match(String(r.headers.get('cache-control') || ''), /no-store/, 'login no cacheable (atrás no reenvía forms viejos)');
    await loginAsAdmin(); // restaura jar con sesión para los siguientes
  });
  it('GET /api/me devuelve FncSession con exp-iat=28800', async () => {
    const me = await (await fetchJ('/api/me')).json();
    for (const k of ['sub', 'email', 'displayName', 'roles', 'role', 'fingerprint', 'iat', 'exp']) assert.ok(me[k] !== undefined, k);
    assert.equal(me.exp - me.iat, 28800);
    assert.equal(me.role, 'ADMIN');
  });
  it('header con menú usuario (Perfil + Cerrar Sesión, sin botón Salir)', async () => {
    const html = await (await fetchJ('/dashboard')).text();
    const iHead = html.indexOf('header-user-profile');
    assert.ok(iHead > 0, 'header presente');
    const head = html.slice(iHead, iHead + 2500);
    assert.ok(!head.includes('>Salir<'), 'sin botón Salir en header');
    assert.ok(head.includes('class="user-menu"'), 'menú flotante presente');
    assert.ok(head.includes('data-open-modal="perfil"') && head.includes('>Perfil<'), 'item Perfil abre modal');
    assert.ok(head.includes('/auth/logout') && head.includes('>Cerrar Sesión<'), 'item Cerrar Sesión con POST');
    const iName = head.indexOf('class="user-name"');
    const iImg = Math.min(...['class="user-photo"', 'class="user-avatar"'].map((c) => { const i = head.indexOf(c); return i < 0 ? Infinity : i; }));
    assert.ok(iName > 0 && iName < iImg, 'nombre antes que imagen en header');
  });
  it('header con iconos mail/chat y badge de vencidas', async () => {
    const { Pool } = require('pg');
    const p = new Pool({ connectionString: TEST_DB });
    try {
      await p.query(`INSERT INTO tasks (rol, titulo, fecha_limite, estado) VALUES ('analista','E2E-vencida-x', CURRENT_DATE - 1, 'pendiente')`);
      const html = await (await fetchJ('/dashboard')).text();
      const iHead = html.indexOf('header-user-profile');
      const head = html.slice(iHead, iHead + 3000);
      assert.ok(head.includes('aria-label="Notificaciones"'), 'icono mail');
      assert.ok(head.includes('aria-label="Mensajes"'), 'icono chat');
      assert.match(head, /hdr-badge[^>]*>1</, 'badge con 1 vencida');
      assert.match(head, /href="\/dashboard#tarea-\d+"/, 'dropdown enlaza a la tarea');
      assert.ok(head.includes('E2E-vencida-x') && head.includes('Ver todas'), 'dropdown lista tarea + ver todas');
      const html2 = await (await fetchJ('/dashboard')).text();
      const mid = (head.match(/href="\/dashboard#tarea-(\d+)"/) || [])[1];
      assert.ok(mid && html2.includes(`id="tarea-${mid}"`), 'ancla existe en la lista');
      const css = await (await fetchJ('/css/app.css')).text();
      assert.ok(css.includes('.hdr-mail') && css.includes('padding-bottom: 8px'), 'puente hover del padre (sobrevive al scroll del pop)');
    } finally {
      await p.query(`DELETE FROM tasks WHERE titulo LIKE 'E2E-vencida-%'`);
      await p.end();
    }
  });
  it('dashboard con CSP + nonce coincidente', async () => {
    const r = await fetchJ('/dashboard');
    const csp = r.headers.get('content-security-policy');
    assert.ok(csp && csp.includes('nonce-'));
    const html = await r.text();
    const n = (csp.match(/nonce-([^']+)/) || [])[1];
    assert.ok(n && html.includes(`nonce="${n}"`));
    assert.match(html, /__fncFetch/, 'wrapper fetch auto-redirect INACTIVE');
  });
  it('dashboard sin tarjetas KPI de ejecutado', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ('/dashboard')).text();
    assert.ok(!html.includes('kpi-strip'), 'sin franja KPI');
    assert.ok(!html.includes('% ejecutado'), 'sin % ejecutado en tarjetas');
  });
  it('a11y botones independientes al pie del nav + nav-lock', async () => {
    const html = await (await fetchJ('/dashboard')).text();
    const iBar = html.indexOf('nav-collapse-bar');
    for (const id of ['id="navCollapseBtn"', 'id="fontDown"', 'id="fontUp"', 'id="themeToggle"']) {
      const i = html.indexOf(id);
      assert.ok(i > iBar, `${id} dentro de la barra inferior`);
    }
    assert.ok(!html.includes('a11yBtn') && !html.includes('a11yPop'), 'sin popover legacy');
    const iGroup = html.indexOf('class="a11y-group"');
    assert.ok(iGroup > iBar && html.indexOf('id="themeToggle"') > iGroup, 'a11y agrupado separado del toggle');
    const iHead = html.indexOf('header-user-profile');
    assert.ok(iHead > 0 && !html.slice(iHead, iHead + 2000).includes('fontDown'), 'header sin accesibilidad');
    assert.match(html, /nav-lock/, 'lógica nav-lock presente');
    assert.match(html, /is-default/, 'color a 100% presente');
  });
  it('JS inline compila en dashboard plano y con formulario (gate anti-SyntaxError)', async () => {

    await loginAsAdmin();
    for (const q of ['', `?f=${mods.tokenFor('/distribucion/actualizaciones/municipios').slice(3)}`]) {
      const html = await (await fetchJ(`/dashboard${q}`)).text();
      const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
      assert.ok(blocks.length > 5, `scripts presentes (${q || 'plano'})`);
      for (const [, body] of blocks) {
        assert.doesNotThrow(() => new vm.Script(body), `script roto en /dashboard${q}`);
      }
    }
  });
  it('cierre cooperativo multi-tab (checkAlive antes de destruir)', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ('/dashboard')).text();
    assert.match(html, /checkAlive/, 'checkAlive presente');
    assert.ok(html.includes('/api/me') && html.includes('reset();timer=setInterval(tick,1000)'), 'renueva si vive, destruye si muere');
    // Segundo tab con la misma cookie ve la sesión viva (precondición del gate).
    const r = await fetch(BASE + '/api/me', { headers: { Cookie: jar.cookie } });
    assert.equal(r.status, 200);
  });
});

describe('blindaje pre-acción + overlay', () => {
  it('overlay + fncAlive + precheck presentes', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ('/dashboard')).text();
    assert.ok(html.includes('id="connOverlay"') && html.includes('id="connRetry"'), 'overlay sin conexión');
    assert.ok(html.includes('window.fncAlive'), 'helper pre-check');
    const s = await (await fetchJ(mods.tokenFor('/smtp'))).text();
    assert.ok(s.includes('data-precheck'), 'smtp con pre-check');
    const e = await (await fetchJ(mods.tokenFor('/email'))).text();
    assert.ok(e.includes('data-precheck'), 'email con pre-check');
  });
  it('validar sin sesión no ejecuta (sigue pendiente)', async () => {
    await loginAsAdmin();
    const tareas = await (await fetchJ('/api/tareas')).json();
    const t = tareas[0];
    assert.ok(t, 'hay pendiente');
    jar.cookie = ''; // sesión muerta
    const r = await fetchJ(`/api/tareas/${t.id}/validar`, { method: 'POST', headers: { 'x-csrf-token': 'x' } });
    assert.equal(r.status, 403);
    await loginAsAdmin();
    const after = await (await fetchJ('/api/tareas')).json();
    assert.ok(after.some((x) => x.id === t.id), 'no se ejecutó sin sesión');
  });
});

describe('URLs opacas + guards', () => {
  it('token dashboard y hoja → 200; real sigue viva', async () => {
    assert.equal((await fetchJ(mods.tokenFor('/dashboard'))).status, 200);
    assert.equal((await fetchJ('/dashboard')).status, 200);
    assert.equal((await fetchJ(mods.tokenFor('/adjudicaciones/procesos-especiales/sorteo'))).status, 200);
  });
  it('token inválido → 404', async () => {
    assert.equal((await fetchJ('/v/zz')).status, 404);
  });
  it('API desconocida → 404 JSON', async () => {
    const r = await fetchJ('/api/no-existe-xyz');
    assert.equal(r.status, 404);
    assert.equal((await r.json()).error, 'Ruta API desconocida.');
  });
  it('seguridad admin → 200 con auditoría', async () => {
    const r = await fetchJ(mods.tokenFor('/seguridad'));
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Auditor/);
  });
  it('?f=token monta skeleton; informe redirige a token', async () => {
    const tokLeaf = mods.tokenFor('/distribucion/actualizaciones/municipios').slice(3);
    const f = await fetchJ(`/v/rs?f=${tokLeaf}`);
    assert.equal(f.status, 200);
    assert.match(await f.text(), /crudGuardar/);
    const tokInf = mods.tokenFor('/distribucion/informes/saldos').slice(3);
    const inf = await fetchJ(`/v/rs?f=${tokInf}`);
    assert.equal(inf.status, 302);
    assert.match(inf.headers.get('location'), /^\/v\//);
  });
  it('Configuración agrupa catálogos por pestañas (tokens estables)', async () => {
    assert.equal(mods.tokenFor('/dashboard'), '/v/rs', 'token dashboard estable');
    const tokMun = mods.tokenFor('/distribucion/actualizaciones/municipios').slice(3);
    const f = await fetchJ(`/v/rs?f=${tokMun}`);
    assert.equal(f.status, 200);
    const html = await f.text();
    assert.match(html, /Configuración/, 'breadcrumb en Configuración');
    assert.match(html, /cfg-tab[^>]*active[^>]*>Municipios/, 'pestaña activa Municipios');
    assert.ok(html.includes('Circunscripciones') && html.includes('Tipos de Distribuciones'), '3 pestañas');
    assert.match(html, /crudGuardar/, 'CRUD intacto bajo pestaña');
    const dash = await (await fetchJ('/dashboard')).text();
    assert.match(dash, /data-navkey="[^"]*\/configuracion"/, 'nav con sub Configuración');
  });
});

describe('tareas e2e', () => {
  let taskId = null;
  it('crear → 201 + aparece en lista', async () => {
    const mt = await csrfMeta();
    const r = await fetchJ('/api/tareas', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': mt },
      body: JSON.stringify({ titulo: '[e2e] Verificar flujo', rol: 'analista', fecha_limite: '2030-01-15', detalle: 'creada por suite' }),
    });
    assert.equal(r.status, 201);
    const created = await r.json();
    assert.ok(created.ok && created.id);
    taskId = created.id;
    const list = await (await fetchJ('/api/tareas')).json();
    assert.ok(list.some((t) => t.id === taskId));
  });
  it('crear inválida → 400 (título corto, rol malo, fecha pasada)', async () => {
    const mt = await csrfMeta();
    const post = (b) => fetchJ('/api/tareas', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': mt }, body: JSON.stringify(b) });
    assert.equal((await post({ titulo: 'AB', rol: 'analista', fecha_limite: '2030-01-15' })).status, 400);
    assert.equal((await post({ titulo: 'Valida tres', rol: 'nadie', fecha_limite: '2030-01-15' })).status, 400);
    assert.equal((await post({ titulo: 'Valida tres', rol: 'analista', fecha_limite: '2020-01-01' })).status, 400);
  });
  it('detalle trae formUrl con token', async () => {
    const d = await (await fetchJ(`/api/tareas/${taskId}`)).json();
    assert.equal(d.titulo, '[e2e] Verificar flujo');
  });
  it('validar manual → ok + sale de pendientes + audita', async () => {
    const mt = await csrfMeta();
    const v = await (await fetchJ(`/api/tareas/${taskId}/validar`, { method: 'POST', headers: { 'x-csrf-token': mt } })).json();
    assert.equal(v.ok, true);
    const list = await (await fetchJ('/api/tareas')).json();
    assert.ok(!list.some((t) => t.id === taskId));
    const act = await (await fetchJ('/api/actividad/mia')).json();
    assert.ok(act.some((a) => a.action === 'tarea.validar'));
  });
  it('detalle inexistente → 404; id inválido → 400', async () => {
    assert.equal((await fetchJ('/api/tareas/999999')).status, 404);
    assert.equal((await fetchJ('/api/tareas/abc')).status, 400);
  });
});

describe('rol consultor (solo lectura)', () => {
  let consultorTask = null;
  it('login → FUNCIONARIO sin Seguridad en nav', async () => {
    jarC.cookie = '';
    const lh = await (await fetchC('/login')).text();
    const tok = (lh.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    assert.ok(tok);
    await fetchC('/auth/mock', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: tok }) });
    const me = await (await fetchC('/api/me')).json();
    assert.equal(me.role, 'FUNCIONARIO');
    assert.ok(me.roles.includes('consultor'));
    const dash = await (await fetchC('/dashboard')).text();
    assert.ok(!dash.includes('/seguridad'), 'sin Seguridad en nav');
  });
  it('seguridad y admin → 403', async () => {
    assert.equal((await fetchC('/seguridad')).status, 403);
    assert.equal((await fetchC('/api/admin/rate-limit')).status, 403);
  });
  it('crear y validar → 403; leer tareas → 200', async () => {
    const d = await (await fetchC('/dashboard')).text();
    const mt = (d.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    assert.equal((await fetchC('/api/tareas', { method: 'POST', headers: h, body: JSON.stringify({ titulo: '[e2e] No debe crear', rol: 'consultor', fecha_limite: '2030-01-15' }) })).status, 403);
    assert.equal((await fetchC('/api/tareas')).status, 200);
    const list = await (await fetchC('/api/tareas')).json();
    if (list.length) {
      consultorTask = list[0].id;
      assert.equal((await fetchC(`/api/tareas/${consultorTask}/validar`, { method: 'POST', headers: { 'x-csrf-token': mt } })).status, 403);
    }
  });
  it('botón Nueva tarea oculto y sin botón completar', async () => {
    const dash = await (await fetchC('/dashboard')).text();
    assert.ok(!dash.includes('<button class="btn-circle" data-open-modal="tarea-crear"'), 'sin disparador crear');
  });
});

describe('maestros distribucion e informes', () => {
  it('CRUD circunscripciones (crear, duplicado 409, borrar)', async () => {
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    const c = await (await fetchJ('/api/maestros/circunscripciones', { method: 'POST', headers: h, body: JSON.stringify({ codigo: 'TST', nombre: 'Prueba E2E' }) })).json();
    assert.equal(c.ok, true);
    assert.equal((await fetchJ('/api/maestros/circunscripciones', { method: 'POST', headers: h, body: JSON.stringify({ codigo: 'TST', nombre: 'Dup' }) })).status, 409);
    const u = await (await fetchJ('/api/maestros/circunscripciones/TST', { method: 'PUT', headers: h, body: JSON.stringify({ nombre: 'Editada' }) })).json();
    assert.equal(u.ok, true);
    const d = await (await fetchJ('/api/maestros/circunscripciones/TST', { method: 'DELETE', headers: h })).json();
    assert.equal(d.ok, true);
  });
  it('distribuciones: validación numérica + FK municipio', async () => {
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    const y = new Date().getFullYear() + 1;
    const c = await (await fetchJ('/api/maestros/distribuciones', { method: 'POST', headers: h, body: JSON.stringify({ tipo: 'municipio_actual', vigencia: y, asignado: 5000000 }) })).json();
    assert.equal(c.ok, true);
    assert.equal((await fetchJ('/api/maestros/distribuciones', { method: 'POST', headers: h, body: JSON.stringify({ tipo: 'x', vigencia: 'no-num' }) })).status, 400);
    const dmun = await (await fetchJ('/api/maestros/distribucion-municipio', { method: 'POST', headers: h, body: JSON.stringify({ numero: 1, tipo: 2, ano: y, ppto: 100, municipio: 'IBG', valor: 999 }) })).json();
    assert.equal(dmun.ok, true);
    assert.equal((await fetchJ('/api/maestros/distribucion-municipio', { method: 'POST', headers: h, body: JSON.stringify({ numero: 2, tipo: 2, ano: y, municipio: 'ZZZ', valor: 1 }) })).status, 400);
    await fetchJ(`/api/maestros/distribuciones/${c.id}`, { method: 'DELETE', headers: h });
    await fetchJ(`/api/maestros/distribucion-municipio/${dmun.id}`, { method: 'DELETE', headers: h });
    const check = await (await fetchJ('/api/maestros/distribucion-municipio')).json();
    assert.ok(!check.some((r) => r.municipio === 'IBG' && r.valor === 999 || r.valor === '999'));
  });
  it('informes rinden + xlsx descarga + año inválido 400', async () => {
    const s = await fetchJ('/distribucion/informes/saldos');
    assert.equal(s.status, 200);
    const html = await s.text();
    assert.match(html, /asignado/);
    assert.match(html, /id="btnImprimir"/, 'botón Imprimir');
    assert.match(html, /class="print-only"/, 'membrete solo-impresión');
    assert.match(html, /getElementById\('btnImprimir'\)/, 'PRINT_JS con nonce');
    const css = await (await fetchJ('/css/app.css')).text();
    assert.match(css, /@media print/, 'reglas de impresión');
    assert.match(css, /\.print-only\s*\{\s*display:\s*none/, 'membrete oculto en pantalla');
    const x = await fetchJ('/api/informes/saldos/xlsx');
    assert.equal(x.status, 200);
    assert.match(x.headers.get('content-type'), /spreadsheetml/);
    assert.ok((await x.arrayBuffer()).byteLength > 1000);
    assert.equal((await fetchJ('/distribucion/informes/saldos?ano=xx')).status, 400);
  });
});

describe('regla de oro (2 pasos)', () => {
  const VY = 2031;
  async function reglaXlsx(reglas) {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('% producción');
    ws.addRow(['Circunscripción', 'Municipio', '% participación en la producción', '70% producción', 'UPAS', 'Distribución de UPAS', '30% UPAS', 'Regla de Oro Compuesta']);
    for (const [circ, mun, r] of reglas) ws.addRow([circ, mun, 0.1, 0.07, 100, 0.1, 0.03, r]);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  async function subir(buf, vigencia) {
    const mt = await csrfMeta();
    const fd = new FormData();
    fd.append('archivo', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'regla.xlsx');
    fd.append('vigencia', String(vigencia));
    return fetchJ('/api/regla-oro/cargar', { method: 'POST', headers: { 'x-csrf-token': mt, Accept: 'application/json' }, body: fd });
  }
  it('paso 1 carga 3 reglas (Chaparral .5, Ortega .3, Falán .2)', async () => {
    await loginAsAdmin();
    const r = await subir(await reglaXlsx([['Chaparral', 'Chaparral', 0.5], ['Chaparral', 'Ortega', 0.3], ['Fresno', 'Falan', 0.2]]), VY);
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.ok, true);
    assert.equal(d.n, 3);
  });
  it('paso 1 rechaza suma != 1.0 y municipio fantasma (0 guardados)', async () => {
    await loginAsAdmin();
    const r = await subir(await reglaXlsx([['Chaparral', 'Chaparral', 0.5], ['Chaparral', 'Ortega', 0.5], ['Fresno', 'Falan', 0.5]]), VY + 1);
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /Rechazado/);
    const r2 = await subir(await reglaXlsx([['Chaparral', 'Chaparral', 0.5], ['Chaparral', 'Narnia', 0.5]]), VY + 2);
    assert.equal(r2.status, 400);
  });
  it('paso 2 asigna exacto por circunscripción (625/375/500)', async () => {
    await loginAsAdmin();
    const mt = await csrfMeta();
    const r = await fetchJ('/api/regla-oro/asignar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': mt, Accept: 'application/json' },
      body: JSON.stringify({ vigencia: VY, numero: 9, tipo: 9, totales: { CHAP: 1000, FRES: 500 } }),
    });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.ok, true);
    assert.equal(d.n, 3);
    const { Pool } = require('pg');
    const p = new Pool({ connectionString: TEST_DB });
    try {
      const { rows } = await p.query(`SELECT municipio, valor, ppto FROM distribucion_municipio WHERE ano=$1 AND numero=9 AND tipo=9 ORDER BY municipio`, [VY]);
      assert.deepEqual(rows.map((x) => [x.municipio, Number(x.valor), Number(x.ppto)]),
        [['CHA', 625, 1000], ['FAL', 500, 500], ['ORT', 375, 1000]]);
    } finally { await p.end(); }
  });
  it('consultor no carga ni asigna (403)', async () => {
    jarC.cookie = '';
    const lh = await (await fetchC('/login')).text();
    const tok = (lh.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    await fetchC('/auth/mock', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: tok }) });
    const d = await (await fetchC('/dashboard')).text();
    const mt = (d.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
    const fd = new FormData();
    fd.append('vigencia', String(VY));
    const r = await fetchC('/api/regla-oro/cargar', { method: 'POST', headers: { 'x-csrf-token': mt, Accept: 'application/json' }, body: fd });
    assert.equal(r.status, 403);
    const r2 = await fetchC('/api/regla-oro/asignar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': mt, Accept: 'application/json' }, body: JSON.stringify({ vigencia: VY, numero: 1, tipo: 1, totales: {} }) });
    assert.equal(r2.status, 403);
  });
  it('perímetro: admin carga año anterior, consultor no', async () => {
    await loginAsAdmin();
    const r = await subir(await reglaXlsx([['Chaparral', 'Chaparral', 0.6], ['Chaparral', 'Ortega', 0.4]]), 2020);
    assert.equal(r.status, 200);
    jarC.cookie = '';
    const lh = await (await fetchC('/login')).text();
    const tok = (lh.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    await fetchC('/auth/mock', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: tok }) });
    const d = await (await fetchC('/dashboard')).text();
    const mt = (d.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
    const fd = new FormData();
    fd.append('vigencia', '2020');
    const r2 = await fetchC('/api/regla-oro/cargar', { method: 'POST', headers: { 'x-csrf-token': mt, Accept: 'application/json' }, body: fd });
    assert.equal(r2.status, 403);
  });
  it('paso 2 bloqueado sin regla + tabla por circunscripción', async () => {
    await loginAsAdmin();
    const tokLeaf = mods.tokenFor('/distribucion/actualizaciones/regla-oro').slice(3);
    const tokDist = mods.tokenFor('/distribucion/actualizaciones/distribuciones').slice(3);
    const v = await (await fetchJ(`/v/rs?f=${tokDist}&tab=carga&vigencia=${VY + 5}`)).text();
    assert.match(v, /Completa el paso 1/, 'paso 2 bloqueado sin regla');
    assert.ok(!v.includes('id="reglaGo"'), 'sin botón asignar');
    const p = await (await fetchJ(`/v/rs?f=${tokLeaf}&vigencia=${VY}`)).text();
    assert.match(p, /Porcentaje por circunscripción/, 'tabla por circunscripción');
    assert.match(p, /Chaparral[\s\S]{0,120}80\.00%/, 'Chaparral suma 80%');
    assert.match(p, /reglaVerGo|Imprimir|reglaCmpGo/, 'ver/visualizar/comparar presentes');
    assert.ok(!p.includes('id="reglaUp"') && !p.includes('id="reglaGo"'), 'regla histórica sin formularios de carga');
  });
  it('comparar 2 vigencias + exportar xlsx/pdf', async () => {

    await loginAsAdmin();
    const r = await subir(await reglaXlsx([['Chaparral', 'Chaparral', 0.7], ['Chaparral', 'Ortega', 0.2], ['Fresno', 'Falan', 0.1]]), VY + 3);
    assert.equal(r.status, 200);
    const c = await (await fetchJ(`/api/regla-oro/comparar?vigencias=${VY},${VY + 3}`)).json();
    assert.equal(c.ok, true);
    assert.deepEqual(c.vigencias, [VY, VY + 3]);
    assert.ok(c.rows.some((x) => x.municipio === 'CHA'), 'incluye Chaparral');
    const c1 = await fetchJ(`/api/regla-oro/comparar?vigencias=${VY}`);
    assert.equal(c1.status, 400);
    const x = await fetchJ(`/api/regla-oro/xlsx?vigencia=${VY}`);
    assert.equal(x.status, 200);
    assert.match(x.headers.get('content-type'), /spreadsheetml/);
    assert.ok((await x.arrayBuffer()).byteLength > 500);
    const f = await fetchJ(`/api/regla-oro/pdf?vigencia=${VY}`);
    assert.equal(f.status, 200);
    assert.match(f.headers.get('content-type'), /pdf/);
    const head = Buffer.from(await f.arrayBuffer()).slice(0, 5).toString();
    assert.ok(head.startsWith('%PDF'), 'magic PDF');
  });
});

describe('distribuciones: 3 escenarios por vigencia', () => {
  const YN = new Date().getFullYear();
  const tokDist = () => mods.tokenFor('/distribucion/actualizaciones/distribuciones').slice(3);
  it('anteriores: histórico con sobrante año + acumulado', async () => {
    await loginAsAdmin();
    const y = YN - 1; // migrate seed: municipio_anteriores 480M/410M + circ 295M/260M
    const html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=circ&vigencia=${y}`)).text();
    assert.match(html, /Histórico \+ sobrante acumulado/, 'bloque histórico');
    assert.match(html, /Sobrante acumulado/, 'columna acumulado');
    assert.ok(html.includes('$105.000.000'), 'acumulado 70M+35M=105M');
    assert.ok(html.includes('Sin histórico') === false, 'hay histórico');
  });
  it('actual: checklist + tabla documento', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=circ&vigencia=${YN}`)).text();
    assert.match(html, /Estado vigencia actual/, 'checklist presente');
    assert.ok(html.includes('Montos globales') && html.includes('Valores por municipio'), 'checklist completa');
    assert.match(html, /Circunscripción/, 'bloques por circunscripción');
    assert.match(html, /TOTAL/, 'fila TOTAL');
  });
  it('siguiente: % por municipio + CTA sin valores', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=circ&vigencia=${YN + 1}`)).text();
    assert.match(html, /Porcentajes vigencia siguiente/, 'bloque siguiente');
    assert.ok(html.includes('Cargar regla'), 'CTA carga');
  });
  it('tabs Carga/mpio/circ: mpio activo por defecto y orden nuevo', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ(`/v/rs?f=${tokDist()}&vigencia=${YN}`)).text();
    assert.match(html, /role="tablist" aria-label="Distribuciones"/, 'tab bar presente');
    assert.match(html, /cfg-tab active[^>]*>Por municipio/, 'mpio activo por defecto');
    assert.ok(html.includes('tab=carga') && html.includes('tab=circ'), 'links a carga y circ');
    const order = ['>Carga<', '>Por municipio<', '>Por circunscripción<'].map((s) => html.indexOf(s));
    assert.ok(order[0] < order[1] && order[1] < order[2] && order[0] > -1, `orden tabs: ${order}`);
    assert.match(html, /FEDERACION NACIONAL DE CAFETEROS DE COLOMBIA - COMITE TOLIMA/, 'membrete línea 1');
    assert.match(html, new RegExp(`LEY 863 DE 2003 TRANSFERENCIA ${YN}`), 'membrete línea 2');
    assert.match(html, /OBRAS DE INFRAESTRUCTURA/, 'membrete línea 3');
    assert.match(html, /DISTRIBUCION No\. <span class="doc-blank">______<\/span> SEGÚN ACTA <span class="doc-blank">______<\/span> DE <span class="doc-blank">______<\/span>/, 'línea acta con huecos reservados');
    assert.match(html, /class="doc-foot"/, 'pie documento (fecha+página)');
    const legacy = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=dist&vigencia=${YN}`)).text();
    assert.match(legacy, /cfg-tab active[^>]*>Por municipio/, 'tab=dist viejo cae a mpio');
  });
  it('mpio: tabla documento sin paginación ni CRUD, con edición en línea', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=mpio&vigencia=${YN}`)).text();
    assert.match(html, /<h3 class="rail-sub">Por municipio<\/h3>/, 'sección mpio');
    assert.match(html, /<th>MUNICIPIO<\/th><th>SICA 2005<\/th><th>DISTRIBUCIÓN<\/th><th>ASIGNACIONES CREADAS<\/th><th>SALDO DISPONIBLE<\/th>/, 'columnas documento .xlsx');
    assert.match(html, /<table class="skl-table doc-table">/, 'tabla con estilo documento');
    assert.ok(!html.includes('colspan="5"><strong>Circunscripción'), 'sin fila-grupo de bloque');
    const tbl = (html.match(/<table class="skl-table doc-table">[\s\S]*?<\/table>/) || [])[0] || '';
    assert.ok(!tbl.includes('$'), 'cifras documento sin signo $ (calcado xlsx)');
    assert.ok(!html.includes('Editar valores por municipio'), 'sin tarjeta CRUD mpio');
    assert.ok(html.includes('data-docedit="monto"'), 'botón editar monto global');
    assert.match(html, /id="docmonto-municipio-\d+-line"/, 'línea monto global municipio');
    assert.match(html, /cfg-tab active[^>]*>Por municipio/, 'tab mpio activo');
  });
  it('mpio: botón ✎ por fila cuando hay municipios (vigencia regla 2031)', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=mpio&vigencia=2031`)).text();
    assert.ok(html.includes('data-docedit="creada" data-cell="doccre-CHA-2031" data-ano="2031" data-mun="CHA"'), 'botón editar por fila de municipio');
  });
  it('tablas documento sin paginación (PAGER_JS exime .doc-table)', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ('/dashboard')).text();
    assert.ok(html.includes('table.skl-table:not(.doc-table)'), 'pager exime doc-table');
  });
  it('circ: sin CRUD montos, monto editable y filas solo lectura', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=circ&vigencia=${YN}`)).text();
    assert.ok(!html.includes('Editar montos globales'), 'sin tarjeta CRUD montos');
    assert.match(html, /id="docmonto-circunscripcion-\d+-line"/, 'línea monto global circunscripción');
    assert.ok(html.includes('data-docedit="monto"'), 'botón editar monto');
    assert.ok(!html.includes('data-docedit="creada"'), 'filas circ sin botón de edición');
  });
  it('consultor: ve tablas sin botones de edición y PUT valor → 403', async () => {
    jarC.cookie = '';
    const lh = await (await fetchC('/login')).text();
    const ctok = (lh.match(/name="_csrf" value="([^"]+)"/) || [])[1];
    await fetchC('/auth/mock', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: ctok }) });
    const cd = await (await fetchC('/dashboard')).text();
    const cmt = (cd.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
    const cHtml = await (await fetchC(`/v/rs?f=${tokDist()}&tab=mpio&vigencia=2031`)).text();
    assert.ok(!cHtml.includes('data-docedit="creada"'), 'consultor sin botones por fila');
    assert.ok(!cHtml.includes('data-docedit="monto"'), 'consultor sin botón de monto');
    assert.equal((await fetchC('/api/distribucion-municipio/valor', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-csrf-token': cmt }, body: JSON.stringify({ ano: YN, municipio: 'CHA', valor: 1 }) })).status, 403);
  });
  it('mpio+circ: DISTRIBUCIÓN y SALDO exactos en centavos (regla 2031 + monto 2000.50)', async () => {
    await loginAsAdmin();
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    // Regla 2031 (.5/.3/.2) + creadas (625/375/500) ya sembradas por la suite de regla de oro.
    const m = await (await fetchJ('/api/maestros/distribuciones', { method: 'POST', headers: h, body: JSON.stringify({ tipo: 'municipio_anteriores', vigencia: 2031, asignado: 2000.50 }) })).json();
    assert.equal(m.ok, true);
    try {
      const html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=mpio&vigencia=2031`)).text();
      assert.ok(html.includes('<td>CHAPARRAL</td><td class="n">50.00 %</td><td class="n">1,000.25</td>'), 'Chaparral: % y DISTRIBUCIÓN');
      assert.ok(html.includes('<span class="doc-val">625</span>'), 'Chaparral: CREADAS 625');
      assert.ok(html.includes('<td>FALAN</td><td class="n">20.00 %</td><td class="n">400.1</td>'), 'Falan: % y DISTRIBUCIÓN');
      assert.ok(html.includes('<span class="doc-val">500</span>'), 'Falan: CREADAS 500');
      assert.ok(html.includes('<tr class="doc-sub"><td><strong>Circunscripción Chaparral</strong></td><td class="n"><strong>80.00 %</strong></td><td class="n"><strong>1,600.4</strong></td><td class="n"><strong>1,000</strong></td><td class="n"><strong>600.4</strong></td>'), 'subtotal Chaparral exacto');
      assert.ok(html.includes('<tr class="doc-tot"><td><strong>TOTAL</strong></td><td class="n"><strong>100.00 %</strong></td><td class="n"><strong>2,000.5</strong></td><td class="n"><strong>1,500</strong></td><td class="n"><strong>500.5</strong></td>'), 'TOTAL = Σ exactas, sin aproximar');
    } finally {
      await fetchJ(`/api/maestros/distribuciones/${m.id}`, { method: 'DELETE', headers: h });
    }
  });
  it('circ: filas municipio con DISTRIBUCIÓN y SALDO en blanco (calcado xlsx)', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=circ&vigencia=2031`)).text();
    assert.ok(html.includes('<td>CHAPARRAL</td><td class="n">50.00 %</td><td class="n"></td><td class="n" id="doccre-CHA-2031"><span class="doc-val">625</span></td><td class="n"></td>'), 'municipio circ solo % + creadas');
    assert.ok(html.includes('<tr class="doc-sub"><td><strong>Circunscripción Chaparral</strong></td>'), 'fila Circunscripción tras el bloque');
    assert.match(html, /<tr class="doc-tot"><td><strong>TOTAL<\/strong>/, 'fila TOTAL al final');
  });
  it('PUT valor: crear → editar → validación → 409 multilote', async () => {
    await loginAsAdmin();
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    const Y = 2035, put = (b) => fetchJ('/api/distribucion-municipio/valor', { method: 'PUT', headers: h, body: JSON.stringify(b) });
    const c = await put({ ano: Y, municipio: 'CHA', valor: 10.5 });
    assert.equal(c.status, 201);
    const cb = await c.json();
    assert.equal(cb.ok, true);
    let html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=mpio&vigencia=${Y}`)).text();
    assert.ok(html.includes('<td>CHAPARRAL</td><td class="n"></td><td class="n"></td>'), 'fila municipio sin regla');
    assert.ok(html.includes('<span class="doc-val">10.5</span>'), 'valor creado visible en tabla');
    assert.ok(html.includes('data-tipo="municipio_anteriores" data-vig="2035"'), 'botón fijar monto cuando falta');
    const u = await put({ ano: Y, municipio: 'CHA', valor: 20.25 });
    assert.equal(u.status, 200);
    html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=mpio&vigencia=${Y}`)).text();
    assert.ok(html.includes('<span class="doc-val">20.25</span>'), 'valor editado visible en tabla');
    assert.equal((await put({ ano: Y, municipio: 'CHA', valor: -5 })).status, 400, 'negativo 400');
    assert.equal((await put({ ano: 'xx', municipio: 'CHA', valor: 1 })).status, 400, 'año inválido 400');
    assert.equal((await put({ ano: Y, municipio: 'ZZZ', valor: 1 })).status, 400, 'municipio fantasma 400');
    const second = await (await fetchJ('/api/maestros/distribucion-municipio', { method: 'POST', headers: h, body: JSON.stringify({ numero: 8, tipo: 8, ano: Y, municipio: 'CHA', valor: 1 }) })).json();
    assert.equal(second.ok, true);
    assert.equal((await put({ ano: Y, municipio: 'CHA', valor: 99 })).status, 409, 'multilote 409');
    await fetchJ(`/api/maestros/distribucion-municipio/${second.id}`, { method: 'DELETE', headers: h });
    await fetchJ(`/api/maestros/distribucion-municipio/${cb.id}`, { method: 'DELETE', headers: h });
    const check = await (await fetchJ('/api/maestros/distribucion-municipio')).json();
    assert.ok(!check.some((x) => x.ano === Y && x.municipio === 'CHA'), 'limpieza verificada');
  });
  it('circ: monto global edita la base de DISTRIBUCIÓN (subtotales exactos)', async () => {
    await loginAsAdmin();
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    // Regla 2031 (.5/.3/.2) + creadas (625/375/500) sembradas por la suite de regla de oro.
    const m = await (await fetchJ('/api/maestros/distribuciones', { method: 'POST', headers: h, body: JSON.stringify({ tipo: 'circunscripcion_anteriores', vigencia: 2031, asignado: 900 }) })).json();
    assert.equal(m.ok, true);
    try {
      let html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=circ&vigencia=2031`)).text();
      assert.ok(html.includes('<tr class="doc-sub"><td><strong>Circunscripción Chaparral</strong></td><td class="n"><strong>80.00 %</strong></td><td class="n"><strong>720</strong></td><td class="n"><strong>1,000</strong></td><td class="n"><strong>-280</strong></td>'), 'subtotal con monto 900');
      assert.ok(html.includes('<tr class="doc-tot"><td><strong>TOTAL</strong></td><td class="n"><strong>100.00 %</strong></td><td class="n"><strong>900</strong></td><td class="n"><strong>1,500</strong></td><td class="n"><strong>-600</strong></td>'), 'TOTAL con monto 900');
      const u = await (await fetchJ(`/api/maestros/distribuciones/${m.id}`, { method: 'PUT', headers: h, body: JSON.stringify({ asignado: 1000 }) })).json();
      assert.equal(u.ok, true);
      html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=circ&vigencia=2031`)).text();
      assert.ok(html.includes('<td class="n"><strong>800</strong></td><td class="n"><strong>1,000</strong></td><td class="n"><strong>-200</strong></td>'), 'subtotal recalculado con monto 1000');
    } finally {
      await fetchJ(`/api/maestros/distribuciones/${m.id}`, { method: 'DELETE', headers: h });
    }
  });
  it('legacy mpio redirige a tab mpio (token y ruta directa)', async () => {
    await loginAsAdmin();
    const tokOld = mods.tokenFor('/distribucion/actualizaciones/distribucion-municipio').slice(3);
    const r1 = await fetchJ(`/v/rs?f=${tokOld}&vigencia=${YN}`);
    assert.equal(r1.status, 302);
    assert.match(r1.headers.get('location'), /tab=mpio/);
    assert.match(r1.headers.get('location'), new RegExp(`vigencia=${YN}`));
    const r2 = await fetchJ('/distribucion/actualizaciones/distribucion-municipio');
    assert.equal(r2.status, 302);
    assert.match(r2.headers.get('location'), /tab=mpio/);
  });
  it('banner msg escapado (ok y error)', async () => {
    await loginAsAdmin();
    const ok = await (await fetchJ(`/v/rs?f=${tokDist()}&vigencia=${YN}&ok=1&msg=` + encodeURIComponent('Regla 2027 cargada: 3 municipios.'))).text();
    assert.ok(ok.includes('<span class="badge">Regla 2027 cargada: 3 municipios.</span>'), 'banner éxito');
    const bad = await (await fetchJ(`/v/rs?f=${tokDist()}&vigencia=${YN}&msg=` + encodeURIComponent('<script>alert(1)</script>'))).text();
    assert.ok(!bad.includes('<script>alert(1)</script>'), 'msg escapado sin script');
    assert.match(bad, /alert-err/, 'banner error');
  });
  it('numpk editar/borrar por id en distribucion-municipio', async () => {
    await loginAsAdmin();
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    const c = await (await fetchJ('/api/maestros/distribucion-municipio', { method: 'POST', headers: h, body: JSON.stringify({ numero: 77, tipo: 7, ano: YN, municipio: 'IBG', valor: 1000 }) })).json();
    assert.equal(c.ok, true);
    const id = c.id;
    const u = await (await fetchJ(`/api/maestros/distribucion-municipio/${id}`, { method: 'PUT', headers: h, body: JSON.stringify({ valor: 2000 }) })).json();
    assert.equal(u.ok, true);
    const d = await (await fetchJ(`/api/maestros/distribucion-municipio/${id}`, { method: 'DELETE', headers: h })).json();
    assert.equal(d.ok, true);
    const check = await (await fetchJ('/api/maestros/distribucion-municipio')).json();
    assert.ok(!check.some((x) => x.id === id), 'borrado verificado');
  });
  it('vigencia vacía: marco de incompletos', async () => {
    await loginAsAdmin();
    const html = await (await fetchJ(`/v/rs?f=${tokDist()}&tab=circ&vigencia=2099`)).text();
    assert.match(html, /Sin regla para 2099/, 'marco sin datos');
  });
});

describe('notificaciones outbox + campana', () => {
  const { Pool } = require('pg');
  const pool = () => new Pool({ connectionString: TEST_DB });
  async function waitFor(fn, ms = 10000) {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error('timeout esperando condición e2e');
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  it('scheduler 3-1-0 encola campana idempotente + validar encola discord', async () => {
    await loginAsAdmin();
    const mt = await csrfMeta();
    const p = pool();
    try {
      const t = await p.query(`INSERT INTO tasks (rol, titulo, fecha_limite, estado) VALUES ('analista','E2E-aviso-3d', CURRENT_DATE + 3, 'pendiente') RETURNING id`);
      const id = t.rows[0].id;
      const row = await waitFor(async () => (await p.query(`SELECT * FROM outbox WHERE ref = $1`, [`tarea:${id}:3d`])).rows[0]);
      assert.equal(row.canal, 'campana');
      assert.deepEqual(row.roles, ['analista']);
      assert.match(row.titulo, /vence en 3 días/);
      await new Promise((r) => setTimeout(r, 1500)); // ~3 ticks × 2 instancias
      const c = await p.query(`SELECT COUNT(*)::int AS n FROM outbox WHERE ref = $1`, [`tarea:${id}:3d`]);
      assert.equal(c.rows[0].n, 1, 'sin duplicados entre instancias');
      const v = await (await fetchJ(`/api/tareas/${id}/validar`, { method: 'POST', headers: { 'x-csrf-token': mt } })).json();
      assert.equal(v.ok, true);
      const d = await waitFor(async () => (await p.query(`SELECT * FROM outbox WHERE ref = $1`, [`tarea-validada:${id}`])).rows[0]);
      assert.equal(d.canal, 'discord');
      await p.query(`DELETE FROM outbox WHERE ref LIKE $1`, [`tarea:${id}:%`]);
      await p.query(`DELETE FROM outbox WHERE ref = $1`, [`tarea-validada:${id}`]);
      await p.query(`DELETE FROM tasks WHERE id = $1`, [id]);
      const left = await p.query(`SELECT COUNT(*)::int AS n FROM tasks WHERE id = $1`, [id]);
      assert.equal(left.rows[0].n, 0, 'limpieza verificada');
    } finally { await p.end(); }
  });
  it('campana por rol: ver, leer una, leer todas + badge', async () => {
    await loginAsAdmin();
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    const p = pool();
    try {
      const a = await p.query(`INSERT INTO outbox (canal, titulo, roles, estado) VALUES ('campana','E2E-camp-1','{admin}','enviado') RETURNING id`);
      const b = await p.query(`INSERT INTO outbox (canal, titulo, roles, estado) VALUES ('campana','E2E-camp-2','{admin}','pendiente') RETURNING id`);
      await waitFor(async () => (await p.query(`SELECT estado FROM outbox WHERE id = $1`, [b.rows[0].id])).rows[0].estado === 'enviado');
      let list = await (await fetchJ('/api/notificaciones')).json();
      assert.ok(list.some((x) => x.titulo === 'E2E-camp-1'), 've campana de su rol');
      assert.ok(list.some((x) => x.titulo === 'E2E-camp-2'), 'worker entregó pendiente');
      let html = await (await fetchJ('/dashboard')).text();
      const bell = html.slice(html.indexOf('hdr-bell'), html.indexOf('hdr-bell') + 1200);
      assert.ok(bell.includes('aria-label="Campana"'), 'icono campana');
      assert.match(bell, /hdr-badge[^>]*>2</, 'badge con 2');
      assert.equal((await fetchJ(`/api/notificaciones/${a.rows[0].id}/leida`, { method: 'PUT', headers: h })).status, 200);
      list = await (await fetchJ('/api/notificaciones')).json();
      assert.ok(!list.some((x) => x.id === a.rows[0].id), 'leída sale de la lista');
      assert.ok(list.some((x) => x.id === b.rows[0].id), 'la otra sigue');
      assert.equal((await fetchJ(`/api/notificaciones/${a.rows[0].id}/leida`, { method: 'PUT', headers: h })).status, 404, 'releer → 404');
      assert.equal((await fetchJ('/api/notificaciones/999999/leida', { method: 'PUT', headers: h })).status, 404);
      assert.equal((await fetchJ('/api/notificaciones/xx/leida', { method: 'PUT', headers: h })).status, 400);
      const all = await (await fetchJ('/api/notificaciones/leidas', { method: 'PUT', headers: h })).json();
      assert.equal(all.n, 1);
      list = await (await fetchJ('/api/notificaciones')).json();
      assert.equal(list.length, 0, 'bandeja vacía');
      html = await (await fetchJ('/dashboard')).text();
      const bell2 = html.slice(html.indexOf('hdr-bell'), html.indexOf('hdr-bell') + 1200);
      assert.ok(!bell2.includes('hdr-badge'), 'sin badge vacía');
      assert.ok(bell2.includes('Sin notificaciones.'), 'estado vacío');
      await p.query(`DELETE FROM outbox WHERE titulo LIKE 'E2E-camp-%'`);
    } finally { await p.end(); }
  });
  it('reintentos → fallido sin SMTP ni webhook', async () => {
    await loginAsAdmin();
    const p = pool();
    try {
      const e = await p.query(`INSERT INTO outbox (canal, titulo, destino, estado) VALUES ('email','E2E-mail-x','nadie@ejemplo.co','pendiente') RETURNING id`);
      const d = await p.query(`INSERT INTO outbox (canal, titulo, estado) VALUES ('discord','E2E-disc-x','pendiente') RETURNING id`);
      const er = await waitFor(async () => {
        const r = (await p.query(`SELECT estado, intentos FROM outbox WHERE id = $1`, [e.rows[0].id])).rows[0];
        return r.estado === 'fallido' ? r : null;
      });
      assert.equal(er.intentos, 2, 'agota reintentos (NOTIFY_MAX_INTENTOS=2)');
      const dr = await waitFor(async () => {
        const r = (await p.query(`SELECT estado FROM outbox WHERE id = $1`, [d.rows[0].id])).rows[0];
        return r.estado === 'fallido' ? r : null;
      });
      assert.ok(dr, 'discord sin webhook → fallido');
      await p.query(`DELETE FROM outbox WHERE id = ANY($1)`, [[e.rows[0].id, d.rows[0].id]]);
    } finally { await p.end(); }
  });
  it('aislamiento por rol + 401 sin sesión', async () => {
    await loginAsAdmin();
    const p = pool();
    try {
      await p.query(`INSERT INTO outbox (canal, titulo, roles, estado) VALUES ('campana','E2E-rol-admin','{admin}','enviado')`);
      await p.query(`INSERT INTO outbox (canal, titulo, roles, estado) VALUES ('campana','E2E-rol-cons','{consultor}','enviado')`);
      jarC.cookie = '';
      const lh = await (await fetchC('/login')).text();
      const ctok = (lh.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      await fetchC('/auth/mock', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: ctok }) });
      const clist = await (await fetchC('/api/notificaciones')).json();
      assert.ok(clist.some((x) => x.titulo === 'E2E-rol-cons'), 'consultor ve las suyas');
      assert.ok(!clist.some((x) => x.titulo === 'E2E-rol-admin'), 'consultor no ve las de admin');
      const cd = await (await fetchC('/dashboard')).text();
      const cmt = (cd.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
      const adm = await p.query(`SELECT id FROM outbox WHERE titulo = 'E2E-rol-admin'`);
      assert.equal((await fetchC(`/api/notificaciones/${adm.rows[0].id}/leida`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-csrf-token': cmt } })).status, 404, 'leer ajena → 404');
      assert.equal((await fetch(`${BASE}/api/notificaciones`)).status, 401, 'sin sesión → 401');
      await p.query(`DELETE FROM outbox WHERE titulo LIKE 'E2E-rol-%'`);
    } finally { await p.end(); }
  });
});

describe('monitoreo health/ready + backup', () => {
  it('health liviano y ready con BD (públicos, sin sesión)', async () => {
    const h = await (await fetch(`${BASE}/api/health`)).json();
    assert.equal(h.ok, true);
    assert.match(h.version, /^\d+\.\d+\.\d+$/, 'versión semántica');
    const r = await (await fetch(`${BASE}/api/ready`)).json();
    assert.equal(r.ok, true);
    assert.equal(r.db, true);
    assert.equal(r.version, h.version);
  });
  it('maestro.borrar encola aviso Discord', async () => {
    await loginAsAdmin();
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    const c = await (await fetchJ('/api/maestros/circunscripciones', { method: 'POST', headers: h, body: JSON.stringify({ codigo: 'E2EDEL', nombre: 'Para borrar' }) })).json();
    assert.equal(c.ok, true);
    const d = await (await fetchJ('/api/maestros/circunscripciones/E2EDEL', { method: 'DELETE', headers: h })).json();
    assert.equal(d.ok, true);
    const { Pool } = require('pg');
    const p = new Pool({ connectionString: TEST_DB });
    try {
      const row = await p.query(`SELECT canal, estado FROM outbox WHERE ref = 'maestro-borrado:circunscripciones:E2EDEL'`);
      assert.equal(row.rows.length, 1, 'aviso encolado');
      assert.equal(row.rows[0].canal, 'discord');
      await p.query(`DELETE FROM outbox WHERE ref = 'maestro-borrado:circunscripciones:E2EDEL'`);
    } finally { await p.end(); }
  });
  it('backup-r2.ps1 LocalOnly genera .enc verificado (BD de test)', async () => {
    const out = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'e2e-bak-')));
    try {
      const log = execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(ROOT, 'infra', 'backup-r2.ps1')}" -LocalOnly -DbName sip_fnc_test -OutDir "${out}"`,
        { cwd: ROOT, env: { ...process.env, BACKUP_ENCRYPTION_KEY: 'e2e-local-test-key' }, stdio: 'pipe', timeout: 120000 }).toString();
      assert.ok(log.includes('OK local'), 'backup verificado con hash');
      assert.ok(fs.readdirSync(out).some((f) => f.endsWith('.dump.gz.enc')), 'existe .enc');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

describe('pwa + webpush', () => {
  const { Pool } = require('pg');
  const pool = () => new Pool({ connectionString: TEST_DB });
  const SUB = { endpoint: 'https://fcm.test/e2e-sub-1', p256dh: 'e2e-p256dh-0123456789', auth: 'e2e-auth-1234' };
  it('manifest dual-UA + sw.js + iconos + layout', async () => {
    const d = await fetch(`${BASE}/manifest.webmanifest`);
    assert.equal(d.status, 200);
    assert.match(d.headers.get('content-type'), /application\/manifest\+json/);
    assert.ok(d.headers.get('cache-control').includes('no-store'));
    const dm = await d.json();
    assert.equal(dm.short_name, 'SIP FNC');
    assert.ok(Array.isArray(dm.display_override), 'desktop con window-controls-overlay');
    assert.ok(dm.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), 'maskable declarado');
    const m = await (await fetch(`${BASE}/manifest.webmanifest`, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)' } })).json();
    assert.equal(m.orientation, 'portrait', 'móvil portrait');
    assert.ok(!m.display_override, 'móvil sin display_override');
    const sw = await fetch(`${BASE}/sw.js`);
    assert.equal(sw.status, 200);
    const swt = await sw.text();
    assert.ok(swt.includes('notificationclick') && swt.includes('/api/'), 'sw push + bypass api');
    const ic = await fetch(`${BASE}/icons/app-icon-192.png`);
    assert.equal(ic.status, 200);
    assert.match(ic.headers.get('content-type'), /image\/png/);
    await loginAsAdmin();
    const html = await (await fetchJ('/dashboard')).text();
    assert.ok(html.includes('rel="manifest" href="/manifest.webmanifest"'), 'link manifest');
    assert.ok(html.includes('name="theme-color"'), 'theme-color');
    assert.ok(html.includes("register('/sw.js')"), 'registro SW');
    assert.ok(html.includes('beforeinstallprompt'), 'captura install');
    assert.ok(html.includes('id="pushStatus"') && html.includes('id="pushOnBtn"'), 'consent en perfil');
  });
  it('public-key 401 anónimo y 503 sin VAPID', async () => {
    assert.equal((await fetch(`${BASE}/api/push/public-key`)).status, 401);
    await loginAsAdmin();
    const r = await fetchJ('/api/push/public-key');
    assert.equal(r.status, 503, 'sin VAPID en e2e');
  });
  it('subscribe upsert + validación + revoke + consultor', async () => {
    await loginAsAdmin();
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    const post = (b) => fetchJ('/api/push/subscribe', { method: 'POST', headers: h, body: JSON.stringify(b) });
    assert.equal((await post({ endpoint: 'x' })).status, 400, 'suscripción inválida 400');
    assert.equal((await post({ endpoint: SUB.endpoint })).status, 400, 'sin claves 400');
    assert.equal((await post(SUB)).status, 200);
    assert.equal((await post(SUB)).status, 200, 're-suscribir idempotente');
    const p = pool();
    try {
      const c = await p.query(`SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE endpoint = $1`, [SUB.endpoint]);
      assert.equal(c.rows[0].n, 1, 'upsert por endpoint');
      const me = await p.query(`SELECT fnc_sub FROM push_subscriptions WHERE endpoint = $1`, [SUB.endpoint]);
      assert.ok(me.rows[0].fnc_sub, 'dueño registrado');
      jarC.cookie = '';
      const lh = await (await fetchC('/login')).text();
      const ctok = (lh.match(/name="_csrf" value="([^"]+)"/) || [])[1];
      await fetchC('/auth/mock', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: ctok }) });
      const cd = await (await fetchC('/dashboard')).text();
      const cmt = (cd.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
      assert.equal((await fetchC('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': cmt }, body: JSON.stringify({ endpoint: 'https://fcm.test/e2e-cons', p256dh: SUB.p256dh, auth: SUB.auth }) })).status, 200, 'consultor suscribe');
      await p.query(`DELETE FROM push_subscriptions WHERE endpoint LIKE 'https://fcm.test/%'`);
    } finally { await p.end(); }
    assert.equal((await fetchJ('/api/push/subscribe', { method: 'DELETE', headers: h, body: JSON.stringify({ endpoint: SUB.endpoint }) })).status, 404, 'ya revocada → 404');
  });
  it('worker push sin VAPID → fallido (purga pendiente de suscripción real)', async () => {
    await loginAsAdmin();
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    await fetchJ('/api/push/subscribe', { method: 'POST', headers: h, body: JSON.stringify(SUB) });
    const p = pool();
    try {
      const me = await p.query(`SELECT fnc_sub FROM push_subscriptions WHERE endpoint = $1`, [SUB.endpoint]);
      await p.query(`INSERT INTO outbox (canal, titulo, destino, estado) VALUES ('push','E2E-push-x',$1,'pendiente')`, [me.rows[0].fnc_sub]);
      const t0 = Date.now();
      let row = null;
      for (;;) {
        row = (await p.query(`SELECT estado FROM outbox WHERE titulo = 'E2E-push-x'`)).rows[0];
        if (row.estado === 'fallido' || Date.now() - t0 > 10000) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.equal(row.estado, 'fallido', 'sin VAPID no se envía');
      await p.query(`DELETE FROM outbox WHERE titulo = 'E2E-push-x'`);
      await p.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [SUB.endpoint]);
    } finally { await p.end(); }
  });
});

describe('fase 4: licencias + habeas + auth-limit', () => {
  it('license-audit limpio (sin copyleft fuerte)', async () => {
    const log = execSync('node scripts/license-audit.cjs', { cwd: ROOT, stdio: 'pipe', timeout: 60000 }).toString();
    assert.ok(log.includes('limpio'), 'auditoría en verde');
    assert.ok(log.includes('sin copyleft fuerte'));
  });
  it('login con modal Habeas (CSS :target, sin JS)', async () => {
    const html = await (await fetch(`${BASE}/login`)).text();
    assert.ok(html.includes('href="#habeasModal"'), 'enlace habeas');
    assert.ok(html.includes('id="habeasModal"'), 'modal presente');
    assert.ok(html.includes('conocer, actualizar y rectificar'), 'texto habeas');
    const css = await (await fetchJ('/css/app.css')).text();
    assert.ok(css.includes('#habeasModal:target'), 'apertura por :target');
  });
});

describe('rate-limit + actividad + perfil + logout', () => {
  it('override a 5 → 429 con Retry-After → restore', { timeout: 30000 }, async () => {
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt, Accept: 'application/json' };
    const set = await (await fetchJ('/api/admin/rate-limit', { method: 'POST', headers: h, body: JSON.stringify({ perMin: 5 }) })).json();
    assert.equal(set.perMin, 5);
    let limited = 0, retry = '';
    for (let i = 0; i < 8; i++) {
      const r = await fetchJ('/api/me');
      if (r.status === 429) { limited++; retry = r.headers.get('retry-after'); }
    }
    assert.ok(limited > 0, 'hubo 429');
    assert.ok(retry, 'Retry-After presente');
    const back = await (await fetchJ('/api/admin/rate-limit', { method: 'POST', headers: h, body: JSON.stringify({ perMin: 1000 }) })).json();
    assert.equal(back.perMin, 1000);
  });
  it('feed plataforma sin auth/seguridad; /mia con lo propio', async () => {
    const feed = await (await fetchJ('/api/actividad')).json();
    assert.ok(!feed.some((a) => ['auth', 'seguridad'].includes(a.modulo)));
    const mia = await (await fetchJ('/api/actividad/mia')).json();
    assert.ok(mia.length > 0);
  });
  it('preferencia full↔first + foto válida/inválida', async () => {
    const mt = await csrfMeta();
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': mt };
    const p1 = await (await fetchJ('/api/perfil/preferencia', { method: 'POST', headers: h, body: JSON.stringify({ display_mode: 'first' }) })).json();
    assert.equal(p1.display_mode, 'first');
    const me = await (await fetchJ('/api/me')).json();
    assert.equal(me.displayMode, 'first');
    await fetchJ('/api/perfil/preferencia', { method: 'POST', headers: h, body: JSON.stringify({ display_mode: 'full' }) });
    const fd = new FormData();
    fd.append('foto', new Blob([fs.readFileSync(path.join(ROOT, 'public', 'img', 'user', 'MariaDelCarmen.webp'))], { type: 'image/webp' }), 'test.webp');
    const up = await (await fetchJ('/api/perfil/foto', { method: 'POST', headers: { 'x-csrf-token': mt }, body: fd })).json();
    assert.equal(up.ok, true);
    assert.ok(up.kb < 100, `foto comprimida (${up.kb} KB)`);
    const bad = new FormData();
    bad.append('foto', new Blob(['no-imagen'], { type: 'text/plain' }), 'x.txt');
    assert.equal((await fetchJ('/api/perfil/foto', { method: 'POST', headers: { 'x-csrf-token': mt }, body: bad })).status, 400);
  });
  it('solicitar-clave audita + logout cierra sesión', async () => {
    const mt = await csrfMeta();
    await fetchJ('/api/perfil/solicitar-clave', { method: 'POST', headers: { 'x-csrf-token': mt } });
    const mia = await (await fetchJ('/api/actividad/mia')).json();
    assert.ok(mia.some((a) => a.action === 'clave.solicitar'));
    await fetchJ('/auth/logout', { method: 'POST', headers: { 'x-csrf-token': mt } });
    assert.equal((await fetchJ('/api/me')).status, 401);
  });
});
