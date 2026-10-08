// Vistas vanilla (fnc-layout/vanilla-rendimiento). Nav en árbol guiado por src/modules.js:
// módulo → subcategoría (colapsable, memoria localStorage) → hoja.
// permitido = link, sin acceso pero visible = deshabilitado, CONFIG anclada al fondo.
const { MODULES, NAV, CONFIG, canAccess, flattenLeaves, tokenFor } = require('./modules');
const { PROCESO_FORM, clientCatalog, canCreate } = require('./task-meta');
const { shownName } = require('./prefs');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Inyecta el nonce CSP en cada <script> inline (helmet lo exige por request).
function withNonce(html, nonce) {
  if (!nonce) return html;
  return String(html).split('<script>').join(`<script nonce="${nonce}">`);
}

// Set Lucide (ISC, sin atribución requerida) inline — cero dependencias.
const P = {
  dashboard: '<path d="m12 14 4-4" /> <path d="M3.34 19a10 10 0 1 1 17.32 0" />',
  distribucion: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /> <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />',
  adjudicaciones: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" /> <circle cx="12" cy="8" r="6" />',
  asignaciones: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /> <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /> <path d="M12 11h4" /> <path d="M12 16h4" /> <path d="M8 11h.01" /> <path d="M8 16h.01" />',
  sap: '<ellipse cx="12" cy="5" rx="9" ry="3" /> <path d="M3 5V19A9 3 0 0 0 21 19V5" /> <path d="M3 12A9 3 0 0 0 21 12" />',
  contratos: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" /> <path d="M14 2v5a1 1 0 0 0 1 1h5" /> <path d="M10 9H8" /> <path d="M16 13H8" /> <path d="M16 17H8" />',
  seguridad: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /> <path d="m9 12 2 2 4-4" />',
  roles: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <path d="M16 3.128a4 4 0 0 1 0 7.744" /> <path d="M22 21v-2a4 4 0 0 0-3-3.87" /> <circle cx="9" cy="7" r="4" />',
  tareas: '<path d="M13 5h8" /> <path d="M13 12h8" /> <path d="M13 19h8" /> <path d="m3 17 2 2 4-4" /> <path d="m3 7 2 2 4-4" />',
  informes: '<path d="M5 21v-6" /> <path d="M12 21V3" /> <path d="M19 21V9" />',
  consultas: '<path d="m21 21-4.34-4.34" /> <circle cx="11" cy="11" r="8" />',
  procesos: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /> <circle cx="12" cy="12" r="3" />',
  perfil: '<path d="M17.925 20.056a6 6 0 0 0-11.851.001" /> <circle cx="12" cy="11" r="4" /> <circle cx="12" cy="12" r="10" />',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2" /> <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />',
  campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /> <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />',
};

function icon(name) {
  return `<svg class="nav-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.tareas}</svg>`;
}

function leafLink(leaf, active, role, sub) {
  const isActive = active === leaf.path;
  const tok = tokenFor(leaf.path).replace('/v/', '');
  const href = sub && sub.kind === 'informe' ? tokenFor(leaf.path) : `${tokenFor('/dashboard')}?f=${encodeURIComponent(tok)}`;
  if (canAccess(role, leaf)) {
    return `<a class="tree-leaf${isActive ? ' active' : ''}" href="${href}" title="${esc(leaf.title)}"><span class="nav-label">${esc(leaf.title)}</span></a>`;
  }
  return `<span class="tree-leaf tree-disabled" title="Sin permiso"><span class="nav-label">🔒 ${esc(leaf.title)}</span></span>`;
}

function navTree(active, role) {
  let html = '';
  for (const mod of NAV) {
    if (!canAccess(role, mod)) continue;
    const inMod = active === mod.path || active.startsWith(mod.path + '/');
    if (!(mod.children || []).length) {
      html += `<a class="tab-btn${active === mod.path ? ' active' : ''}" href="${tokenFor(mod.path)}" title="${esc(mod.title)}">${icon(mod.icon)}<span class="nav-label">${esc(mod.title)}</span></a>`;
      continue;
    }
    const subs = (mod.children || []).map((sub) => {
      const leaves = sub.children || [];
      if (!leaves.length) return '';
      const inSub = leaves.some((l) => active === l.path);
      const items = leaves.map((l) => leafLink(l, active, role, sub)).join('');
      return `<details class="tree-sub" data-navkey="${esc(tokenFor(mod.path).replace('/v/', '') + '/' + sub.key)}"${inSub ? ' open' : ''}>
        <summary class="tree-sub-head" title="${esc(sub.title)}">${icon(sub.icon)}<span class="nav-label">${esc(sub.title)}</span></summary>
        <div class="tree-leaves">${items}</div>
      </details>`;
    }).join('');
    html += `<details class="tree-mod" data-navkey="mod:${esc(tokenFor(mod.path).replace('/v/', ''))}"${inMod ? ' open' : ''}>
      <summary class="tab-btn tree-mod-head${active === mod.path ? ' active' : ''}" title="${esc(mod.title)}">${icon(mod.icon)}<span class="nav-label">${esc(mod.title)}</span></summary>
      <div class="tree-subs">${subs}</div>
    </details>`;
  }
  return html;
}

function navConfig(active, role) {
  const items = CONFIG.filter((c) => canAccess(role, c));
  if (!items.length) return '';
  const links = items.map((c) => {
    if (c.modal) {
      return `<button class="tab-btn" data-open-modal="${esc(c.modal)}" title="${esc(c.title)}">${icon(c.icon)}<span class="nav-label">${esc(c.title)}</span></button>`;
    }
    return `<a class="tab-btn${active === c.path ? ' active' : ''}" href="${tokenFor(c.path)}" title="${esc(c.title)}">${icon(c.icon)}<span class="nav-label">${esc(c.title)}</span></a>`;
  }).join('');
  return `<div class="nav-config"><span class="sidebar-section-label">Configuración</span>${links}</div>`;
}

// Modal de inactividad: aviso 60s antes del cierre (5 min), con CSRF para renovar.
function inactivityModal() {
  return `<div class="modal-overlay" id="inactModal" hidden>
  <div class="modal-card" role="dialog" aria-modal="true" aria-label="Sesión por expirar">
    <h2>Sesión por expirar</h2>
    <p>Por inactividad se cerrará en <strong class="tnum" id="inactSecs">60</strong>s.</p>
    <div class="drawer-actions"><button class="btn-primary" id="inactStay" type="button" style="margin-top:0">Seguir activo</button><button class="btn-logout" id="inactExit" type="button">Salir</button></div>
  </div>
</div>`;
}

const INACTIVITY_JS = `<script>(function(){try{
// Blindaje fetch v2: todo 401 de /api → login con motivo.
if(!window.__fncFetch&&window.fetch){window.__fncFetch=window.fetch;window.fetch=function(u,o){function attempt(){return window.__fncFetch(u,o).then(function(r){if(r&&r.status===401){window.location.href='/login?reason=inactivity';}return r;}).catch(function(e){connShow();return new Promise(function(res){function again(){window.__fncFetch(u,o).then(function(r){connHide();res(r);}).catch(function(){setTimeout(again,5000);});}setTimeout(again,5000);});});}return attempt();};}
function connShow(){var o=document.getElementById('connOverlay');if(o)o.hidden=false;}
function connHide(){var o=document.getElementById('connOverlay');if(o)o.hidden=true;}
// Pre-check de sesión para acciones críticas (validar/crear/guardar/enviar).
window.fncAlive=function(){return window.__fncFetch('/api/me',{method:'GET'}).then(function(r){return r.status===200;}).catch(function(){return false;});};
var cr=document.getElementById('connRetry');if(cr)cr.addEventListener('click',function(){window.location.reload();});
document.querySelectorAll('form[data-precheck]').forEach(function(f){f.addEventListener('submit',function(e){if(f.__checking)return;e.preventDefault();f.__checking=true;window.fncAlive().then(function(ok){f.__checking=false;if(ok){f.submit();}else{window.location.href='/login?reason=inactivity';}});});});
var WARN_AT=4*60*1000, LIMIT=5*60*1000, deadline=Date.now()+LIMIT, timer=null, shown=false;
var modal=document.getElementById('inactModal'), secs=document.getElementById('inactSecs');
function csrfH(){try{var m=document.querySelector('meta[name="csrf-token"]');return m?m.getAttribute('content')||'':'';}catch(e){return '';}}
function reset(){deadline=Date.now()+LIMIT;if(shown&&modal){modal.hidden=true;shown=false;}}
function logout(){fetch('/auth/logout',{method:'POST',headers:{'x-csrf-token':csrfH()}}).finally(function(){window.location.href='/login?reason=inactivity';});}
// Cierre cooperativo multi-tab: solo destruye si el servidor dice muerta.
// Si otro tab renovó la sesión, se adopta su vida y se sigue (sin doble login).
function checkAlive(){window.__fncFetch('/api/me',{method:'GET'}).then(function(r){if(r.status===200){reset();timer=setInterval(tick,1000);}else{logout();}}).catch(function(){logout();});}
function tick(){
var left=deadline-Date.now();
if(left<=0){clearInterval(timer);checkAlive();return;}
if(left<=60000&&!shown&&modal){shown=true;modal.hidden=false;}
if(shown&&secs)secs.textContent=Math.ceil(left/1000);
}
['mousemove','keydown','pointerdown','touchstart','scroll'].forEach(function(e){window.addEventListener(e,reset,{passive:true});});
timer=setInterval(tick,1000);
var stay=document.getElementById('inactStay');
if(stay)stay.addEventListener('click',function(){fetch('/api/auth/activity',{method:'POST',headers:{'x-csrf-token':csrfH()}}).finally(function(){reset();});});
var exit=document.getElementById('inactExit');
if(exit)exit.addEventListener('click',logout);
}catch(e){}})();</script>`;

function profileModal(csrf) {
  const csrfField = csrf ? `<input type="hidden" name="_csrf" value="${csrf}">` : '';
  return `<div class="modal-overlay" id="perfilModal" hidden>
  <div class="modal-card" role="dialog" aria-modal="true" aria-label="Mi perfil">
    <h2>Mi perfil</h2>
    <div id="perfilBody"><p>Cargando…</p></div>
    <div class="pref-block"><span class="a11y-sec-label">Mi actividad (incluye mi seguridad)</span>
      <ul class="feed" id="perfilFeed"><li>Cargando…</li></ul>
    </div>
    <div class="pref-block"><span class="a11y-sec-label">Nombre mostrado</span>
      <div class="a11y-seg" role="group" aria-label="Nombre mostrado">
        <button id="prefFull" type="button" aria-pressed="true">Completo</button>
        <button id="prefFirst" type="button" aria-pressed="false">Solo nombre</button>
      </div>
    </div>
    <div class="pref-block"><span class="a11y-sec-label">Foto (jpeg, png, webp · máx 5 MB → se guarda en 256px)</span>
      <div class="a11y-font"><input id="prefFoto" type="file" accept=".jpg,.jpeg,.png,.webp"><button id="prefFotoBtn" type="button">Subir</button></div>
    </div>
    <div class="pref-block"><span class="a11y-sec-label">Notificaciones push en este equipo</span>
      <p class="modal-note" id="pushStatus">Verificando soporte…</p>
      <div class="a11y-font"><button id="pushOnBtn" type="button" hidden>Activar</button><button id="pushOffBtn" type="button" hidden>Desactivar</button><button id="pushInstallBtn" type="button" hidden>Instalar app</button></div>
    </div>
    <p id="prefMsg" class="drawer-msg"></p>
    <form method="post" action="/api/perfil/solicitar-clave" style="margin:12px 0 0">${csrfField}
      <button class="btn-primary" type="submit" style="margin-top:0">Solicitar cambio de contraseña</button>
    </form>
    <p class="modal-note">Tu solicitud llega al administrador, quien restablece tu acceso y te pide definir una nueva clave en el siguiente ingreso. La consola de cuenta Keycloak no está expuesta.</p>
    <button class="btn-logout" data-close-modal>Cerrar</button>
  </div>
</div>`;
}

