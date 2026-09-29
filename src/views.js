// Vistas vanilla (fnc-layout/vanilla-rendimiento). Nav en árbol guiado por src/modules.js:
// módulo → subcategoría (colapsable, memoria localStorage) → hoja.
// permitido = link, sin acceso pero visible = deshabilitado, CONFIG anclada al fondo.
const { MODULES, NAV, CONFIG, canAccess, flattenLeaves } = require('./modules');
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
};

function icon(name) {
  return `<svg class="nav-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.tareas}</svg>`;
}

function leafLink(leaf, active, role, sub) {
  const isActive = active === leaf.path;
  const href = sub && sub.kind === 'informe' ? leaf.path : `/dashboard?form=${encodeURIComponent(leaf.path)}`;
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
      html += `<a class="tab-btn${active === mod.path ? ' active' : ''}" href="${mod.path}" title="${esc(mod.title)}">${icon(mod.icon)}<span class="nav-label">${esc(mod.title)}</span></a>`;
      continue;
    }
    const subs = (mod.children || []).map((sub) => {
      const leaves = sub.children || [];
      if (!leaves.length) return '';
      const inSub = leaves.some((l) => active === l.path);
      const items = leaves.map((l) => leafLink(l, active, role, sub)).join('');
      return `<details class="tree-sub" data-navkey="${esc(mod.path + '/' + sub.key)}"${inSub ? ' open' : ''}>
        <summary class="tree-sub-head" title="${esc(sub.title)}">${icon(sub.icon)}<span class="nav-label">${esc(sub.title)}</span></summary>
        <div class="tree-leaves">${items}</div>
      </details>`;
    }).join('');
    html += `<details class="tree-mod" data-navkey="mod:${esc(mod.path)}"${inMod ? ' open' : ''}>
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
    return `<a class="tab-btn${active === c.path ? ' active' : ''}" href="${c.path}" title="${esc(c.title)}">${icon(c.icon)}<span class="nav-label">${esc(c.title)}</span></a>`;
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
var WARN_AT=4*60*1000, LIMIT=5*60*1000, deadline=Date.now()+LIMIT, timer=null, shown=false;
var modal=document.getElementById('inactModal'), secs=document.getElementById('inactSecs');
function csrfH(){try{var m=document.querySelector('meta[name="csrf-token"]');return m?m.getAttribute('content')||'':'';}catch(e){return '';}}
function reset(){deadline=Date.now()+LIMIT;if(shown&&modal){modal.hidden=true;shown=false;}}
function logout(){fetch('/auth/logout',{method:'POST',headers:{'x-csrf-token':csrfH()}}).finally(function(){window.location.href='/login?reason=inactivity';});}
function tick(){
var left=deadline-Date.now();
if(left<=0){clearInterval(timer);logout();return;}
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
    <div class="pref-block"><span class="a11y-sec-label">Nombre mostrado</span>
      <div class="a11y-seg" role="group" aria-label="Nombre mostrado">
        <button id="prefFull" type="button" aria-pressed="true">Completo</button>
        <button id="prefFirst" type="button" aria-pressed="false">Solo nombre</button>
      </div>
    </div>
    <div class="pref-block"><span class="a11y-sec-label">Foto (jpeg, png, webp · máx 5 MB → se guarda en 256px)</span>
      <div class="a11y-font"><input id="prefFoto" type="file" accept=".jpg,.jpeg,.png,.webp"><button id="prefFotoBtn" type="button">Subir</button></div>
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
document.querySelectorAll('[data-open-modal="perfil"]').forEach(function(b){b.addEventListener('click',function(){if(!m)return;m.hidden=false;prefMsg('');fetch('/api/me').then(function(r){return r.json();}).then(function(u){var left=u.exp&&u.iat?Math.max(0,u.exp-Math.floor(Date.now()/1000)):0;var hh=Math.floor(left/3600),mm=Math.floor((left%3600)/60);document.getElementById('perfilBody').innerHTML='<p>Usuario: <strong>'+String(u.displayName||'')+'</strong></p><p>Email: <strong>'+String(u.email||'')+'</strong></p><p>Rol: <span class=&quot;badge&quot;>'+String(u.role||'')+'</span> '+(u.roles||[]).join(', ')+'</p><p>Sesión vigente por: <strong>'+hh+'h '+mm+'min</strong></p>';syncPref(u.displayMode||'full');}).catch(function(){});});});
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
var tk='';try{var mm=document.querySelector('meta[name="csrf-token"]');tk=mm?mm.getAttribute('content')||'':'';}catch(e){}
fetch('/api/tareas',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':tk},body:JSON.stringify(payload)}).then(function(r){return r.json().then(function(d){return {s:r.status,d:d};});}).then(function(x){
if(x.d&&x.d.ok){window.location.reload();return;}
if(msg)msg.textContent=(x.d&&(x.d.error||x.d.msg))||'No se pudo crear.';
g.disabled=false;
}).catch(function(){if(msg)msg.textContent='Error de red.';g.disabled=false;});
});
}catch(e){}})();</script>`;

