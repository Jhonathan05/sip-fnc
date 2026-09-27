// Catálogo SIP-FNC (F0.4): admin -> ADMIN, coordinador/consultor/analista/auxiliar -> FUNCIONARIO.
// Granularidad fina (coordinador full, analista/auxiliar limitado, consultor lectura) llega en Fase 2
// vía fnc.roles (client roles KC). nav:false = oculto (URL con guard).
const MODULES = [
  { path: '/dashboard', title: 'Dashboard', roles: ['ADMIN', 'FUNCIONARIO'], nav: true },
  { path: '/distribucion', title: 'Distribución Recursos', roles: ['ADMIN', 'FUNCIONARIO'], nav: true },
  { path: '/adjudicaciones', title: 'Adjudicaciones', roles: ['ADMIN', 'FUNCIONARIO'], nav: true },
  { path: '/asignaciones', title: 'Asignaciones', roles: ['ADMIN', 'FUNCIONARIO'], nav: true },
  { path: '/ordenes-sap', title: 'Órdenes SAP', roles: ['ADMIN', 'FUNCIONARIO'], nav: true },
  { path: '/contratos', title: 'Contratos', roles: ['ADMIN', 'FUNCIONARIO'], nav: true },
  { path: '/seguridad', title: 'Seguridad', roles: ['ADMIN'], nav: true },
];

function roleCatalog() {
  return (process.env.CLIENT_ROLES || 'admin,consultor').split(',').map((r) => r.trim()).filter(Boolean);
}

function canAccess(role, mod) {
  return mod.roles.includes(role);
}

module.exports = { MODULES, roleCatalog, canAccess };