const MODAL_JS = `<script>(function(){try{
var m=document.getElementById('perfilModal');
function csrfH(){try{var m=document.querySelector('meta[name="csrf-token"]');return m?m.getAttribute('content')||'':'';}catch(e){return '';}}
function syncPref(mode){var f=document.getElementById('prefFull'),s=document.getElementById('prefFirst');if(f)f.setAttribute('aria-pressed',mode==='first'?'false':'true');if(s)s.setAttribute('aria-pressed',mode==='first'?'true':'false');}
function prefMsg(t){var m=document.getElementById('prefMsg');if(m)m.textContent=t||'';}
document.querySelectorAll('[data-open-modal="perfil"]').forEach(function(b){b.addEventListener('click',function(){if(!m)return;m.hidden=false;prefMsg('');fetch('/api/me').then(function(r){return r.json();}).then(function(u){var left=u.exp&&u.iat?Math.max(0,u.exp-Math.floor(Date.now()/1000)):0;var hh=Math.floor(left/3600),mm=Math.floor((left%3600)/60);document.getElementById('perfilBody').innerHTML='<p>Usuario: <strong>'+String(u.displayName||'')+'</strong></p><p>Email: <strong>'+String(u.email||'')+'</strong></p><p>Rol: <span class=&quot;badge&quot;>'+String(u.role||'')+'</span> '+(u.roles||[]).join(', ')+'</p><p>Sesión vigente por: <strong>'+hh+'h '+mm+'min</strong></p>';syncPref(u.displayMode||'full');
fetch('/api/actividad/mia').then(function(r){return r.json();}).then(function(rows){var f=document.getElementById('perfilFeed');if(!f)return;if(!rows||!rows.length){f.innerHTML='<li>Sin movimientos.</li>';return;}f.innerHTML=rows.slice(0,8).map(function(a){var d=new Date(a.at);var when=isNaN(d)?'':d.toLocaleString('es-CO');return '<li><strong>'+String(a.action||'')+'</strong> <span class=&quot;badge&quot;>'+String(a.modulo||'')+'</span><br><span>'+String(a.detalle||'')+'</span> <em class=&quot;tnum&quot;>'+when+'</em></li>';}).join('');}).catch(function(){});}).catch(function(){});});});
function savePref(mode){prefMsg('Guardando…');fetch('/api/perfil/preferencia',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':csrfH()},body:JSON.stringify({display_mode:mode})}).then(function(r){return r.json();}).then(function(d){if(d&&d.ok){syncPref(d.display_mode);prefMsg('Preferencia guardada. Recarga para verla en el header.');}else{prefMsg((d&&d.error)||'No se pudo guardar.');}}).catch(function(){prefMsg('Error de red.');});}
var pf=document.getElementById('prefFull'),ps=document.getElementById('prefFirst');
if(pf)pf.addEventListener('click',function(){savePref('full');});
if(ps)ps.addEventListener('click',function(){savePref('first');});
var fb=document.getElementById('prefFotoBtn');
if(fb)fb.addEventListener('click',function(){
var fi=document.getElementById('prefFoto');
if(!fi||!fi.files||!fi.files[0]){prefMsg('Elige un archivo (jpeg, png o webp, máx 5 MB).');return;}
var fd=new FormData();fd.append('foto',fi.files[0]);
prefMsg('Subiendo y comprimiendo…');
fetch('/api/perfil/foto',{method:'POST',headers:{'x-csrf-token':csrfH()},body:fd}).then(function(r){return r.json().then(function(d){return {s:r.status,d:d};});}).then(function(x){
if(x.d&&x.d.ok){prefMsg('Foto actualizada ('+x.d.kb+' KB). Recarga para verla.');}else{prefMsg((x.d&&(x.d.error||x.d.msg))||('Error '+x.s+'.'));}
}).catch(function(){prefMsg('Error de red.');});
});
function close(){if(m)m.hidden=true;}
document.querySelectorAll('[data-close-modal]').forEach(function(b){b.addEventListener('click',close);});
if(m)m.addEventListener('click',function(e){if(e.target===m)close();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
}catch(e){}})();</script>`;

function taskCreateModal() {
  const rolOpts = clientCatalog().map((r) => `<option value="${r}"${r === 'analista' ? ' selected' : ''}>${esc(r)}</option>`).join('');
  const procOpts = Object.keys(PROCESO_FORM).map((p) => `<option>${esc(p)}</option>`).join('');
  return `<div class="modal-overlay" id="tareaCrearModal" hidden>
  <div class="modal-card" role="dialog" aria-modal="true" aria-label="Nueva tarea">
    <h2>Nueva tarea</h2>
    <div class="fld-grid">
      <label class="fld"><span>Título *</span><input id="tcTitulo" type="text" maxlength="200" placeholder="Qué hay que hacer"></label>
      <label class="fld"><span>Rol destino *</span><select id="tcRol">${rolOpts}</select></label>
      <label class="fld"><span>Responsable</span><input id="tcResp" type="text" maxlength="120" placeholder="Persona o equipo"></label>
      <label class="fld"><span>Área solicitante</span><input id="tcArea" type="text" maxlength="120"></label>
      <label class="fld"><span>Proceso</span><select id="tcProc"><option value="">—</option>${procOpts}</select></label>
      <label class="fld"><span>Fecha límite *</span><input id="tcFecha" type="date"></label>
      <label class="fld"><span>Detalle</span><input id="tcDetalle" type="text" maxlength="500"></label>
      <label class="fld"><span>Automática</span><select id="tcAuto"><option value="no">No</option><option value="si">Sí</option></select></label>
    </div>
    <p id="tcMsg" class="drawer-msg"></p>
    <div class="drawer-actions"><button class="btn-primary" id="tcGuardar" type="button" style="margin-top:0">Crear tarea</button><button class="btn-logout" data-close-modal type="button">Cancelar</button></div>
  </div>
</div>`;
}

const TASK_CREATE_JS = `<script>(function(){try{
var m=document.getElementById('tareaCrearModal');
function close(){if(m)m.hidden=true;}
document.querySelectorAll('[data-open-modal="tarea-crear"]').forEach(function(b){b.addEventListener('click',function(){if(!m)return;m.hidden=false;var t=document.getElementById('tcTitulo');if(t)t.focus();});});
document.querySelectorAll('[data-close-modal]').forEach(function(b){if(!b.__tc){b.__tc=true;b.addEventListener('click',close);}});
if(m)m.addEventListener('click',function(e){if(e.target===m)close();});
var g=document.getElementById('tcGuardar');
if(g)g.addEventListener('click',function(){
var msg=document.getElementById('tcMsg');
function val(id){var el=document.getElementById(id);return el?el.value.trim():'';}
var payload={titulo:val('tcTitulo'),rol:val('tcRol'),responsable:val('tcResp'),area:val('tcArea'),proceso:val('tcProc'),fecha_limite:val('tcFecha'),detalle:val('tcDetalle'),automatica:val('tcAuto')==='si'};
g.disabled=true;if(msg)msg.textContent='Guardando…';
function go(){
var tk='';try{var mm=document.querySelector('meta[name="csrf-token"]');tk=mm?mm.getAttribute('content')||'':'';}catch(e){}
fetch('/api/tareas',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':tk},body:JSON.stringify(payload)}).then(function(r){return r.json().then(function(d){return {s:r.status,d:d};});}).then(function(x){
if(x.d&&x.d.ok){window.location.reload();return;}
if(msg)msg.textContent=(x.d&&(x.d.error||x.d.msg))||'No se pudo crear.';
g.disabled=false;
}).catch(function(){if(msg)msg.textContent='Error de red.';g.disabled=false;});
}
if(window.fncAlive){window.fncAlive().then(function(ok){if(ok){go();}else{g.disabled=false;window.location.href='/login?reason=inactivity';}});}else{go();}
});
}catch(e){}})();</script>`;

// Memoria del árbol: restaura ramas abiertas ANTES del primer pintado.
// Se emite justo tras </aside> (parser-blocking): sin salto de elementos al
// navegar con el árbol desplegado. En dashboard plano solo limpia la memoria.
const NAV_OPEN_JS = `<script>(function(){try{var open=JSON.parse(localStorage.getItem('sip-nav-open')||'[]');var all=document.querySelectorAll('details.tree-sub, details.tree-mod');for(var i=0;i<all.length;i++){var d=all[i];if(open.indexOf(d.getAttribute('data-navkey'))>=0)d.open=true;d.addEventListener('toggle',function(){var k='sip-nav-open';try{var cur=JSON.parse(localStorage.getItem(k)||'[]');var my=this.getAttribute('data-navkey');if(this.open&&cur.indexOf(my)<0)cur.push(my);if(!this.open)cur=cur.filter(function(x){return x!==my;});localStorage.setItem(k,JSON.stringify(cur));}catch(e){}});}}catch(e){}})();</script>`;

const NAV_MEMORY_JS = `<script>(function(){try{
var scrollAreas=Array.prototype.slice.call(document.querySelectorAll('.sidebar-nav, .rail-scroll'));
scrollAreas.forEach(function(el){var scrollT=null;el.addEventListener('scroll',function(){el.classList.add('is-scrolling');if(scrollT)clearTimeout(scrollT);scrollT=setTimeout(function(){el.classList.remove('is-scrolling');},800);},{passive:true});});
document.addEventListener('error',function(e){var t=e.target;if(t&&t.classList&&t.classList.contains('user-photo')){var d=document.createElement('div');d.className='user-avatar';d.textContent=(t.getAttribute('alt')||'U').trim().charAt(0).toUpperCase()||'U';t.replaceWith(d);}},true);}catch(e){}})();</script>`;

// Reset al seleccionar Dashboard: el dashboard sin formulario inline se renderiza con
// active '/dashboard'. Se emite tras </aside> (y ya no al final): limpia la memoria
// de ramas para que el árbol cargue colapsado sin reabrir nada guardado.
const NAV_RESET_JS = `<script>(function(){try{localStorage.removeItem('sip-nav-open');}catch(e){}})();</script>`;

const A11Y_HEAD_JS = `<script>(function(){try{var t=localStorage.getItem('sip-theme');if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);var s=parseInt(localStorage.getItem('sip-font')||'100',10);if(s>=80&&s<=120&&s!==100)document.documentElement.style.fontSize=(s/100*16)+'px';if(localStorage.getItem('sip-nav-collapsed')==='1')document.documentElement.classList.add('nav-collapsed');}catch(e){}})();</script>`;

const SUN_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MOON_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;

function a11yControls() {
  return `<span class="a11y-group" role="group" aria-label="Accesibilidad"><button class="nav-collapse-btn" id="fontDown" aria-label="Disminuir tamaño de letra" title="Disminuir tamaño de letra">A−</button>
<button class="nav-collapse-btn" id="fontUp" aria-label="Aumentar tamaño de letra" title="Aumentar tamaño de letra">A+</button>
<button class="nav-collapse-btn" id="themeToggle" aria-label="Cambiar tema" aria-pressed="false" title="Cambiar tema">${SUN_ICON}</button></span>`;
}

const A11Y_JS = `<script>(function(){try{
var ICON_SUN='${SUN_ICON}';var ICON_MOON='${MOON_ICON}';
function getFont(){return parseInt(localStorage.getItem('sip-font')||'100',10);}
function setFont(s){s=Math.min(120,Math.max(80,s));document.documentElement.style.fontSize=(s/100*16)+'px';try{localStorage.setItem('sip-font',String(s));}catch(e){}syncFont();}
function syncFont(){var s=getFont();var d=document.getElementById('fontDown'),u=document.getElementById('fontUp');if(d){d.disabled=s<=80;d.classList.toggle('is-default',s===100);d.title='Disminuir tamaño de letra ('+s+'%)';}if(u){u.disabled=s>=120;u.classList.toggle('is-default',s===100);u.title='Aumentar tamaño de letra ('+s+'%)';}}
function syncTheme(){var t=document.documentElement.getAttribute('data-theme')||'light';var b=document.getElementById('themeToggle');if(b){b.setAttribute('aria-pressed',t==='dark'?'true':'false');b.title=t==='dark'?'Cambiar a modo claro':'Cambiar a modo oscuro';b.innerHTML=t==='dark'?ICON_SUN:ICON_MOON;}}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('sip-theme',t);}catch(e){}syncTheme();}
var fd=document.getElementById('fontDown'),fu=document.getElementById('fontUp'),tt=document.getElementById('themeToggle');
if(fd)fd.addEventListener('click',function(){setFont(getFont()-10);});
if(fu)fu.addEventListener('click',function(){setFont(getFont()+10);});
if(tt)tt.addEventListener('click',function(){setTheme((document.documentElement.getAttribute('data-theme')||'light')==='dark'?'light':'dark');});
syncFont();syncTheme();
var navBtn=document.getElementById('navCollapseBtn');
if(navBtn){if(document.documentElement.classList.contains('nav-collapsed'))navBtn.setAttribute('aria-label','Expandir menú');navBtn.addEventListener('click',function(){var on=!document.documentElement.classList.contains('nav-collapsed');document.documentElement.classList.toggle('nav-collapsed',on);navBtn.setAttribute('aria-label',on?'Expandir menú':'Contraer menú');try{localStorage.setItem('sip-nav-collapsed',on?'1':'0');}catch(e){}if(on){var sb=document.querySelector('.app-sidebar');if(sb&&sb.matches&&sb.matches(':hover')){document.documentElement.classList.add('nav-lock');var un=function(){document.documentElement.classList.remove('nav-lock');};sb.addEventListener('mouseleave',un);sb.addEventListener('mouseenter',un);}}else{document.documentElement.classList.remove('nav-lock');}});}
}catch(e){}})();</script>`;

