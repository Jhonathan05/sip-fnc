// Vistas vanilla (fnc-layout/vanilla-rendimiento). Nav guiado por src/modules.js:
// permitido = link, sin acceso pero visible = deshabilitado, nav:false = oculto (URL con guard).
const { MODULES, canAccess } = require('./modules');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function nav(active, role) {
  return MODULES.filter((m) => m.nav).map((m) => {
    if (canAccess(role, m)) {
      return `<a class="tab-btn${active === m.path ? ' active' : ''}" href="${m.path}">${esc(m.title)}</a>`;
    }
    return `<span class="tab-btn tab-disabled" title="Sin permiso para este módulo">${esc(m.title)} 🔒</span>`;
  }).join('');
}

function layout(appName, fnc, active, body) {
  const email = fnc?.email || '';
  const role = fnc?.role || '';
  const initial = email.trim().charAt(0).toUpperCase() || 'U';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(active)} — ${esc(appName)}</title><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/app.css"></head><body>
<header class="header-fnc"><div class="header-container">
<div style="display:flex;align-items:center;gap:12px;"><div class="header-brand"><div><span class="header-brand-name">${esc(appName)}</span></div></div></div>
<div class="header-user-profile"><div class="user-avatar">${esc(initial)}</div><div><span class="user-name">${esc(email)}</span><span class="user-email">${esc(role)}</span></div>
<form method="post" action="/auth/logout" style="margin:0"><button class="btn-logout" type="submit">Salir</button></form></div>
</div></header>
<aside class="app-sidebar" aria-label="Navegacion principal"><nav class="sidebar-nav">
<span class="sidebar-section-label">Módulos</span>
${nav(active, role)}
</nav></aside>
<main class="main-container">${body}</main>
</body></html>`;
}

function loginPage(appName, kcMode) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login — ${esc(appName)}</title><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/app.css"></head><body>
<main class="main-container" style="margin-left:15px"><div class="card"><h1>${esc(appName)}</h1>
${kcMode
    ? `<a class="btn-primary" href="/auth/app">Continuar con Comit\u00e9 Tolima</a>`
    : `<form method="post" action="/auth/mock" style="margin:0"><button class="btn-primary" type="submit">Continuar con Comit\u00e9 Tolima</button></form><p><span class="badge">mock offline</span> sin Keycloak.</p>`}
</div></main></body></html>`;
}

function rolesMatrix(fnc) {
  const rows = MODULES.map((m) => {
    const ok = canAccess(fnc.role, m);
    const estado = ok ? 'permitido' : (m.nav ? 'deshabilitado' : 'oculto');
    return `<tr><td>${esc(m.title)}</td><td><code>${esc(m.path)}</code></td><td>${esc(m.roles.join(','))}</td><td><span class="badge">${estado}</span></td></tr>`;
  }).join('');
  return `<div class="card"><h1>Roles</h1>
<p>Tu rol: <strong>${esc(fnc.role)}</strong> · Client roles: <strong>${esc(fnc.roles.join(','))}</strong></p>
<table><thead><tr><th>Módulo</th><th>Ruta</th><th>Roles</th><th>Tu acceso</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function errorPage(fnc, reason) {
  const msgs = { state: 'Sesión de autenticación inválida.', callback: 'No se pudo completar el acceso.', forbidden: 'Sin permiso para este módulo.' };
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Error</title><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/app.css"></head><body>
<main class="main-container" style="margin-left:15px"><div class="alert-err">${esc(msgs[reason] || msgs.callback)}</div>
<a class="btn-primary" href="/">Reintentar</a></main></body></html>`;
}

module.exports = { layout, loginPage, rolesMatrix, errorPage, esc };
