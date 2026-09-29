// Meta compartido de tareas (server + views): mapa proceso→formulario,
// catálogo de roles destino y permiso de creación (todos menos consultor).
const PROCESO_FORM = {
  'Órdenes SAP / Inversión mensual': '/dashboard?form=/ordenes-sap/procesos/inversion-mensual',
  'Distribución / Apertura': '/dashboard?form=/distribucion/actualizaciones/distribuciones',
  'Asignaciones / Aprobación': '/dashboard?form=/asignaciones/actualizaciones/asignaciones',
  'Informes / Saldos': '/distribucion/informes/saldos',
};

function clientCatalog() {
  return String(process.env.CLIENT_ROLES || 'admin,coordinador,consultor,analista,auxiliar')
    .split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
}

function canCreate(fnc) {
  if (!fnc) return false;
  if (fnc.role === 'ADMIN') return true;
  const roles = (fnc.roles || []).map((r) => String(r).toLowerCase());
  return roles.length > 0 && roles.some((r) => r !== 'consultor');
}

module.exports = { PROCESO_FORM, clientCatalog, canCreate };