function layout(appName, fnc, active, body, csrf, nonce, extra) {
  const email = fnc?.email || '';
  const role = fnc?.role || '';
  const initial = email.trim().charAt(0).toUpperCase() || 'U';
  const nVencidas = (extra && Number(extra.nVencidas)) || 0;
  const vencidas = (extra && extra.vencidasList) || [];
  const vencItems = vencidas.map((t) =>
    `<a class="hdr-pop-item" href="/dashboard#tarea-${t.id}"><strong>${esc(t.titulo)}</strong><span class="hdr-pop-meta">Límite ${esc(fmtFechaCorta(t.fecha_limite))} · <span class="badge">${esc(t.rol || '')}</span></span></a>`).join('');
  const nNotif = (extra && Number(extra.nNotif)) || 0;
  const notifs = (extra && extra.notifList) || [];
  const notifItems = notifs.map((n) =>
    `<a class="hdr-pop-item" href="${esc(n.url || '#')}" data-notif-read="${n.id}"><strong>${esc(n.titulo)}</strong><span class="hdr-pop-meta">${esc(n.detalle || '')}</span></a>`).join('');
  const csrfField = csrf ? `<input type="hidden" name="_csrf" value="${csrf}">` : '';
  const csrfMetaTag = csrf ? `<meta name="csrf-token" content="${csrf}">` : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${csrfMetaTag}${withNonce(A11Y_HEAD_JS, nonce)}<title>${esc(active)} — ${esc(appName)}</title><link rel="icon" type="image/svg+xml" href="/img/logo-sip-mini.svg"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#6B4A2B"><link rel="stylesheet" href="/css/layout.css?v=20260928-doc"><link rel="stylesheet" href="/css/app.css?v=20260928-doc"></head><body>
<header class="header-fnc"><div class="header-container">
<div style="display:flex;align-items:center;gap:12px;"><div class="header-brand"><img class="brand-logo brand-logo-light" src="/img/logo-fnc-100.png" alt="Comité de Cafeteros del Tolima" height="30"><img class="brand-logo brand-logo-dark" src="/img/logo-fnc-tolima-white.png" alt="Comité de Cafeteros del Tolima" height="26"><span class="brand-divider" aria-hidden="true"></span><div><span class="header-brand-name"><strong>SIP</strong> Sistema de Información de Proyectos</span></div></div></div>
<div class="header-user-profile"><div class="hdr-mail"><a class="hdr-icon" href="/dashboard" aria-label="Notificaciones" title="Tareas vencidas: ir al dashboard">${icon('mail')}${nVencidas > 0 ? `<span class="hdr-badge tnum">${nVencidas > 9 ? '9+' : nVencidas}</span>` : ''}</a><div class="hdr-pop" role="menu" aria-label="Tareas vencidas">${vencItems || '<span class="hdr-pop-empty">Sin vencidas.</span>'}<a class="hdr-pop-all" href="/dashboard">Ver todas</a></div></div><span class="hdr-icon" aria-label="Mensajes" title="Mensajes — próximamente" aria-disabled="true">${icon('chat')}</span><div class="hdr-bell"><a class="hdr-icon" href="#" aria-label="Campana" title="Notificaciones">${icon('campana')}${nNotif > 0 ? `<span class="hdr-badge tnum">${nNotif > 9 ? '9+' : nNotif}</span>` : ''}</a><div class="hdr-pop" role="menu" aria-label="Notificaciones">${notifItems || '<span class="hdr-pop-empty">Sin notificaciones.</span>'}${nNotif > 0 ? '<button type="button" class="hdr-pop-all" data-notif-all>Marcar leídas</button>' : ''}</div></div><div class="user-menu"><button class="user-menu-trigger" aria-haspopup="true" aria-label="Menú de usuario" title="${esc((fnc.displayName || '') + (fnc.email ? ' · ' + fnc.email : ''))}"><span class="user-name">${esc(shownName(fnc))}</span>${fnc?.photo ? `<img class="user-photo" src="${fnc.photo}" alt="${esc(shownName(fnc) || 'Usuario')}">` : `<div class="user-avatar">${esc(initial)}</div>`}</button><div class="user-menu-pop" role="menu"><button class="user-menu-item" data-open-modal="perfil" type="button" role="menuitem">Perfil</button><form method="post" action="/auth/logout" style="margin:0">${csrfField}<button class="user-menu-item" type="submit" role="menuitem">Cerrar Sesión</button></form></div></div></div>
</div></header>
<aside class="app-sidebar" aria-label="Navegacion principal">
<nav class="sidebar-nav">
<span class="sidebar-section-label">Módulos</span>
${navTree(active, role)}
${navConfig(active, role)}
</nav>
<div class="nav-collapse-bar"><button class="nav-collapse-btn" id="navCollapseBtn" aria-label="Contraer menú" title="Contraer / expandir menú"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9.5 3v18"/></svg></button>${a11yControls()}</div>
</aside>
${active === '/dashboard' ? withNonce(NAV_RESET_JS, nonce) : withNonce(NAV_OPEN_JS, nonce)}
<main class="main-container">${body}</main>
${profileModal(csrf)}
${inactivityModal()}
${taskCreateModal()}
${detailDrawer()}
<div class="conn-overlay" id="connOverlay" hidden><div class="modal-card" role="alert"><h2>Sin conexión</h2><p>Se perdió la conexión con el servidor. Reintentando automáticamente…</p><button class="btn-primary" id="connRetry" type="button" style="margin-top:0">Reintentar ahora</button></div></div>
${withNonce(NAV_MEMORY_JS, nonce)}${withNonce(A11Y_JS, nonce)}${withNonce(MODAL_JS, nonce)}${withNonce(DRAWER_JS, nonce)}${withNonce(TASK_CREATE_JS, nonce)}${withNonce(INACTIVITY_JS, nonce)}${withNonce(CRUD_JS, nonce)}${withNonce(PAGER_JS, nonce)}${withNonce(PRINT_JS, nonce)}${withNonce(REGLA_JS, nonce)}${withNonce(DOCEDIT_JS, nonce)}${withNonce(NOTIF_JS, nonce)}${withNonce(PUSH_JS, nonce)}</body></html>`;
}

// Regla de Oro en 2 pasos: paso 1 carga xlsx (tabla % sin valores),
// paso 2 totales por circunscripción → valores por municipio.
function reglaOroView(form, fnc) {
  const { leaf, sub, mod } = form;
  const vy = form.vigencia;
  const valOf = (cod) => (form.valores && form.valores[cod] != null ? Number(form.valores[cod]).toLocaleString('es-CO') : '—');
  const rows = (form.reglaRows || []).map((r) =>
    `<tr><td>${esc(r.municipio_nombre || r.municipio)}</td><td>${esc(r.circ_nombre || '—')}</td><td class="tnum">${(Number(r.regla) * 100).toFixed(2)}%</td><td class="tnum">${valOf(r.municipio)}</td></tr>`).join('');
  const porCirc = {};
  for (const r of (form.reglaRows || [])) {
    const c = r.circ_nombre || '—';
    porCirc[c] = porCirc[c] || { n: 0, suma: 0 };
    porCirc[c].n++;
    porCirc[c].suma += Number(r.regla);
  }
  const circRows = Object.entries(porCirc).map(([c, x]) =>
    `<tr><td>${esc(c)}</td><td class="tnum">${x.n}</td><td class="tnum">${(x.suma * 100).toFixed(2)}%</td></tr>`).join('');
  const verCtl = `<div class="skl-bar"><label class="fld"><span>Ver vigencia</span><input id="reglaVer" type="number" value="${vy}" min="2000" max="2100"></label>
<button class="btn-logout" id="reglaVerGo" type="button" style="padding:10px 20px">Ver</button>
<span style="flex:1"></span><button class="btn-logout" id="reglaPrint" type="button" style="padding:10px 20px">Imprimir</button>
<a class="btn-logout" style="text-decoration:none;display:inline-block;padding:10px 20px" href="/api/regla-oro/xlsx?vigencia=${vy}">Excel</a>
<a class="btn-logout" style="text-decoration:none;display:inline-block;padding:10px 20px" href="/api/regla-oro/pdf?vigencia=${vy}">PDF</a></div>`;
  const cmpForm = `<div class="skl-bar"><label class="fld"><span>Vigencia A</span><input id="reglaCmpA" type="number" value="${vy}" min="2000" max="2100"></label>
<label class="fld"><span>Vigencia B</span><input id="reglaCmpB" type="number" value="${vy + 1}" min="2000" max="2100"></label>
<label class="fld"><span>Vigencia C (opcional)</span><input id="reglaCmpC" type="number" placeholder="—" min="2000" max="2100"></label>
<button class="btn-logout" id="reglaCmpGo" type="button" style="padding:10px 20px">Comparar</button></div><div id="reglaCmpOut"></div>`;
  return `<div class="card form-slot"><p><a href="${tokenFor(mod.path)}">${esc(mod.title)}</a> / ${esc(sub.title)}</p><h2>${esc(leaf.title)} <span class="badge">vigencia ${vy}</span></h2>
<p><span class="badge">solo histórico</span></p>${verCtl}
<h3 class="rail-sub">Porcentajes por municipio (histórico)</h3>
<table class="skl-table"><thead><tr><th>Municipio</th><th>Circunscripción</th><th>Regla</th><th>Valor ${vy}</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Sin regla cargada para la vigencia.</td></tr>'}</tbody></table>
<h3 class="rail-sub">Porcentaje por circunscripción</h3>
<table class="skl-table"><thead><tr><th>Circunscripción</th><th>Municipios</th><th>% total</th></tr></thead><tbody>${circRows || '<tr><td colspan="3">Sin datos.</td></tr>'}</tbody></table>
<h3 class="rail-sub">Comparar vigencias (2 o 3)</h3>${cmpForm}</div>`;
}

function loginPage(appName, kcMode, csrf, reason) {
  const csrfField = csrf ? `<input type="hidden" name="_csrf" value="${csrf}">` : '';
  const notice = reason === 'inactivity'
    ? `<div class="alert-err">Sesión cerrada por inactividad. Ingresa de nuevo.</div>`
    : reason === 'sesion'
      ? `<div class="alert-err">Tu sesión se renovó (reinicio o expiración). Ingresa de nuevo e intenta otra vez.</div>` : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login — ${esc(appName)}</title><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#6B4A2B"><link rel="stylesheet" href="/css/layout.css?v=20260928-doc"><link rel="stylesheet" href="/css/app.css?v=20260928-doc"></head><body>
<main class="main-container" style="margin-left:15px"><div class="card"><div class="login-brand"><img class="brand-logo brand-logo-light" src="/img/logo-fnc-tolima.png" alt="Comité de Cafeteros del Tolima" height="44"><img class="brand-logo brand-logo-dark" src="/img/logo-fnc-tolima-white.png" alt="Comité de Cafeteros del Tolima" height="44"><img class="brand-sip" src="/img/logo-sip.svg" alt="SIP" height="30"></div><h1>${esc(appName)}</h1>
<p>Sistema de Información de Proyectos — gestión e informes contables por periodos.</p>
${notice}
${kcMode
      ? `<a class="btn-primary" href="/auth/app">Continuar con Comit\u00e9 Tolima</a>`
      : `<form method="post" action="/auth/mock" style="margin:0">${csrfField}<button class="btn-primary" type="submit">Continuar con Comit\u00e9 Tolima</button></form><p><span class="badge">mock offline</span> sin Keycloak.</p>`}
<p><a href="#habeasModal">Tratamiento de datos personales</a></p>
</div></main><div class="modal-overlay" id="habeasModal" role="dialog" aria-modal="true" aria-label="Tratamiento de datos"><div class="modal-card"><h2>Tratamiento de datos personales</h2><p>La Federación Nacional de Cafeteros — Comité Departamental del Tolima trata tus datos de identificación y contacto exclusivamente para operar el Sistema de Información de Proyectos (autenticación, auditoría y notificaciones operativas). No se comparten con terceros. Puedes ejercer tus derechos de conocer, actualizar y rectificar ante el Comité.</p><p><a class="btn-primary" href="#">Entendido</a></p></div></div></body></html>`;
}

