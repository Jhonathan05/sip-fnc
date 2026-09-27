// Vistas vanilla (fnc-layout/vanilla-rendimiento). Nav en árbol guiado por src/modules.js:
// módulo → subcategoría (colapsable, memoria localStorage) → hoja.
// permitido = link, sin acceso pero visible = deshabilitado, CONFIG anclada al fondo.
const { MODULES, NAV, CONFIG, canAccess, flattenLeaves } = require('./modules');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Set SVG propio mínimo (línea, 16px, currentColor). Cero dependencias.
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  distribucion: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  adjudicaciones: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  asignaciones: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  sap: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  contratos: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  seguridad: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  roles: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  tareas: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  informes: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
  consultas: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  procesos: '<path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9"/>',
};

function icon(name) {
  return `<svg class="nav-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.tareas}</svg>`;
}

function leafLink(leaf, active, role) {
  const isActive = active === leaf.path;
  if (canAccess(role, leaf)) {
    return `<a class="tree-leaf${isActive ? ' active' : ''}" href="${leaf.path}">${esc(leaf.title)}</a>`;
  }
  return `<span class="tree-leaf tree-disabled" title="Sin permiso">🔒 ${esc(leaf.title)}</span>`;
}

function navTree(active, role) {
  let html = '';
  for (const mod of NAV) {
    if (!canAccess(role, mod)) continue;
    const inMod = active === mod.path || active.startsWith(mod.path + '/');
    if (!(mod.children || []).length) {
      html += `<a class="tab-btn${active === mod.path ? ' active' : ''}" href="${mod.path}">${icon(mod.icon)}${esc(mod.title)}</a>`;
      continue;
    }
    const subs = (mod.children || []).map((sub) => {
      const leaves = sub.children || [];
      if (!leaves.length) return '';
      const inSub = leaves.some((l) => active === l.path);
      const items = leaves.map((l) => leafLink(l, active, role)).join('');
      return `<details class="tree-sub" name="sip-nav" data-navkey="${esc(mod.path + '/' + sub.key)}"${inSub ? ' open' : ''}>
        <summary class="tree-sub-head">${icon(sub.icon)}${esc(sub.title)}</summary>
        <div class="tree-leaves">${items}</div>
      </details>`;
    }).join('');
    html += `<details class="tree-mod" name="sip-nav" data-navkey="mod:${esc(mod.path)}"${inMod ? ' open' : ''}>
      <summary class="tab-btn tree-mod-head${active === mod.path ? ' active' : ''}">${icon(mod.icon)}${esc(mod.title)}</summary>
      <div class="tree-subs">${subs}</div>
    </details>`;
  }
  return html;
}

function navConfig(active, role) {
  const items = CONFIG.filter((c) => canAccess(role, c));
  if (!items.length) return '';
  const links = items.map((c) => `<a class="tab-btn${active === c.path ? ' active' : ''}" href="${c.path}">${icon(c.icon)}${esc(c.title)}</a>`).join('');
  return `<div class="nav-config"><span class="sidebar-section-label">Configuración</span>${links}</div>`;
}

const NAV_MEMORY_JS = `<script>(function(){try{var k='sip-nav-open';var open=JSON.parse(localStorage.getItem(k)||'[]');function save(id,on){try{var cur=JSON.parse(localStorage.getItem(k)||'[]');if(on&&cur.indexOf(id)<0)cur.push(id);if(!on)cur=cur.filter(function(x){return x!==id});localStorage.setItem(k,JSON.stringify(cur));}catch(e){}}document.querySelectorAll('details.tree-sub, details.tree-mod').forEach(function(d){var id=d.getAttribute('data-navkey');if(open.indexOf(id)>=0)d.open=true;d.addEventListener('toggle',function(){save(id,d.open)});});}catch(e){}})();</script>`;

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
${navTree(active, role)}
${navConfig(active, role)}
</nav></aside>
<main class="main-container">${body}</main>
${NAV_MEMORY_JS}</body></html>`;
}

function loginPage(appName, kcMode) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login — ${esc(appName)}</title><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/app.css"></head><body>
<main class="main-container" style="margin-left:15px"><div class="card"><h1>${esc(appName)}</h1>
<p>Sistema de Información de Proyectos — gestión e informes contables por periodos.</p>
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
  const leafRows = flattenLeaves().map(({ leaf, sub, mod }) => {
    const ok = canAccess(fnc.role, leaf);
    return `<tr><td>${esc(mod.title)} / ${esc(sub.title)} / ${esc(leaf.title)}</td><td><code>${esc(leaf.path)}</code></td><td>${esc(leaf.roles.join(','))}</td><td><span class="badge">${ok ? 'permitido' : 'deshabilitado'}</span></td></tr>`;
  }).join('');
  return `<div class="card"><h1>Roles</h1>
<p>Tu rol: <strong>${esc(fnc.role)}</strong> · Client roles: <strong>${esc(fnc.roles.join(','))}</strong></p>
<table><thead><tr><th>Módulo</th><th>Ruta</th><th>Roles</th><th>Tu acceso</th></tr></thead><tbody>${rows}</tbody></table>
<h1>Opciones del árbol</h1>
<table><thead><tr><th>Ruta árbol</th><th>Path</th><th>Roles</th><th>Tu acceso</th></tr></thead><tbody>${leafRows}</tbody></table></div>`;
}

function errorPage(fnc, reason) {
  const msgs = { state: 'Sesión de autenticación inválida.', callback: 'No se pudo completar el acceso.', forbidden: 'Sin permiso para este módulo.' };
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Error</title><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/app.css"></head><body>
<main class="main-container" style="margin-left:15px"><div class="alert-err">${esc(msgs[reason] || msgs.callback)}</div>
<a class="btn-primary" href="/">Reintentar</a></main></body></html>`;
}

module.exports = { layout, loginPage, rolesMatrix, errorPage, esc };