const NAV_MEMORY_JS = `<script>(function(){try{var k='sip-nav-open';var open=JSON.parse(localStorage.getItem(k)||'[]');function save(id,on){try{var cur=JSON.parse(localStorage.getItem(k)||'[]');if(on&&cur.indexOf(id)<0)cur.push(id);if(!on)cur=cur.filter(function(x){return x!==id});localStorage.setItem(k,JSON.stringify(cur));}catch(e){}}document.querySelectorAll('details.tree-sub, details.tree-mod').forEach(function(d){var id=d.getAttribute('data-navkey');if(open.indexOf(id)>=0)d.open=true;d.addEventListener('toggle',function(){save(id,d.open)});});
var scrollAreas=Array.prototype.slice.call(document.querySelectorAll('.sidebar-nav, .rail-scroll'));
scrollAreas.forEach(function(el){var scrollT=null;el.addEventListener('scroll',function(){el.classList.add('is-scrolling');if(scrollT)clearTimeout(scrollT);scrollT=setTimeout(function(){el.classList.remove('is-scrolling');},800);},{passive:true});});
document.addEventListener('error',function(e){var t=e.target;if(t&&t.classList&&t.classList.contains('user-photo')){var d=document.createElement('div');d.className='user-avatar';d.textContent=(t.getAttribute('alt')||'U').trim().charAt(0).toUpperCase()||'U';t.replaceWith(d);}},true);}catch(e){}})();</script>`;

// Reset al seleccionar Dashboard: el dashboard sin formulario inline se renderiza con
// active '/dashboard'. Limpiar la memoria de ramas para que el árbol cargue colapsado.
// Se emite ANTES de NAV_MEMORY_JS para que no reabra nada guardado.
const NAV_RESET_JS = `<script>(function(){try{localStorage.removeItem('sip-nav-open');}catch(e){}})();</script>`;

const A11Y_HEAD_JS = `<script>(function(){try{var t=localStorage.getItem('sip-theme');if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);var s=parseInt(localStorage.getItem('sip-font')||'100',10);if(s>=80&&s<=120&&s!==100)document.documentElement.style.fontSize=(s/100*16)+'px';if(localStorage.getItem('sip-nav-collapsed')==='1')document.documentElement.classList.add('nav-collapsed');}catch(e){}})();</script>`;

const A11Y_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4.5" r="2"/><path d="M4 8.5c2.7.7 5.3 1 8 1s5.3-.3 8-1"/><path d="M12 9.5V14"/><path d="M12 14l-3.5 7"/><path d="M12 14l3.5 7"/></svg>`;
const SUN_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MOON_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;

function a11yControls() {
  return `<div class="a11y-wrap">
    <button class="a11y-btn" id="a11yBtn" aria-haspopup="true" aria-expanded="false" aria-label="Accesibilidad" title="Accesibilidad">${A11Y_ICON}</button>
    <div class="a11y-pop" id="a11yPop" hidden>
      <span class="a11y-sec-label">Tema</span>
      <div class="a11y-seg" role="group" aria-label="Tema">
        <button id="themeLight" aria-pressed="false">${SUN_ICON}Claro</button>
        <button id="themeDark" aria-pressed="false">${MOON_ICON}Oscuro</button>
      </div>
      <div class="a11y-font">
        <span class="a11y-sec-label" style="margin:0">Letra</span>
        <button id="fontDown" aria-label="Disminuir tamaño de letra">A−</button>
        <span class="a11y-fontval" id="fontVal">100%</span>
        <button id="fontUp" aria-label="Aumentar tamaño de letra">A+</button>
      </div>
    </div>
  </div>`;
}