function rolesMatrix(fnc) {
  const rows = MODULES.map((m) => {
    const ok = canAccess(fnc.role, m);
    const estado = ok ? 'permitido' : (m.nav ? 'deshabilitado' : 'oculto');
    return `<tr><td>${esc(m.title)}</td><td><code>${esc(tokenFor(m.path))}</code></td><td>${esc(m.roles.join(','))}</td><td><span class="badge">${estado}</span></td></tr>`;
  }).join('');
  const leafRows = flattenLeaves().map(({ leaf, sub, mod }) => {
    const ok = canAccess(fnc.role, leaf);
    return `<tr><td>${esc(mod.title)} / ${esc(sub.title)} / ${esc(leaf.title)}</td><td><code>${esc(tokenFor(leaf.path))}</code></td><td>${esc(leaf.roles.join(','))}</td><td><span class="badge">${ok ? 'permitido' : 'deshabilitado'}</span></td></tr>`;
  }).join('');
  return `<div class="card"><h1>Roles</h1>
<p>Tu rol: <strong>${esc(fnc.role)}</strong> · Client roles: <strong>${esc(fnc.roles.join(','))}</strong></p>
<table><thead><tr><th>Módulo</th><th>Ruta</th><th>Roles</th><th>Tu acceso</th></tr></thead><tbody>${rows}</tbody></table>
<h1>Opciones del árbol</h1>
<table><thead><tr><th>Ruta árbol</th><th>Path</th><th>Roles</th><th>Tu acceso</th></tr></thead><tbody>${leafRows}</tbody></table></div>`;
}

