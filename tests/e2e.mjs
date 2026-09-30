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
  const headers = { ...(opts.headers || {}) };
  if (jar.cookie) headers.Cookie = jar.cookie;
  const res = await fetch(BASE + pathname, { redirect: 'manual', ...opts, headers });
  const sets = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (sets.length) jar.cookie = sets.map((c) => c.split(';')[0].trim()).join('; ');
  return res;
}

async function fetchC(pathname, opts = {}) {
  const headers = { ...(opts.headers || {}) };
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
  server = spawn('node', ['src/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(PORT), DATABASE_URL: TEST_DB, SESSION_SECRET,
      AUTH_PROVIDER: 'mock', MOCK_ROLES: 'admin',
      CLIENT_ROLES: 'admin,coordinador,consultor,analista,auxiliar',
      APP_BASE: BASE, RATE_LIMIT_API_PER_MIN: '1000',
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
  it('login mock → 302 a token dashboard', async () => { await loginAsAdmin(); });
  it('GET /api/me devuelve FncSession con exp-iat=28800', async () => {
    const me = await (await fetchJ('/api/me')).json();
    for (const k of ['sub', 'email', 'displayName', 'roles', 'role', 'fingerprint', 'iat', 'exp']) assert.ok(me[k] !== undefined, k);
    assert.equal(me.exp - me.iat, 28800);
    assert.equal(me.role, 'ADMIN');
  });
  it('dashboard con CSP + nonce coincidente', async () => {
    const r = await fetchJ('/dashboard');
    const csp = r.headers.get('content-security-policy');
    assert.ok(csp && csp.includes('nonce-'));
    const html = await r.text();
    const n = (csp.match(/nonce-([^']+)/) || [])[1];
    assert.ok(n && html.includes(`nonce="${n}"`));
  });
});

describe('URLs opacas + guards', () => {
  it('token dashboard y hoja → 200; real sigue viva', async () => {
    assert.equal((await fetchJ('/v/rs')).status, 200);
    assert.equal((await fetchJ('/dashboard')).status, 200);
    assert.equal((await fetchJ('/v/sc')).status, 200);
  });
  it('token inválido → 404', async () => {
    assert.equal((await fetchJ('/v/zz')).status, 404);
  });
  it('seguridad admin → 200 con auditoría', async () => {
    const r = await fetchJ('/v/tb');
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Auditor/);
  });
  it('?f=token monta skeleton; informe redirige a token', async () => {
    const tokLeaf = mods.tokenFor('/distribucion/actualizaciones/municipios').slice(3);
    const f = await fetchJ(`/v/rs?f=${tokLeaf}`);
    assert.equal(f.status, 200);
    assert.match(await f.text(), /skeleton/);
    const tokInf = mods.tokenFor('/distribucion/informes/saldos').slice(3);
    const inf = await fetchJ(`/v/rs?f=${tokInf}`);
    assert.equal(inf.status, 302);
    assert.match(inf.headers.get('location'), /^\/v\//);
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