const A11Y_JS = `<script>(function(){try{
var btn=document.getElementById('a11yBtn'),pop=document.getElementById('a11yPop');
if(!btn||!pop)return;
function sync(){var t=document.documentElement.getAttribute('data-theme')||'light';document.getElementById('themeLight').setAttribute('aria-pressed',t==='light'?'true':'false');document.getElementById('themeDark').setAttribute('aria-pressed',t==='dark'?'true':'false');var s=parseInt(localStorage.getItem('sip-font')||'100',10);document.getElementById('fontVal').textContent=s+'%';document.getElementById('fontDown').disabled=s<=80;document.getElementById('fontUp').disabled=s>=120;}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem('sip-theme',t);}catch(e){}sync();}
function setFont(s){s=Math.min(120,Math.max(80,s));document.documentElement.style.fontSize=(s/100*16)+'px';try{localStorage.setItem('sip-font',String(s));}catch(e){}sync();}
function close(){pop.hidden=true;btn.setAttribute('aria-expanded','false');}
btn.addEventListener('click',function(){pop.hidden=!pop.hidden;btn.setAttribute('aria-expanded',pop.hidden?'false':'true');if(!pop.hidden)sync();});
document.addEventListener('click',function(e){if(!pop.hidden&&!e.target.closest('.a11y-wrap'))close();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
document.getElementById('themeLight').addEventListener('click',function(){setTheme('light');});
document.getElementById('themeDark').addEventListener('click',function(){setTheme('dark');});
document.getElementById('fontDown').addEventListener('click',function(){setFont(parseInt(localStorage.getItem('sip-font')||'100',10)-10);});
document.getElementById('fontUp').addEventListener('click',function(){setFont(parseInt(localStorage.getItem('sip-font')||'100',10)+10);});
var navBtn=document.getElementById('navCollapseBtn');
if(navBtn){if(document.documentElement.classList.contains('nav-collapsed'))navBtn.setAttribute('aria-label','Expandir menú');navBtn.addEventListener('click',function(){var on=!document.documentElement.classList.contains('nav-collapsed');document.documentElement.classList.toggle('nav-collapsed',on);navBtn.setAttribute('aria-label',on?'Expandir menú':'Contraer menú');try{localStorage.setItem('sip-nav-collapsed',on?'1':'0');}catch(e){}});}
sync();}catch(e){}})();</script>`;