function errorPage(fnc, reason) {
  const msgs = { state: 'Sesión de autenticación inválida.', callback: 'No se pudo completar el acceso.', forbidden: 'Sin permiso para este módulo.' };
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Error</title><link rel="stylesheet" href="/css/layout.css?v=20260928-doc"><link rel="stylesheet" href="/css/app.css?v=20260928-doc"></head><body>
<main class="main-container" style="margin-left:15px"><div class="alert-err">${esc(msgs[reason] || msgs.callback)}</div>
<a class="btn-primary" href="/">Reintentar</a></main></body></html>`;
}

const TIPO_LABEL = {
  municipio_actual: 'Municipio · Vigencia actual',
  municipio_anteriores: 'Municipio · Anteriores',
  circunscripcion_actual: 'Circunscripción · Vigencia actual',
  circunscripcion_anteriores: 'Circunscripción · Anteriores',
};

function fmtCOP(n) {
  return '$' + Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

function kpiStrip(saldos) {
  const cards = (saldos || []).map((s) => {
    const pct = Number(s.pct || 0);
    const sem = pct >= 85 ? 'var(--err-ink)' : pct >= 50 ? 'var(--primary-2)' : 'var(--azul-ink)';
    return `<div class="card kpi"><span class="sidebar-section-label">${esc(TIPO_LABEL[s.tipo] || s.tipo)} ${esc(String(s.vigencia))}</span>
<strong class="tnum">${esc(fmtCOP(s.saldo))}</strong>
<span style="color:${sem}" class="tnum">${esc(String(pct))}% ejecutado</span></div>`;
  }).join('');
  return `<div class="kpi-strip">${cards || '<div class="card"><p>Sin distribuciones.</p></div>'}</div>`;
}

const ACTION_LABEL = {
  'login.mock': 'Ingresó (desarrollo)',
  'login.keycloak': 'Ingresó con Comité Tolima',
  logout: 'Cerró sesión',
  'tarea.completar': 'Completó tarea',
  'task.create': 'Creó tarea',
};

function fmtFechaCorta(v) {
  if (!v) return '—';
  const d = new Date(String(v).slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' });
}

function taskCards(fnc, tareas) {
  const today = new Date().toISOString().slice(0, 10);
  const cards = (tareas || []).map((t, i) => {
    const vencida = t.fecha_limite && String(t.fecha_limite).slice(0, 10) < today;
    return `<li class="task-item" id="tarea-${t.id}"><span class="task-num tnum drawer-trigger" data-drawer="tarea" data-id="${t.id}" role="button" tabindex="0" title="Ver detalle">${i + 1}</span><span class="task-body"><strong class="drawer-trigger" data-drawer="tarea" data-id="${t.id}" role="button" tabindex="0" title="Ver detalle">${esc(t.titulo)}${vencida ? ' <span class="badge badge-warn">Vencida</span>' : ''}</strong></span></li>`;
  }).join('');
  const btn = canCreate(fnc) ? `<button class="btn-circle" data-open-modal="tarea-crear" type="button" aria-label="Nueva tarea" title="Nueva tarea">＋</button>` : '';
  return `<div class="tareas-head"><h3 class="rail-sub">Pendientes (${(tareas || []).length})</h3>${btn}</div><ul class="task-list">${cards || '<li class="done-empty">Sin pendientes.</li>'}</ul>`;
}

// Ejercicio completo: últimas tareas hechas (compacto, con quién y cuándo).
function doneList(hechas) {
  const rows = hechas || [];
  const items = rows.map((t) =>
    `<li class="done-item"><span class="done-check drawer-trigger" data-drawer="tarea" data-id="${t.id}" role="button" tabindex="0" title="Ver detalle">${STEP_CHECK_SVG}</span><span class="done-body"><strong>${esc(t.titulo)}</strong><span class="done-meta">${esc(t.hecha_por || '')} · ${esc(fmtFechaHora(t.hecha_at))} · <span class="badge">${esc(t.rol || '')}</span></span></span></li>`).join('');
  return `<h3 class="rail-sub">Completadas (${rows.length})</h3><ul class="done-list">${items || '<li class="done-empty">Sin completadas.</li>'}</ul>`;
}

function fieldInput(f, i) {
  const name = 'f' + i;
  if (f.type === 'select') {
    const opts = (f.options || []).map((o) => `<option>${esc(o)}</option>`).join('');
    return `<label class="fld"><span>${esc(f.label)}</span><select name="${name}" disabled><option value="">—</option>${opts}</select></label>`;
  }
  return `<label class="fld"><span>${esc(f.label)}</span><input name="${name}" type="${esc(f.type || 'text')}" disabled></label>`;
}

function fieldsOrDefault(leaf) {
  return leaf.fields && leaf.fields.length ? leaf.fields : [{ label: 'Código', type: 'text' }, { label: 'Nombre', type: 'text' }];
}

function skeletonMaestro(leaf) {
  const fields = fieldsOrDefault(leaf);
  const head = fields.map((f) => `<th>${esc(f.label)}</th>`).join('');
  const body = fields.map((f) => fieldInput(f, fields.indexOf(f))).join('');
  return `<div class="skl-bar"><input type="search" placeholder="Buscar…" disabled aria-label="Buscar"></div>
<table class="skl-table"><thead><tr>${head}<th>Acciones</th></tr></thead><tbody><tr><td colspan="${fields.length + 1}">Sin registros (skeleton).</td></tr></tbody></table>
<form class="skl-form"><fieldset disabled><legend>Nuevo registro</legend><div class="fld-grid">${body}</div><button class="btn-primary" type="button" disabled>Guardar (Fase 2)</button></fieldset></form>`;
}

function informePage(hit, query, data, inf) {
  const { leaf, sub, mod } = hit;
  const flds = ((inf && inf.filters) || []).map((f) => {
    const v = query[f.name] != null ? String(query[f.name]) : '';
    const t = f.type === 'number' ? 'number' : 'text';
    return `<label class="fld"><span>${esc(f.label)}</span><input name="${esc(f.name)}" type="${t}" value="${esc(v)}"></label>`;
  }).join('');
  const head = data.cols.map((c) => `<th>${esc(c)}</th>`).join('');
  const bodyRows = data.rows.map((r) =>
    `<tr>${data.cols.map((c) => `<td class="tnum">${esc(r[c] == null ? '' : String(r[c]))}</td>`).join('')}</tr>`).join('');
  const qs = new URLSearchParams();
  for (const k of Object.keys(query)) {
    if (['tipo', 'ano', 'municipio'].includes(k) && query[k] !== '') qs.set(k, String(query[k]));
  }
  const exp = `/api/informes/${esc(inf.id)}${qs.toString() ? '/xlsx?' + qs.toString() : '/xlsx'}`;
  const fTxt = [];
  if (query.tipo) fTxt.push(`Tipo: ${query.tipo}`);
  if (query.ano) fTxt.push(`Año: ${query.ano}`);
  if (query.municipio) fTxt.push(`Municipio: ${query.municipio}`);
  return `<div class="card form-slot"><p><a href="${tokenFor(mod.path)}">${esc(mod.title)}</a> / ${esc(sub.title)}</p><h2>${esc(leaf.title)}</h2>
<div class="print-only"><strong>SIP-FNC · Sistema de Información de Proyectos</strong><br>${esc(leaf.title)} · ${esc(fTxt.length ? fTxt.join(' · ') : 'Sin filtros')} · ${esc(fmtFechaHora(new Date()))} · ${data.rows.length} filas</div>
<form method="get" action=""><div class="skl-bar">${flds}<button class="btn-primary" type="submit" style="margin-top:0">Filtrar</button><a class="btn-logout" style="text-decoration:none;display:inline-block;padding:10px 20px" href="${exp}">Exportar Excel</a><button class="btn-logout" id="btnImprimir" type="button" style="padding:10px 20px">Imprimir</button></div></form>
<table class="skl-table"><thead><tr>${head}</tr></thead><tbody>${bodyRows || `<tr><td colspan="${data.cols.length}">Sin resultados.</td></tr>`}</tbody></table>
<p><span class="badge tnum">${data.rows.length} filas</span></p></div>`;
}

function skeletonInforme(leaf) {
  return `<div class="skl-bar"><label class="fld"><span>Filtro</span><input type="text" disabled></label>
<button class="btn-primary" type="button" disabled>Generar (Fase 2)</button></div>
<table class="skl-table"><thead><tr><th>${esc(leaf.title)}</th></tr></thead><tbody><tr><td>Sin resultados (skeleton).</td></tr></tbody></table>`;
}

function skeletonProceso(leaf, sub) {
  return `<p>${esc(sub.desc || '')}</p>
<div class="skl-bar"><button class="btn-primary" type="button" disabled>Ejecutar (Fase 2)</button></div>
<div class="skl-progress"><span style="width:0%"></span></div>
<p><span class="badge">skeleton</span> Sin ejecuciones registradas.</p>`;
}

function skeletonConsulta(leaf) {
  return `<div class="skl-bar"><input type="search" placeholder="Buscar ${esc(leaf.title.toLowerCase())}…" disabled aria-label="Buscar"></div>
<p><span class="badge">skeleton</span> Sin resultados.</p>`;
}

// Subcategoría por pestañas (Configuración): barra server-rendered; la pestaña
// activa es la hoja actual y las demás navegan a sus ?f=. Sin JS ni CRUD doble.
function configTabs(sub, leaf, role) {
  const tabs = (sub.children || []).map((l) => {
    const tok = tokenFor(l.path).replace('/v/', '');
    const href = `${tokenFor('/dashboard')}?f=${encodeURIComponent(tok)}`;
    if (!canAccess(role, l)) return `<span class="cfg-tab cfg-disabled" title="Sin permiso">🔒 ${esc(l.title)}</span>`;
    return `<a class="cfg-tab${leaf && leaf.path === l.path ? ' active' : ''}" href="${href}">${esc(l.title)}</a>`;
  }).join('');
  return `<div class="cfg-tabs" role="tablist" aria-label="${esc(sub.title)}">${tabs}</div>`;
}

// Tabs de la vista unificada Distribuciones (server-rendered, como configTabs).
function distTabUrl(vy, tab) {
  const tok = tokenFor('/distribucion/actualizaciones/distribuciones').replace('/v/', '');
  return `${tokenFor('/dashboard')}?f=${encodeURIComponent(tok)}&tab=${tab}&vigencia=${vy}`;
}
function distTabs(form) {
  const tab = form.tab || 'mpio';
  const tok = tokenFor('/distribucion/actualizaciones/distribuciones').replace('/v/', '');
  const base = `${tokenFor('/dashboard')}?f=${encodeURIComponent(tok)}&vigencia=${form.vigSel}`;
  const defs = [['carga', 'Carga'], ['mpio', 'Por municipio'], ['circ', 'Por circunscripción'], ['hist', 'Histórico']];
  const items = defs.map(([k, t]) => (tab === k
    ? `<span class="cfg-tab active">${t}</span>`
    : `<a class="cfg-tab" href="${base}&tab=${k}">${t}</a>`)).join('');
  return `<div class="cfg-tabs" role="tablist" aria-label="Distribuciones">${items}</div>`;
}

// Tablas documento Distribución (formato .xlsx) + 3 escenarios por vigencia.
// anterior: histórico año+tipo con sobrante y acumulado · actual: checklist +
// tabla · siguiente: % por municipio. DISTRIBUCIÓN = % × monto global,
// CREADAS = valores cargados, SALDO = DISTRIBUCIÓN − CREADAS, en centavos exactos.
// Encabezado compartido de la vista unificada: h2 + membrete colapsable +
// vigencia (3 atajos + input) + banner msg + tab bar. Abre la card (cierra el llamador).
// Sin breadcrumb a rutas superiores.
function docHead(form) {
  const vy = form.vigSel;
  const yNow = new Date().getFullYear();
  const leafTok = tokenFor('/distribucion/actualizaciones/distribuciones').replace('/v/', '');
  const curTab = form.tab || 'mpio';
  const shorts = [yNow - 2, yNow - 1, yNow + 1].map((y) => (y === vy
    ? `<span class="cfg-tab active">${y}</span>`
    : `<a class="cfg-tab" href="${distTabUrl(y, curTab)}">${y}</a>`)).join('');
  const sel = `<div class="vig-row"><div class="vig-shortcuts" role="group" aria-label="Vigencias">${shorts}</div><form method="get" action="${tokenFor('/dashboard')}"><input type="hidden" name="f" value="${leafTok}"><input type="hidden" name="tab" value="${curTab}"><label class="fld"><span>Año</span><input name="vigencia" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="${vy}" aria-label="Año de vigencia"></label><button class="btn-primary" type="submit" style="margin-top:0">Ver</button></form></div>`;
  const membrete = `<details class="doc-membrete"><summary>FEDERACION NACIONAL DE CAFETEROS DE COLOMBIA - COMITE TOLIMA</summary><div class="doc-head"><strong>FEDERACION NACIONAL DE CAFETEROS DE COLOMBIA - COMITE TOLIMA</strong><br>LEY 863 DE 2003 TRANSFERENCIA ${vy}<br>OBRAS DE INFRAESTRUCTURA<br>DISTRIBUCION No. <span class="doc-blank">______</span> SEGÚN ACTA <span class="doc-blank">______</span> DE <span class="doc-blank">______</span></div></details>`;
  const msg = form.msg ? (form.msgOk
    ? `<p><span class="badge">${esc(form.msg)}</span></p>`
    : `<div class="alert-err">${esc(form.msg)}</div>`) : '';
  return `<div class="card form-slot dist-view"><div class="dist-title"><h2>Distribuciones <span class="badge">vigencia ${vy}</span></h2>${sel}</div>${membrete}${msg}${distTabs(form)}`;
}

// Une regla (%) + valores por municipio, agrupado por circunscripción.
function docDatos(form) {
  const byMun = {};
  for (const r of (form.doc.regla || [])) {
    byMun[r.municipio] = { nombre: r.municipio_nombre || r.municipio, circ: r.circ_nombre || '—', pct: Number(r.regla), asig: 0 };
  }
  for (const v of (form.doc.valores || [])) {
    byMun[v.municipio] = byMun[v.municipio] || { nombre: v.municipio_nombre || v.municipio, circ: v.circ_nombre || '—', pct: null };
    byMun[v.municipio].asig = Number(v.total);
  }
  return byMun;
}

// Monto global (asignado) de la vista documento para la vigencia: fila de
// distribuciones con tipo {kind}_actual/_anteriores. Null si no existe.
function docTotalFor(form, kind) {
  const mm = (form.doc && form.doc.montos) || [];
  const vy = Number(form.vigSel);
  const yNow = new Date().getFullYear();
  const suf = vy === yNow ? '_actual' : '_anteriores';
  const hit = mm.find((r) => r.tipo === `${kind}${suf}` && Number(r.vigencia) === vy)
    || mm.find((r) => String(r.tipo || '').startsWith(kind) && Number(r.vigencia) === vy);
  return hit ? Number(hit.asignado) : null;
}

// Centavos exactos: la aritmética monetaria se hace en enteros (cents);
// cada valor se redondea una sola vez a centavos y las sumas son Σ exactas.
const CENTS = (n) => Math.round((Number(n) || 0) * 100);
const fmtCents = (c) => (c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

// Tablas documento Distribución (formato .xlsx): columnas MUNICIPIO | SICA 2005 |
// DISTRIBUCIÓN (% × monto global) | ASIGNACIONES CREADAS (valores cargados) |
// SALDO DISPONIBLE (DISTRIBUCIÓN − CREADAS). Sin fila-grupo: tras cada bloque
// va la fila «Circunscripción X» y al final TOTAL. En modo circ las filas
// municipio dejan DISTRIBUCIÓN y SALDO en blanco (calcado del xlsx).
const docThead = `<thead><tr><th>MUNICIPIO</th><th>SICA 2005</th><th>DISTRIBUCIÓN</th><th>ASIGNACIONES CREADAS</th><th>SALDO DISPONIBLE</th></tr></thead>`;
const docColGroup = `<colgroup><col style="width:30ch"><col style="width:11ch"><col style="width:18ch"><col style="width:18ch"><col style="width:18ch"></colgroup>`;
function docTablaFrom(byMun, opts) {
  const { total, circ, edit, ano } = opts || {};
  const circs = {};
  for (const [cod, m] of Object.entries(byMun)) {
    (circs[m.circ] = circs[m.circ] || []).push({ cod, ...m });
  }
  const pctTxt = (p) => (p == null ? '' : (p * 100).toFixed(2) + ' %');
  let body = '', tP = 0, tD = 0, tC = 0, tBlank = total == null;
  for (const [c, items] of Object.entries(circs)) {
    let sp = 0, sd = 0, sc = 0, bBlank = total == null;
    for (const x of items) {
      const creadas = CENTS(x.asig);
      const dist = (x.pct == null || total == null) ? null : CENTS(x.pct * total);
      const saldo = dist == null ? null : dist - creadas;
      if (dist == null) { bBlank = true; tBlank = true; }
      if (x.pct != null) sp += x.pct;
      if (dist != null) sd += dist;
      sc += creadas;
      const dCol = circ ? '' : (dist == null ? '' : fmtCents(dist));
      const sCol = circ ? '' : (saldo == null ? '' : fmtCents(saldo));
      const cellId = `doccre-${x.cod}-${ano}`;
      const editBtn = edit ? ` <button type="button" class="doc-edit" data-docedit="creada" data-cell="${cellId}" data-ano="${ano}" data-mun="${esc(x.cod)}" title="Editar valor" aria-label="Editar valor de ${esc(x.nombre)}">✎</button>` : '';
      body += `<tr><td>${esc(x.nombre)}</td><td class="n">${pctTxt(x.pct)}</td><td class="n">${dCol}</td><td class="n" id="${cellId}"><span class="doc-val">${fmtCents(creadas)}</span>${editBtn}</td><td class="n">${sCol}</td></tr>`;
      if (x.pct != null) tP += x.pct;
      if (dist != null) tD += dist;
      tC += creadas;
    }
    const sD = bBlank ? '' : fmtCents(sd);
    const sS = bBlank ? '' : fmtCents(sd - sc);
    body += `<tr class="doc-sub"><td><strong>Circunscripción ${esc(c)}</strong></td><td class="n"><strong>${(sp * 100).toFixed(2)} %</strong></td><td class="n"><strong>${sD}</strong></td><td class="n"><strong>${fmtCents(sc)}</strong></td><td class="n"><strong>${sS}</strong></td></tr>`;
  }
  const tDv = tBlank ? '' : fmtCents(tD);
  const tSv = tBlank ? '' : fmtCents(tD - tC);
  body += `<tr class="doc-tot"><td><strong>TOTAL</strong></td><td class="n"><strong>${(tP * 100).toFixed(2)} %</strong></td><td class="n"><strong>${tDv}</strong></td><td class="n"><strong>${fmtCents(tC)}</strong></td><td class="n"><strong>${tSv}</strong></td></tr>`;
  return `<table class="skl-table doc-table">${docColGroup}${docThead}<tbody>${body}</tbody></table>`;
}

function docIncompleto(msg) {
  return `<table class="skl-table doc-table">${docColGroup}${docThead}<tbody><tr><td colspan="5">${esc(msg)}</td></tr></tbody></table>`;
}

// Pie del documento (formato .xps): fecha de emisión + página.
function docFoot() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const fecha = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
  return `<div class="doc-foot"><span>${fecha}</span><span>1</span></div>`;
}

function docHistorial(form) {
  const escN = (n) => esc(fmtCOP(n));
  const yNow = new Date().getFullYear();
  let acc = 0, hbody = '';
  for (const h of (form.doc.historial || []).filter((x) => Number(x.vigencia) < yNow)) {
    const as = Number(h.asignado), ej = Number(h.ejecutado), sob = as - ej;
    acc += sob;
    hbody += `<tr><td class="tnum">${esc(h.vigencia)}</td><td>${esc(h.tipo)}</td><td class="tnum">${escN(as)}</td><td class="tnum">${escN(ej)}</td><td class="tnum">${escN(sob)}</td><td class="tnum"><strong>${escN(acc)}</strong></td></tr>`;
  }
  const hist = hbody
    ? `<table class="skl-table"><thead><tr><th>Año</th><th>Tipo</th><th>Asignado</th><th>Ejecutado</th><th>Sobrante año</th><th>Sobrante acumulado</th></tr></thead><tbody>${hbody}</tbody></table><p><span class="badge">Sobrante por circunscripción no disponible (sin ejecutado por circunscripción)</span></p>`
    : `<table class="skl-table"><thead><tr><th>Año</th><th>Tipo</th><th>Asignado</th><th>Ejecutado</th><th>Sobrante año</th><th>Sobrante acumulado</th></tr></thead><tbody><tr><td colspan="6">Sin histórico de vigencias anteriores.</td></tr></tbody></table>`;
  return `<h3 class="rail-sub">Histórico + sobrante acumulado</h3>${hist}`;
}

function cargaUrl(vy) {
  const tok = tokenFor('/distribucion/actualizaciones/distribuciones').replace('/v/', '');
  return `${tokenFor('/dashboard')}?f=${encodeURIComponent(tok)}&tab=carga&vigencia=${vy}`;
}

// Formularios de carga (paso 1 + paso 2) reutilizados en el tab Carga.
// La vigencia es la seleccionada arriba (inputs ocultos, sin re-selección).
// Condicionales por etapa con datos reales: paso 1 muestra estado + reemplazo;
// paso 2 requiere regla y resume los valores ya asignados.
function reglaCargaForms(form) {
  const vy = form.vigSel;
  const canW = form.perms && form.perms.w;
  const d = form.doc || {};
  const nRegla = (d.regla || []).length;
  const vals = d.valores || [];
  const mpioUrl = distTabUrl(vy, 'mpio');
  const upForm = !canW ? '' : `${d.hayRegla ? `<p><span class="badge">Regla ${vy} cargada: ${nRegla} municipios.</span> Para reemplazarla vuelve a subir el archivo.</p>` : ''}<div class="skl-bar"><input id="reglaVig" type="hidden" value="${vy}">
<label class="fld"><span>Archivo xlsx (REGLA DE ORO)</span><input id="reglaFile" type="file" accept=".xlsx"></label>
<button class="btn-primary" id="reglaUp" type="button" style="margin-top:0">Paso 1 · ${d.hayRegla ? 'Reemplazar regla' : 'Cargar regla'}</button></div>`;
  const goForm = !canW ? `<p><span class="badge">solo lectura</span></p>`
    : !d.hayRegla ? `<p><span class="badge badge-warn">Completa el paso 1 para la vigencia ${vy}.</span></p>`
    : `${d.hayValores ? `<p><span class="badge">Valores ${vy}: ${vals.length} municipios.</span> <a href="${mpioUrl}">Ver en Por municipio</a></p>` : ''}<div class="skl-bar"><label class="fld"><span>Valor total sumatoria de vigencia para Municipios</span><input id="reglaTotalMun" type="number" min="0" step="0.01" placeholder="0"></label>
<input id="reglaVig2" type="hidden" value="${vy}">
<button class="btn-primary" id="reglaGoAsk" type="button" style="margin-top:0">Paso 2 · Asignar valores</button></div>
<div class="modal-overlay" id="reglaConfirmModal" hidden><div class="modal-card" role="dialog" aria-modal="true" aria-label="Confirmar asignación automática"><h2>Confirmar asignación automática</h2><p>Se distribuirán <strong class="tnum" id="reglaConfirmTotal">—</strong> entre <strong>${nRegla} municipios</strong> de la vigencia ${vy} según la Regla de Oro.</p><p>Esta va a ser distribuida por todos los municipios automáticamente, municipio por municipio.</p><button class="btn-primary" id="reglaGo" type="button">Confirmar y asignar</button> <button type="button" id="reglaGoNo">Cancelar</button></div></div>`;
  return { upForm, goForm };
}

// Monto global editable del tab (reemplaza la tarjeta «Editar montos globales»):
// muestra el asignado de distribuciones para (kind, vigencia) con botón
// Editar (PUT) o Fijar monto (POST) cuando falta. Solo con permiso de escritura.
function docMontoLine(form, kind) {
  const vy = form.vigSel;
  const canW = form.perms && form.perms.w;
  const label = kind === 'municipio' ? 'Municipio' : 'Circunscripción';
  const mm = (form.doc && form.doc.montos) || [];
  const yNow = new Date().getFullYear();
  const tipo = `${kind}${vy === yNow ? '_actual' : '_anteriores'}`;
  const hit = mm.find((r) => r.tipo === tipo && Number(r.vigencia) === vy)
    || mm.find((r) => String(r.tipo || '').startsWith(kind) && Number(r.vigencia) === vy);
  const cellId = `docmonto-${kind}-${vy}`;
  const valHtml = hit ? fmtCents(CENTS(hit.asignado)) : '—';
  let btn = '';
  if (canW) {
    btn = hit
      ? ` <button type="button" class="doc-edit" data-docedit="monto" data-cell="${cellId}" data-id="${hit.id}" title="Editar monto global" aria-label="Editar monto global">✎ Editar</button>`
      : ` <button type="button" class="doc-edit" data-docedit="monto" data-cell="${cellId}" data-tipo="${tipo}" data-vig="${vy}" title="Fijar monto global" aria-label="Fijar monto global">✎ Fijar monto</button>`;
  }
  return `<p class="doc-monto" id="${cellId}-line">Monto global · ${label} ${vy}: <strong id="${cellId}"><span class="doc-val">${valHtml}</span></strong>${btn}</p><p id="docEditMsg" class="drawer-msg"></p>`;
}

// Pasos para completar la vigencia (1 regla → 2 monto → 3 valores),
// con estado real y CTA al pendiente. Se muestra en los tabs de datos.
function docPasos(form) {
  const vy = form.vigSel;
  const d = form.doc || {};
  const nRegla = (d.regla || []).length;
  const nVal = (d.valores || []).length;
  const steps = [
    { ok: !!d.hayRegla, t: `1 · Regla de Oro ${vy}${d.hayRegla ? ` (${nRegla} municipios)` : ''}`, href: distTabUrl(vy, 'carga') },
    { ok: !!d.hayMontos, t: '2 · Monto global', href: `${distTabUrl(vy, 'mpio')}#docmonto-municipio-${vy}-line` },
    { ok: !!d.hayValores, t: `3 · Valores individuales${d.hayValores ? ` (${nVal} municipios)` : ''}`, href: distTabUrl(vy, 'carga') },
  ];
  const done = steps.filter((s) => s.ok).length;
  const items = steps.map((s) => `<li class="${s.ok ? 'ok' : 'todo'}">${s.ok ? '✓' : '○'} ${esc(s.t)}${s.ok ? '' : ` — <a href="${s.href}">completar</a>`}</li>`).join('');
  const badge = done === steps.length
    ? '<span class="badge">Vigencia completa ✓</span>'
    : `<span class="badge badge-warn">Faltan ${steps.length - done} de ${steps.length} pasos</span>`;
  return `<h3 class="rail-sub">Pasos vigencia ${vy} ${badge}</h3><ol class="doc-pasos">${items}</ol>`;
}

// Vista unificada Distribuciones: tabs carga/mpio/circ/hist en una sola card.
// Sin paginación en las tablas documento; valores editables en línea
// (botón ✎ por fila de municipio y en la línea de monto global).
function distribucionesView(form, fnc) {
  const vy = form.vigSel;
  const tab = form.tab || 'mpio';
  const canW = form.perms && form.perms.w;
  const head = docHead(form);
  if (tab === 'carga') {
    const { upForm, goForm } = reglaCargaForms(form);
    return `${head}<h3 class="rail-sub">Carga por vigencia</h3>${docPasos(form)}<p id="reglaMsg" class="drawer-msg"></p>${upForm}${goForm}</div>`;
  }
  if (tab === 'hist') {
    return `${head}${docHistorial(form)}</div>`;
  }
  if (tab === 'mpio') {
    const dOpts = { total: docTotalFor(form, 'municipio'), circ: false, edit: canW, ano: vy };
    return `${head}${docMontoLine(form, 'municipio')}<h3 class="rail-sub">Por municipio</h3>${docTablaFrom(docDatos(form), dOpts)}${docFoot()}</div>`;
  }
  const cOpts = { total: docTotalFor(form, 'circunscripcion'), circ: true, edit: false, ano: vy };
  return `${head}${docMontoLine(form, 'circunscripcion')}${docEscenarios(form, cOpts)}${docFoot()}</div>`;
}

// Escenarios de la vista unificada: anterior (histórico), actual (checklist +
// tabla), siguiente (%). Reutiliza docTablaFrom/docHistorial/docIncompleto
// con las opciones del tab circ (blancos municipio).
function docEscenarios(form, opts) {
  const vy = form.vigSel;
  const yNow = new Date().getFullYear();
  const d = form.doc;
  if (vy < yNow) {
    return `<h3 class="rail-sub">Vigencias anteriores</h3><p>Consulta el <a href="${distTabUrl(vy, 'hist')}">Histórico + sobrante acumulado</a>.</p>`;
  }
  if (vy > yNow) {
    const hay = (d.regla || []).length > 0;
    const pct = hay ? docTablaFrom(docDatos(form), opts) : docIncompleto(`Sin regla para ${vy}: cárgala en Regla de Oro.`);
    const link = `<p><a class="btn-primary" href="${cargaUrl(vy)}">Cargar regla ${vy}</a></p>`;
    return `<h3 class="rail-sub">Porcentajes vigencia siguiente</h3>${link}${pct}`;
  }
  // Actual: checklist + tabla (o marco de incompletos).
  const chk = (ok, txt) => `<li>${ok ? '✓' : '✗'} ${txt}</li>`;
  const check = `<ul class="check-list">${chk(d.hayRegla, 'Regla cargada' + (d.hayRegla ? '' : ' — <a href="' + cargaUrl(vy) + '">cargarla</a>'))}${chk(d.hayMontos, 'Montos globales (distribuciones)')}${chk(d.hayValores, 'Valores por municipio')}</ul>`;
  if (!d.hayRegla && !d.hayMontos && !d.hayValores) {
    return `<h3 class="rail-sub">Estado vigencia actual</h3>${check}${docIncompleto(`Datos incompletos para la vigencia actual (${vy}).`)}`;
  }
  return `<h3 class="rail-sub">Estado vigencia actual</h3>${check}${docTablaFrom(docDatos(form), opts)}`;
}

function formSlot(form, fnc) {
  if (!form) {
    return `<div class="card form-slot"><h2>Formularios</h2><p>Selecciona una opción del nav izquierdo: los formularios pequeños se abren aquí; los informes tienen vista propia.</p></div>`;
  }
  const { leaf, sub, mod } = form;
  const tabs = sub.tabs ? configTabs(sub, leaf, fnc?.role) : '';
  if (leaf.crud === 'distribuciones') {
    if (!form.rows) return '';
    return distribucionesView(form, fnc);
  }
  if (leaf.reglaOro) return reglaOroView(form, fnc);
  if (leaf.crud && form.rows) return `<div class="card form-slot"><p><a href="${tokenFor(mod.path)}">${esc(mod.title)}</a> / ${esc(sub.title)}</p>${tabs}<h2>${esc(leaf.title)}</h2>${crudMaestro(leaf, form)}</div>`;
  const kinds = { maestro: skeletonMaestro, informe: skeletonInforme, proceso: skeletonProceso, consulta: skeletonConsulta };
  const render = kinds[sub.kind] || skeletonMaestro;
  const body = sub.kind === 'info'
    ? `<p><a class="btn-primary" href="${tokenFor(leaf.path)}">Abrir ${esc(leaf.title)}</a></p>`
    : render(leaf, sub);
  return `<div class="card form-slot"><p><a href="${tokenFor(mod.path)}">${esc(mod.title)}</a> / ${esc(sub.title)}</p>${tabs}<h2>${esc(leaf.title)}</h2>${body}</div>`;
}