function layout(appName, fnc, active, body, csrf, nonce) {
  const email = fnc?.email || '';
  const role = fnc?.role || '';
  const initial = email.trim().charAt(0).toUpperCase() || 'U';
  const csrfField = csrf ? `<input type="hidden" name="_csrf" value="${csrf}">` : '';
  const csrfMetaTag = csrf ? `<meta name="csrf-token" content="${csrf}">` : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${csrfMetaTag}${withNonce(A11Y_HEAD_JS, nonce)}<title>${esc(active)} — ${esc(appName)}</title><link rel="icon" type="image/svg+xml" href="/img/logo-sip-mini.svg"><link rel="stylesheet" href="/css/layout.css?v=20260928-grid"><link rel="stylesheet" href="/css/app.css?v=20260928-grid"></head><body>
<header class="header-fnc"><div class="header-container">
<div style="display:flex;align-items:center;gap:12px;"><div class="header-brand"><img class="brand-logo brand-logo-light" src="/img/logo-fnc-mini.svg" alt="Comité de Cafeteros del Tolima" height="30"><img class="brand-logo brand-logo-dark" src="/img/logo-fnc-tolima-white.png" alt="Comité de Cafeteros del Tolima" height="26"><span class="brand-divider" aria-hidden="true"></span><div><span class="header-brand-name"><strong>SIP</strong> Sistema de Información de Proyectos</span></div></div></div>
<div class="header-user-profile">${a11yControls()}${fnc?.photo ? `<img class="user-photo" src="${fnc.photo}" alt="${esc(shownName(fnc) || 'Usuario')}">` : `<div class="user-avatar">${esc(initial)}</div>`}<div><span class="user-name" title="${esc((fnc.displayName || '') + (fnc.email ? ' · ' + fnc.email : ''))}">${esc(shownName(fnc))}</span></div>
<form method="post" action="/auth/logout" style="margin:0">${csrfField}<button class="btn-logout" type="submit">Salir</button></form></div>
</div></header>
<aside class="app-sidebar" aria-label="Navegacion principal">
<nav class="sidebar-nav">
<span class="sidebar-section-label">Módulos</span>
${navTree(active, role)}
${navConfig(active, role)}
</nav>
<div class="nav-collapse-bar"><button class="nav-collapse-btn" id="navCollapseBtn" aria-label="Contraer menú" title="Contraer / expandir menú"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9.5 3v18"/></svg></button></div>
</aside>
<main class="main-container">${body}</main>
${profileModal(csrf)}
${inactivityModal()}
${taskCreateModal()}
${detailDrawer()}
${active === '/dashboard' ? withNonce(NAV_RESET_JS, nonce) : ''}${withNonce(NAV_MEMORY_JS, nonce)}${withNonce(A11Y_JS, nonce)}${withNonce(MODAL_JS, nonce)}${withNonce(DRAWER_JS, nonce)}${withNonce(TASK_CREATE_JS, nonce)}${withNonce(INACTIVITY_JS, nonce)}</body></html>`;
}

function loginPage(appName, kcMode, csrf, reason) {
  const csrfField = csrf ? `<input type="hidden" name="_csrf" value="${csrf}">` : '';
  const notice = reason === 'inactivity'
    ? `<div class="alert-err">Sesión cerrada por inactividad. Ingresa de nuevo.</div>` : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login — ${esc(appName)}</title><link rel="stylesheet" href="/css/layout.css?v=20260928-grid"><link rel="stylesheet" href="/css/app.css?v=20260928-grid"></head><body>
<main class="main-container" style="margin-left:15px"><div class="card"><div class="login-brand"><img class="brand-logo brand-logo-light" src="/img/logo-fnc-tolima.png" alt="Comité de Cafeteros del Tolima" height="44"><img class="brand-logo brand-logo-dark" src="/img/logo-fnc-tolima-white.png" alt="Comité de Cafeteros del Tolima" height="44"><img class="brand-sip" src="/img/logo-sip.svg" alt="SIP" height="30"></div><h1>${esc(appName)}</h1>
<p>Sistema de Información de Proyectos — gestión e informes contables por periodos.</p>
${notice}
${kcMode
      ? `<a class="btn-primary" href="/auth/app">Continuar con Comit\u00e9 Tolima</a>`
      : `<form method="post" action="/auth/mock" style="margin:0">${csrfField}<button class="btn-primary" type="submit">Continuar con Comit\u00e9 Tolima</button></form><p><span class="badge">mock offline</span> sin Keycloak.</p>`}
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
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Error</title><link rel="stylesheet" href="/css/layout.css?v=20260928-grid"><link rel="stylesheet" href="/css/app.css?v=20260928-grid"></head><body>
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
    return `<li class="task-item"><span class="task-num tnum drawer-trigger" data-drawer="tarea" data-id="${t.id}" role="button" tabindex="0" title="Ver detalle">${i + 1}</span><span class="task-body"><strong class="drawer-trigger" data-drawer="tarea" data-id="${t.id}" role="button" tabindex="0" title="Ver detalle">${esc(t.titulo)}${vencida ? ' <span class="badge badge-warn">Vencida</span>' : ''}</strong></span></li>`;
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

function skeletonInforme(leaf) {
  return `<div class="skl-bar"><label class="fld"><span>Año</span><input type="number" disabled></label>
<label class="fld"><span>Formato</span><select disabled><option>Pantalla</option><option>Excel</option></select></label>
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

function formSlot(form) {
  if (!form) {
    return `<div class="card form-slot"><h2>Formularios</h2><p>Selecciona una opción del nav izquierdo: los formularios pequeños se abren aquí; los informes tienen vista propia.</p></div>`;
  }
  const { leaf, sub, mod } = form;
  const kinds = { maestro: skeletonMaestro, informe: skeletonInforme, proceso: skeletonProceso, consulta: skeletonConsulta };
  const render = kinds[sub.kind] || skeletonMaestro;
  const body = sub.kind === 'info'
    ? `<p><a class="btn-primary" href="${leaf.path}">Abrir ${esc(leaf.title)}</a></p>`
    : render(leaf, sub);
  return `<div class="card form-slot"><p><a href="${mod.path}">${esc(mod.title)}</a> / ${esc(sub.title)}</p><h2>${esc(leaf.title)} <span class="badge">skeleton</span></h2>${body}</div>`;
}

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
<div>${kpiStrip(data.saldos)}${formSlot(data.form)}</div>
<div class="dash-rail"><div class="card rail-card"><div class="rail-card-head"><h2>Actividad reciente</h2><span class="rail-card-meta tnum">${nAct} movimientos</span></div><div class="rail-scroll">${activityFeed(data.actividad, data.nonce)}</div></div><div class="card rail-card"><div class="rail-card-head"><h2>Tareas</h2></div><div class="rail-scroll">${taskCards(fnc, data.tareas)}${doneList(data.hechas)}</div></div></div>
</div>`;
}

module.exports = { layout, loginPage, rolesMatrix, errorPage, esc, dashboardPage };