// CRUD funcional de maestros (Fase 2): tabla + alta/edición + borrado con guards.
function crudField(f, catalogs) {
  const norm = String(f.label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (norm === 'circunscripcion' && catalogs.circunscripcion) {
    const opts = catalogs.circunscripcion.map((c) => `<option value="${esc(c.codigo)}">${esc(c.codigo)} — ${esc(c.nombre)}</option>`).join('');
    return `<label class="fld"><span>Circunscripción</span><select id="crud-circunscripcion"><option value="">—</option>${opts}</select></label>`;
  }
  if (norm === 'municipio' && catalogs.municipio) {
    const opts = catalogs.municipio.map((c) => `<option value="${esc(c.codigo)}">${esc(c.codigo)} — ${esc(c.nombre)}</option>`).join('');
    return `<label class="fld"><span>Municipio</span><select id="crud-municipio"><option value="">—</option>${opts}</select></label>`;
  }
  if (f.type === 'select') {
    const opts = (f.options || []).map((o) => `<option>${esc(o)}</option>`).join('');
    return `<label class="fld"><span>${esc(f.label)}</span><select id="crud-${esc(f.label)}"><option value="">—</option>${opts}</select></label>`;
  }
  const t = f.type === 'number' ? 'number' : 'text';
  return `<label class="fld"><span>${esc(f.label)}</span><input id="crud-${esc(f.label)}" type="${t}"></label>`;
}

function crudMaestro(leaf, form) {
  const perms = form.perms || {};
  const allCols = Object.keys((form.rows && form.rows[0]) || { codigo: '', nombre: '' });
  // Oculta el pk interno (id numérico) para alinear columnas con el formulario;
  // codigo sí se muestra porque es dato editable/visible.
  const cols = allCols.filter((c) => c === 'codigo' || c !== (form.pkCol || 'codigo'));
  const head = cols.map((c) => `<th>${esc(c)}</th>`).join('');
  const bodyRows = (form.rows || []).map((r) => {
    const tds = cols.map((c) => `<td class="tnum">${esc(r[c] == null ? '' : String(r[c]))}</td>`).join('');
    const pkv = form.pkCol ? r[form.pkCol] : r.codigo;
    const pk = esc(pkv ?? '');
    const edit = perms.w ? `<button class="stepper-button" data-crud-edit="${pk}" type="button">Editar</button>` : '';
    const del = perms.d ? `<button class="stepper-button" data-crud-del="${pk}" type="button">Borrar</button>` : '';
    return `<tr data-crud-row="${pk}">${tds}<td>${edit} ${del}</td></tr>`;
  }).join('');
  const fields = (leaf.fields || []).map((f) => crudField(f, form.catalogs || {})).join('');
  const save = perms.w ? `<button class="btn-primary" id="crudGuardar" data-crud-id="${esc(leaf.crud)}" type="button" style="margin-top:0">Guardar</button>` : `<p><span class="badge">solo lectura</span></p>`;
  return `<p id="crudMsg" class="drawer-msg"></p>
<table class="skl-table"><thead><tr>${head}<th>Acciones</th></tr></thead><tbody>${bodyRows || `<tr><td colspan="${cols.length + 1}">Sin registros.</td></tr>`}</tbody></table>
<div class="fld-grid">${fields}</div>${save}`;
}

const CRUD_JS = `<script>(function(){try{
function csrfH(){try{var m=document.querySelector('meta[name="csrf-token"]');return m?m.getAttribute('content')||'':'';}catch(e){return '';}}
function msg(t){var m=document.getElementById('crudMsg');if(m)m.textContent=t||'';}
function val(id){var el=document.getElementById(id);return el?el.value.trim().toUpperCase():'';}
function collect(){var map={'código':'codigo','nombre':'nombre','circunscripción':'circunscripcion','tipo':'tipo','año':'vigencia','presupuesto':'asignado','número':'numero','numero':'numero','ppto':'ppto','municipio':'municipio','valor':'valor','ejecutado':'ejecutado','ano':'ano'};var o={};document.querySelectorAll('.form-slot .fld-grid .fld').forEach(function(l){var s=l.querySelector('span');var i=l.querySelector('input,select');if(s&&i){var k=map[s.textContent.trim().toLowerCase()]||s.textContent.trim().toLowerCase();o[k]=i.value.trim();}});return o;}
var g=document.getElementById('crudGuardar');
if(g)g.addEventListener('click',function(){
var id=g.getAttribute('data-crud-id');var editPk=g.getAttribute('data-edit-pk')||'';
var body=collect();if(id==='distribucion-municipio'&&body.vigencia!==undefined){body.ano=body.vigencia;delete body.vigencia;}var method=editPk?'PUT':'POST';var url='/api/maestros/'+id+(editPk?'/'+encodeURIComponent(editPk):'');
msg('Guardando…');
fetch(url,{method:method,headers:{'Content-Type':'application/json','x-csrf-token':csrfH()},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(d){return {s:r.status,d:d};});}).then(function(x){
if(x.d&&x.d.ok){window.location.reload();return;}
msg((x.d&&(x.d.error||x.d.msg))||('Error '+x.s+'.'));
}).catch(function(){msg('Error de red.');});
});
document.querySelectorAll('[data-crud-edit]').forEach(function(b){b.addEventListener('click',function(){
var pk=b.getAttribute('data-crud-edit');var row=document.querySelector('tr[data-crud-row="'+pk+'"]');
if(row){var cells=row.querySelectorAll('td');var labels=document.querySelectorAll('.form-slot .fld-grid .fld span');cells.forEach(function(c,i){if(i<labels.length){var inp=labels[i].parentElement.querySelector('input,select');if(inp)inp.value=c.textContent.trim();}});}
var gg=document.getElementById('crudGuardar');if(gg){gg.setAttribute('data-edit-pk',pk);gg.textContent='Actualizar';}
msg('Editando '+pk+' (código inmutable).');
});});
document.querySelectorAll('[data-crud-del]').forEach(function(b){b.addEventListener('click',function(){
var pk=b.getAttribute('data-crud-del');
if(!window.confirm('¿Borrar '+pk+'?'))return;
var id=(document.getElementById('crudGuardar')||{}).getAttribute?document.getElementById('crudGuardar').getAttribute('data-crud-id'):'';
var parts=window.location.search.match(/f=([^&]+)/);var leafId=id;
msg('Borrando…');
fetch('/api/maestros/'+leafId+'/'+encodeURIComponent(pk),{method:'DELETE',headers:{'x-csrf-token':csrfH()}}).then(function(r){return r.json().then(function(d){return {s:r.status,d:d};});}).then(function(x){
if(x.d&&x.d.ok){window.location.reload();return;}
msg((x.d&&(x.d.error||x.d.msg))||('Error '+x.s+'.'));
}).catch(function(){msg('Error de red.');});
});});
}catch(e){}})();</script>`;

const PAGER_JS = `<script>(function(){try{
var PER=9;
document.querySelectorAll('table.skl-table:not(.doc-table)').forEach(function(tbl){
var rows=tbl.querySelectorAll('tbody tr');
if(rows.length<=PER)return;
var pages=Math.ceil(rows.length/PER),cur=0;
var bar=document.createElement('div');bar.className='skl-pager';
bar.innerHTML='<button type="button" data-pg-prev>« Anterior</button><span class="tnum" data-pg-count></span><button type="button" data-pg-next>Siguiente »</button>';
tbl.parentNode.insertBefore(bar,tbl.nextSibling);
function render(){
rows.forEach(function(r,i){r.style.display=(i>=cur*PER&&i<(cur+1)*PER)?'':'none';});
var c=bar.querySelector('[data-pg-count]');if(c)c.textContent=(cur+1)+' / '+pages;
var p=bar.querySelector('[data-pg-prev]'),n=bar.querySelector('[data-pg-next]');
if(p)p.disabled=cur===0;if(n)n.disabled=cur===pages-1;
}
bar.querySelector('[data-pg-prev]').addEventListener('click',function(){if(cur>0){cur--;render();}});
bar.querySelector('[data-pg-next]').addEventListener('click',function(){if(cur<pages-1){cur++;render();}});
render();
});
}catch(e){}})();</script>`;

// PWA + Web Push (skill fnc-pwa-webpush, variante vanilla): registro del SW,
// captura global de beforeinstallprompt (UI estable en el perfil, sin banner
// flotante) y consentimiento activar/desactivar idempotente. Sin inline onclick.
const PUSH_JS = `<script>(function(){try{
function csrfH(){try{var m=document.querySelector('meta[name="csrf-token"]');return m?m.getAttribute('content')||'':'';}catch(e){return '';}}
function pmsg(t){var m=document.getElementById('pushStatus');if(m){m.textContent=t||'';}}
function b64(s){var p=(s||'').replace(/-/g,'+').replace(/_/g,'/');while(p.length%4){p+='=';}var b=atob(p);var o=new Uint8Array(b.length);for(var i=0;i<b.length;i++){o[i]=b.charCodeAt(i);}return o;}
var deferredPrompt=null;
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredPrompt=e;var b=document.getElementById('pushInstallBtn');if(b){b.hidden=false;}});
if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}
function paint(on,unsupported){
var onB=document.getElementById('pushOnBtn'),offB=document.getElementById('pushOffBtn');
if(unsupported){pmsg('Este navegador no soporta push.');if(onB)onB.hidden=true;if(offB)offB.hidden=true;return;}
if(onB)onB.hidden=!!on;if(offB)offB.hidden=!on;
pmsg(on?'Push activo en este equipo.':'Push inactivo en este equipo.');
}
function refresh(){
if(!('serviceWorker' in navigator)||!('PushManager' in window)){paint(false,true);return;}
navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription();}).then(function(s){paint(!!s,false);}).catch(function(){paint(false,false);});
}
var onB=document.getElementById('pushOnBtn'),offB=document.getElementById('pushOffBtn'),insB=document.getElementById('pushInstallBtn');
if(insB)insB.addEventListener('click',function(){if(!deferredPrompt)return;deferredPrompt.prompt();deferredPrompt.userChoice.then(function(){deferredPrompt=null;insB.hidden=true;}).catch(function(){});});
if(onB)onB.addEventListener('click',function(){
pmsg('Activando…');
if(!('serviceWorker' in navigator)||!('PushManager' in window)){paint(false,true);return;}
navigator.serviceWorker.ready.then(function(reg){
return fetch('/api/push/public-key').then(function(r){return r.json();}).then(function(d){
if(!d||!d.ok||!d.key){throw new Error('srv');}
return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(d.key)});
});
}).then(function(sub){
var j=sub.toJSON();
return fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':csrfH()},body:JSON.stringify({endpoint:sub.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth})}).then(function(r){return r.json();});
}).then(function(d){if(d&&d.ok){paint(true,false);}else{pmsg('No se pudo activar.');}}).catch(function(){pmsg('No se pudo activar (¿HTTPS y VAPID?).');});
});
if(offB)offB.addEventListener('click',function(){
pmsg('Desactivando…');
navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription();}).then(function(sub){
if(!sub){paint(false,false);return null;}
var ep=sub.endpoint;
return sub.unsubscribe().then(function(){
return fetch('/api/push/subscribe',{method:'DELETE',headers:{'Content-Type':'application/json','x-csrf-token':csrfH()},body:JSON.stringify({endpoint:ep})});
});
}).then(function(){paint(false,false);}).catch(function(){pmsg('No se pudo desactivar.');});
});
refresh();
}catch(e){}})();</script>`;

// Campana: marcar notificación leída al abrirla + marcar todas leídas.
// Sin inline onclick (CSP nonce).
const NOTIF_JS = `<script>(function(){try{
function csrfH(){try{var m=document.querySelector('meta[name="csrf-token"]');return m?m.getAttribute('content')||'':'';}catch(e){return '';}}
function go(href){if(href&&href!=='#'){window.location.href=href;}else{window.location.reload();}}
document.querySelectorAll('[data-notif-read]').forEach(function(a){
a.addEventListener('click',function(ev){
ev.preventDefault();
var id=a.getAttribute('data-notif-read');var href=a.getAttribute('href');
fetch('/api/notificaciones/'+encodeURIComponent(id)+'/leida',{method:'PUT',headers:{'x-csrf-token':csrfH(),'Accept':'application/json'}}).then(function(){go(href);}).catch(function(){go(href);});
});
});
var all=document.querySelector('[data-notif-all]');
if(all)all.addEventListener('click',function(){
fetch('/api/notificaciones/leidas',{method:'PUT',headers:{'x-csrf-token':csrfH(),'Accept':'application/json'}}).then(function(){window.location.reload();}).catch(function(){window.location.reload();});
});
}catch(e){}})();</script>`;

// Edición en línea de las tablas documento: botón ✎ por fila (ASIGNACIONES
// CREADAS) y en la línea de monto global. Sin inline onclick (CSP nonce);
// solo visible con permiso de escritura (server-rendered).
const DOCEDIT_JS = `<script>(function(){try{
function csrfH(){try{var m=document.querySelector('meta[name="csrf-token"]');return m?m.getAttribute('content')||'':'';}catch(e){return '';}}
function dmsg(t){var m=document.getElementById('docEditMsg');if(m){m.textContent=t||'';}}
function numOk(s){return /^-?\\d+(\\.\\d{1,2})?$/.test(String(s).trim());}
document.querySelectorAll('[data-docedit]').forEach(function(btn){
btn.addEventListener('click',function(){
if(document.querySelector('[data-docediting]')){dmsg('Termina la edición en curso.');return;}
var kind=btn.getAttribute('data-docedit');
var cell=document.getElementById(btn.getAttribute('data-cell'));
if(!cell){dmsg('Celda no encontrada.');return;}
var span=cell.querySelector('.doc-val');
if(!span){dmsg('Celda no encontrada.');return;}
var orig=span.textContent.trim().replace(/,/g,'');
if(orig==='—')orig='';
var inCell=btn.parentNode===cell;
btn.setAttribute('data-docediting','1');
cell.innerHTML='';
var inp=document.createElement('input');
inp.type='number';inp.min='0';inp.step='0.01';inp.value=orig;inp.className='doc-input';inp.setAttribute('aria-label','Nuevo valor');
var ok=document.createElement('button');ok.type='button';ok.className='btn-primary';ok.textContent='Guardar';
var no=document.createElement('button');no.type='button';no.textContent='Cancelar';
cell.appendChild(inp);cell.appendChild(document.createTextNode(' '));cell.appendChild(ok);cell.appendChild(document.createTextNode(' '));cell.appendChild(no);
try{inp.focus();inp.select();}catch(e){}
function close(){btn.removeAttribute('data-docediting');cell.innerHTML='';cell.appendChild(span);if(inCell){cell.appendChild(document.createTextNode(' '));cell.appendChild(btn);}dmsg('');}
no.addEventListener('click',function(){close();});
ok.addEventListener('click',function(){
var v=inp.value.trim();
if(!numOk(v)||Number(v)<0){dmsg('Valor inválido (número ≥ 0, máx. 2 decimales).');return;}
dmsg('Guardando…');
var url,method='PUT',payload;
if(kind==='creada'){url='/api/distribucion-municipio/valor';payload={ano:btn.getAttribute('data-ano'),municipio:btn.getAttribute('data-mun'),valor:v};}
else{var id=btn.getAttribute('data-id');if(id){url='/api/maestros/distribuciones/'+encodeURIComponent(id);payload={asignado:v};}else{url='/api/maestros/distribuciones';method='POST';payload={tipo:btn.getAttribute('data-tipo'),vigencia:btn.getAttribute('data-vig'),asignado:v};}}
fetch(url,{method:method,headers:{'Content-Type':'application/json','x-csrf-token':csrfH(),'Accept':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json().then(function(d){return {s:r.status,d:d};});}).then(function(x){
if(x.d&&x.d.ok){window.location.reload();return;}
dmsg((x.d&&(x.d.error))||('Error '+x.s+'.'));
}).catch(function(){dmsg('Error de red.');});
});
});
});
}catch(e){}})();</script>`;

// Imprimir informe: diálogo nativo (con previsualización). Sin inline onclick (CSP nonce).
const REGLA_JS = `<script>(function(){try{
function csrfH(){try{var m=document.querySelector('meta[name="csrf-token"]');return m?m.getAttribute('content')||'':'';}catch(e){return '';}}
function rmsg(t,ok){var m=document.getElementById('reglaMsg');if(m){m.textContent=t||'';m.style.color=ok?'':'var(--err-ink)';}}
function val(id){var el=document.getElementById(id);return el?el.value.trim():'';}
var up=document.getElementById('reglaUp');
if(up)up.addEventListener('click',function(){
var f=document.getElementById('reglaFile');
if(!f||!f.files||!f.files[0]){rmsg('Selecciona el xlsx.',false);return;}
var fd=new FormData();fd.append('archivo',f.files[0]);fd.append('vigencia',val('reglaVig'));
rmsg('Cargando…',true);
fetch('/api/regla-oro/cargar',{method:'POST',headers:{'x-csrf-token':csrfH(),'Accept':'application/json'},body:fd}).then(function(r){return r.json().then(function(d){return {s:r.status,d:d};});}).then(function(x){
if(x.d&&x.d.ok){rmsg(x.d.msg,true);setTimeout(function(){window.location.reload();},900);return;}
rmsg((x.d&&(x.d.error))||'No se pudo cargar.',false);
}).catch(function(){rmsg('Error de red.',false);});
});
var ask=document.getElementById('reglaGoAsk');
var modal=document.getElementById('reglaConfirmModal');
var no=document.getElementById('reglaGoNo');
function closeReglaModal(){if(modal)modal.hidden=true;}
if(ask)ask.addEventListener('click',function(){
var t=document.getElementById('reglaTotalMun');
var v=t?t.value.trim():'';
if(!/^\d+(\.\d{1,2})?$/.test(v)||Number(v)<=0){rmsg('Indica el valor total (> 0, máx. 2 decimales).',false);return;}
var pv=document.getElementById('reglaConfirmTotal');if(pv)pv.textContent=Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
if(modal)modal.hidden=false;
});
if(no)no.addEventListener('click',function(){closeReglaModal();});
var go=document.getElementById('reglaGo');
if(go)go.addEventListener('click',function(){
var t=document.getElementById('reglaTotalMun');
var v=t?t.value.trim():'';
var payload={vigencia:val('reglaVig2'),numero:1,tipo:1,total:v};
rmsg('Asignando…',true);
fetch('/api/regla-oro/asignar-total',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':csrfH(),'Accept':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json().then(function(d){return {s:r.status,d:d};});}).then(function(x){
if(x.d&&x.d.ok){closeReglaModal();rmsg(x.d.msg,true);setTimeout(function(){window.location.reload();},900);return;}
rmsg((x.d&&(x.d.error))||'No se pudo asignar.',false);
}).catch(function(){rmsg('Error de red.',false);});
});
var vg=document.getElementById('reglaVerGo');
if(vg)vg.addEventListener('click',function(){
var v=document.getElementById('reglaVer');var yv=v?v.value.trim():'';
var m=window.location.search.match(/[?&]f=([^&]+)/);
var tok=m?m[1]:'';
if(!tok||!yv){rmsg('Indica vigencia para ver.',false);return;}
window.location.href=window.location.pathname+'?f='+encodeURIComponent(tok)+'&vigencia='+encodeURIComponent(yv);
});
var pr=document.getElementById('reglaPrint');
if(pr)pr.addEventListener('click',function(){window.print();});
var cg=document.getElementById('reglaCmpGo');
if(cg)cg.addEventListener('click',function(){
function escH(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
var a=val('reglaCmpA'),b=val('reglaCmpB'),c=val('reglaCmpC');
var qs=[a,b,c].filter(function(x){return x!=='';}).join(',');
var out=document.getElementById('reglaCmpOut');
if(!out)return;
out.innerHTML='<p>Cargando comparación…</p>';
fetch('/api/regla-oro/comparar?vigencias='+encodeURIComponent(qs)).then(function(r){return r.json();}).then(function(d){
if(!d||!d.ok){out.innerHTML='<p>No se pudo comparar.</p>';return;}
var vys=d.vigencias,rows=d.rows,byM={},order=[];
rows.forEach(function(x){(byM[x.municipio]=byM[x.municipio]||{nombre:x.nombre,circ:x.circ,vals:{}}).vals[x.vigencia]=Number(x.regla);if(order.indexOf(x.municipio)<0)order.push(x.municipio);});
var h='<table class="skl-table"><thead><tr><th>Municipio</th><th>Circunscripción</th>'+vys.map(function(y){return '<th>'+y+' %</th>';}).join('')+'</tr></thead><tbody>';
order.forEach(function(k){var e=byM[k];h+='<tr><td>'+escH(e.nombre)+'</td><td>'+escH(e.circ||'—')+'</td>'+vys.map(function(y){return '<td class="tnum">'+(e.vals[y]!=null?(e.vals[y]*100).toFixed(2)+'%':'—')+'</td>';}).join('')+'</tr>';});
out.innerHTML=h+'</tbody></table>';
}).catch(function(){out.innerHTML='<p>Error de red.</p>';});
});
}catch(e){}})();</script>`;
const PRINT_JS = `<script>(function(){try{var b=document.getElementById('btnImprimir');if(b)b.addEventListener('click',function(){window.print();});}catch(e){}})();</script>`;

function fmtFechaHora(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16);
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const STEP_CHECK_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425z"/></svg>`;
const STEP_PREV_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/></svg>`;
const STEP_NEXT_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8"/></svg>`;

// Paginador del mini panel (3 por página, todo renderizado por el servidor).
const ACTIVITY_PAGER_JS = `<script>(function(){try{
var box=document.querySelector('[data-stepper]');if(!box)return;
var steps=Array.prototype.slice.call(box.querySelectorAll('[data-step]'));
var PER=3,pages=Math.ceil(steps.length/PER),cur=0;
var prev=box.querySelector('[data-step-prev]'),next=box.querySelector('[data-step-next]'),count=box.querySelector('[data-step-count]');
function render(){steps.forEach(function(s,i){s.style.display=(Math.floor(i/PER)===cur)?'':'none';});
if(count)count.textContent=(cur+1)+' / '+pages;
if(prev)prev.disabled=(cur===0);if(next)next.disabled=(cur>=pages-1);}
if(pages<=1){var c=box.querySelector('.stepper-controls');if(c)c.style.display='none';return;}
if(prev)prev.addEventListener('click',function(){if(cur>0){cur--;render();}});
if(next)next.addEventListener('click',function(){if(cur<pages-1){cur++;render();}});
render();}catch(e){}})();</script>`;

// Mini panel Actividad reciente: bitácora stepper solo plataforma (el servidor ya
// excluye login/logout). Item más reciente destacado; 3 por página con paginación.
function activityFeed(actividad, nonce) {
  const rows = actividad || [];
  if (!rows.length) return `<div class="stepper-box"><p class="stepper-empty">Sin movimientos.</p></div>`;
  const PER = 3, pages = Math.ceil(rows.length / PER);
  const steps = rows.map((a, i) => {
    const state = i === 0 ? 'stepper-active' : 'stepper-completed';
    const last = i === rows.length - 1 ? ' stepper-last' : '';
    return `<div class="stepper-step ${state}${last}" data-step="${i}">
      <div class="stepper-circle drawer-trigger" data-drawer="actividad" data-id="${a.id}" role="button" tabindex="0" title="Ver detalle">${STEP_CHECK_SVG}</div>
      <div class="stepper-line" aria-hidden="true"></div>
      <div class="stepper-content">
        <div class="stepper-title">${esc(ACTION_LABEL[a.action] || a.action)}</div>
        <div class="stepper-actor">${esc(a.actor_email || '')}</div>
        <div><span class="stepper-status">${esc(a.modulo || '')}</span></div>
        ${a.detalle ? `<div class="stepper-detail">${esc(a.detalle)}</div>` : ''}
        <div class="stepper-time tnum">${esc(fmtFechaHora(a.at))}</div>
      </div>
    </div>`;
  }).join('');
  const controls = pages > 1 ? `<div class="stepper-controls">
      <button class="stepper-button" data-step-prev type="button">${STEP_PREV_SVG}Anterior</button>
      <span class="stepper-count tnum" data-step-count>1 / ${pages}</span>
      <button class="stepper-button stepper-button-primary" data-step-next type="button">Siguiente${STEP_NEXT_SVG}</button>
    </div>` : '';
  return `<div class="stepper-box" data-stepper>${steps}${controls}</div>${withNonce(ACTIVITY_PAGER_JS, nonce)}`;
}

// Drawer lateral derecho (detalle Actividad/Tarea): full-height, blur fuera.
function detailDrawer() {
  return `<div class="drawer-backdrop" id="drawerBackdrop" hidden>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="Detalle" id="drawerPanel">
    <div class="drawer-head"><h2 id="drawerTitle">Detalle</h2><button class="drawer-close" id="drawerClose" aria-label="Cerrar">✕</button></div>
    <div class="drawer-body" id="drawerBody"><p>Cargando…</p></div>
  </aside>
</div>`;
}

const DRAWER_JS = `<script>(function(){try{
var back=document.getElementById('drawerBackdrop'),panel=document.getElementById('drawerPanel'),
title=document.getElementById('drawerTitle'),body=document.getElementById('drawerBody');
if(!back||!panel)return;
function q(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function row(k,v){if(v===null||v===undefined||v==='')return '';return '<div class="drawer-row"><span>'+q(k)+'</span><strong>'+q(v)+'</strong></div>';}
function fmtDT(v){try{return new Date(v).toLocaleString('es-CO');}catch(e){return String(v||'');}}
function open(){back.hidden=false;requestAnimationFrame(function(){back.classList.add('open');});if(panel)panel.focus&&panel.focus();}
function close(){back.classList.remove('open');setTimeout(function(){back.hidden=true;},200);}
function renderActividad(a){
title.textContent='Actividad';
body.innerHTML=row('Acción',a.action)+row('Actor',a.actor_email)+row('Módulo',a.modulo)+row('Entidad',a.entidad_id)+row('Detalle',a.detalle)+row('IP',a.ip)+row('Fecha',fmtDT(a.at));
}
function renderTarea(t){
title.textContent=t.estado==='hecha'?'Tarea completada':'Tarea pendiente';
var lim=t.fecha_limite?String(t.fecha_limite).slice(0,10):'';
var est=t.estado==='hecha'?'<span class="badge badge-ok">hecha</span>':'<span class="badge badge-pending">pendiente</span>';
var tipo=t.automatica?'<span class="badge badge-ok">automática</span>':'<span class="badge badge-neutral">manual</span>';
body.innerHTML=row('Título',t.titulo)+row('Detalle',t.detalle)+row('Responsable',t.responsable)+row('Área',t.area)+row('Proceso',t.proceso)+row('Rol',t.rol)+row('Límite',lim)
+'<div class="drawer-row"><span>Tipo</span><strong>'+tipo+'</strong></div>'
+'<div class="drawer-row"><span>Estado</span><strong>'+est+'</strong></div>'
+row('Completada por',t.hecha_por)+row('Completada el',t.hecha_at?fmtDT(t.hecha_at):'')
+'<div class="drawer-actions" id="drawerActions"></div><p id="drawerMsg" class="drawer-msg"></p>';
var box=document.getElementById('drawerActions');
if(!box||t.estado==='hecha')return;
var b=document.createElement('button');b.textContent='Validar tarea';b.className='btn-primary';b.style.marginTop='0';
b.addEventListener('click',function(){
if(!t.automatica&&!window.confirm('¿Confirmas completar "'+(t.titulo||'')+'"?'))return;
b.disabled=true;
function go(){
function csrfHeader() {
  try {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') || '' : '';
  } catch (e) { return ''; }
}
fetch('/api/tareas/'+encodeURIComponent(t.id)+'/validar',{method:'POST',headers:{'x-csrf-token':csrfHeader()}}).then(function(r){return r.json().then(function(d){return {s:r.status,d:d};});}).then(function(x){
if(x.d&&x.d.ok){window.location.reload();return;}
var m=document.getElementById('drawerMsg');if(m)m.textContent=(x.d&&(x.d.msg||x.d.error))||'No se pudo validar.';
b.disabled=false;
}).catch(function(){var m=document.getElementById('drawerMsg');if(m)m.textContent='Error de red.';b.disabled=false;});
}
if(window.fncAlive){window.fncAlive().then(function(ok){if(ok){go();}else{b.disabled=false;window.location.href='/login?reason=inactivity';}});}else{go();}
});
box.appendChild(b);
if(t.formUrl){var a=document.createElement('a');a.textContent='Ir al formulario';a.className='btn-logout';a.style.textDecoration='none';a.style.display='inline-block';a.style.padding='10px 20px';a.href=t.formUrl;box.appendChild(a);}
}
function load(kind,id){
body.innerHTML='<p>Cargando…</p>';open();
var plural=kind==='tarea'?'tareas':kind;
fetch('/api/'+plural+'/'+encodeURIComponent(id)).then(function(r){if(!r.ok)throw new Error('http '+r.status);return r.json();}).then(function(d){
if(kind==='actividad')renderActividad(d);else renderTarea(d);
}).catch(function(){body.innerHTML='<p>No se pudo cargar el detalle.</p>';});
}
document.addEventListener('click',function(e){var t=e.target.closest?e.target.closest('.drawer-trigger'):null;if(!t)return;e.preventDefault();load(t.getAttribute('data-drawer'),t.getAttribute('data-id'));});
document.addEventListener('keydown',function(e){
if(e.key==='Escape'&&!back.hidden)close();
if((e.key==='Enter'||e.key===' ')&&document.activeElement&&document.activeElement.classList&&document.activeElement.classList.contains('drawer-trigger')){e.preventDefault();var t=document.activeElement;load(t.getAttribute('data-drawer'),t.getAttribute('data-id'));}
});
document.getElementById('drawerClose').addEventListener('click',close);
back.addEventListener('click',function(e){if(e.target===back)close();});
}catch(e){}})();</script>`;
function dashboardPage(fnc, data) {
  const nAct = (data.actividad || []).length;
  return `<div class="dash-grid">
<div>${formSlot(data.form, fnc)}</div>
<div class="dash-rail"><div class="card rail-card"><div class="rail-card-head"><h2>Actividad reciente</h2><span class="rail-card-meta tnum">${nAct} movimientos</span></div><div class="rail-scroll">${activityFeed(data.actividad, data.nonce)}</div></div><div class="card rail-card"><div class="rail-card-head"><h2>Tareas</h2></div><div class="rail-scroll">${taskCards(fnc, data.tareas)}${doneList(data.hechas)}</div></div></div>
</div>`;
}

module.exports = { layout, loginPage, rolesMatrix, errorPage, esc, dashboardPage, informePage };

