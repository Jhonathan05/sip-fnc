// Navegación SIP-FNC en árbol (módulo → subcategoría → hoja).
// Fuente: docs/requerimientos/sip 1/Modulos (5 módulos legacy) + transversales.
// Roles app: ADMIN / FUNCIONARIO (admin -> ADMIN, resto -> FUNCIONARIO).
// Granularidad fina por client role (coordinador/analista/consultor) llega en Fase 2 vía fnc.roles.
const BOTH = ['ADMIN', 'FUNCIONARIO'];
const ADMIN_ONLY = ['ADMIN'];

const NAV = [
  { path: '/dashboard', title: 'Dashboard', icon: 'dashboard', roles: BOTH, nav: true },
  {
    path: '/distribucion', title: 'Distribución Recursos', icon: 'distribucion', roles: BOTH, nav: true,
    children: [
      {
        kind: 'maestro',
        key: 'actualizaciones', title: 'Actualizaciones', icon: 'tareas',
                desc: 'Maestros y distribuciones por vigencia.',
        children: [
          { path: '/distribucion/actualizaciones/circunscripciones', title: 'Circunscripciones', roles: BOTH, fields: [{ label: 'Código', type: 'text' }, { label: 'Nombre', type: 'text' }] },
          { path: '/distribucion/actualizaciones/municipios', title: 'Municipios', roles: BOTH, fields: [{ label: 'Código', type: 'text' }, { label: 'Nombre', type: 'text' }, { label: 'Circunscripción', type: 'select', options: ['Norte', 'Sur', 'Oriente', 'Occidente', 'Centro'] }] },
          { path: '/distribucion/actualizaciones/tipos-distribuciones', title: 'Tipos de Distribuciones', roles: BOTH, fields: [{ label: 'Código', type: 'text' }, { label: 'Nombre', type: 'text' }] },
          { path: '/distribucion/actualizaciones/distribuciones', title: 'Distribuciones', roles: BOTH, fields: [{ label: 'Tipo', type: 'select', options: ['Municipio vigencia actual', 'Municipio anteriores', 'Circunscripción actual', 'Circunscripción anteriores'] }, { label: 'Año', type: 'number' }, { label: 'Presupuesto', type: 'number' }] },
          { path: '/distribucion/actualizaciones/distribucion-municipio', title: 'Distribución por Municipio', roles: BOTH, fields: [{ label: 'Número', type: 'number' }, { label: 'Tipo', type: 'number' }, { label: 'Año', type: 'number' }, { label: 'Ppto', type: 'number' }, { label: 'Municipio', type: 'text' }, { label: 'Valor', type: 'number' }] },
        ],
      },
      {
        kind: 'informe',
        key: 'informes', title: 'Informes', icon: 'informes',
        desc: 'Saldos y movimientos por distribución.',
        children: [
          { path: '/distribucion/informes/por-distribucion', title: 'Por Distribución', roles: BOTH },
          { path: '/distribucion/informes/por-ano', title: 'Distribuciones por Año', roles: BOTH },
          { path: '/distribucion/informes/saldos', title: 'Saldos Distribuciones', roles: BOTH },
          { path: '/distribucion/informes/cuenta-corriente', title: 'Cuenta Corriente por Municipio', roles: BOTH },
        ],
      },
    ],
  },
  {
    path: '/adjudicaciones', title: 'Adjudicaciones', icon: 'adjudicaciones', roles: BOTH, nav: true,
    children: [
      {
        kind: 'maestro',
        key: 'actualizaciones', title: 'Actualizaciones', icon: 'tareas',
                desc: 'Maestros de contratistas e invitaciones.',
        children: [
          { path: '/adjudicaciones/actualizaciones/contratistas', title: 'Maestro de Contratistas', roles: BOTH },
          { path: '/adjudicaciones/actualizaciones/invitaciones', title: 'Maestro de Invitaciones o Órdenes', roles: BOTH },
          { path: '/adjudicaciones/actualizaciones/movimiento-invitaciones', title: 'Movimiento de Invitaciones', roles: BOTH },
          { path: '/adjudicaciones/actualizaciones/adjudicaciones', title: 'Maestro de Adjudicaciones', roles: BOTH },
          { path: '/adjudicaciones/actualizaciones/clases-contratistas', title: 'Clases de Contratistas', roles: BOTH },
          { path: '/adjudicaciones/actualizaciones/tipos-suspension', title: 'Tipo de Suspensión', roles: BOTH },
        ],
      },
      {
        kind: 'consulta',
        key: 'consultas', title: 'Consultas', icon: 'consultas',
        desc: 'Consultas rápidas de contratistas.',
        children: [
          { path: '/adjudicaciones/consultas/sancionados', title: 'Contratistas Sancionados', roles: BOTH },
        ],
      },
      {
        kind: 'informe',
        key: 'informes', title: 'Informes', icon: 'informes',
        desc: 'Estadísticas por contratista.',
        children: [
          { path: '/adjudicaciones/informes/estadistica-contratista', title: 'Estadística por Contratista', roles: BOTH },
        ],
      },
      {
        kind: 'proceso',
        key: 'procesos-especiales', title: 'Procesos Especiales', icon: 'procesos',
        desc: 'Procesos auditables de selección.',
        children: [
          { path: '/adjudicaciones/procesos-especiales/sorteo', title: 'Sorteo de Contrataciones', roles: BOTH },
        ],
      },
    ],
  },
  {
    path: '/asignaciones', title: 'Asignaciones', icon: 'asignaciones', roles: BOTH, nav: true,
    children: [
      {
        kind: 'maestro',
        key: 'actualizaciones', title: 'Actualizaciones', icon: 'tareas',
        desc: 'Creación de asignaciones y estados.',
        children: [
          { path: '/asignaciones/actualizaciones/asignaciones', title: 'Asignaciones', roles: BOTH },
          { path: '/asignaciones/actualizaciones/codigos-estado', title: 'Códigos de Estado', roles: BOTH },
        ],
      },
      {
        kind: 'informe',
        key: 'informes', title: 'Informes', icon: 'informes',
        desc: 'Ejecución y estado de asignaciones.',
        children: [
          { path: '/asignaciones/informes/ejecucion-detallada', title: 'Ejecución Detallada', roles: BOTH },
          { path: '/asignaciones/informes/por-estado', title: 'Asignaciones por Estado', roles: BOTH },
          { path: '/asignaciones/informes/por-supervisor', title: 'Asignaciones por Supervisor', roles: BOTH },
          { path: '/asignaciones/informes/resumen-supervisor', title: 'Resumen Estado General por Supervisor', roles: BOTH },
          { path: '/asignaciones/informes/relacion-ordenes', title: 'Relación Asignación Órdenes', roles: BOTH },
        ],
      },
    ],
  },
  {
    path: '/ordenes-sap', title: 'Órdenes SAP', icon: 'sap', roles: BOTH, nav: true,
    children: [
      {
        kind: 'proceso',
        key: 'actualizaciones', title: 'Actualizaciones', icon: 'tareas',
                desc: 'Cargue de presupuesto SAP.',
        children: [
          { path: '/ordenes-sap/actualizaciones/cargue', title: 'Cargue de Presupuesto', roles: BOTH },
        ],
      },
      {
        kind: 'proceso',
        key: 'procesos', title: 'Procesos', icon: 'procesos',
        desc: 'Actualización mensual de ejecución.',
        children: [
          { path: '/ordenes-sap/procesos/inversion-mensual', title: 'Actualiza Inversión Mensual', roles: BOTH },
        ],
      },
    ],
  },
  {
    path: '/contratos', title: 'Contratos', icon: 'contratos', roles: BOTH, nav: true,
    children: [
      {
        kind: 'maestro',
        key: 'actualizaciones', title: 'Actualizaciones', icon: 'tareas',
        desc: 'Contratos, otrosíes y maestros.',
        children: [
          { path: '/contratos/actualizaciones/contratos-convenios', title: 'Contratos & Convenios', roles: BOTH },
          { path: '/contratos/actualizaciones/otrosi', title: 'Otrosíes', roles: BOTH },
          { path: '/contratos/actualizaciones/tipos-documentos', title: 'Tipos de Documentos', roles: BOTH },
          { path: '/contratos/actualizaciones/clase-contratos', title: 'Clase de Contratos', roles: BOTH },
          { path: '/contratos/actualizaciones/dependencias-origen', title: 'Dependencias de Origen', roles: BOTH },
          { path: '/contratos/actualizaciones/tipos-presupuestos', title: 'Tipos de Presupuestos', roles: BOTH },
          { path: '/contratos/actualizaciones/tipos-otrosi', title: 'Tipos de Otrosí', roles: BOTH },
          { path: '/contratos/actualizaciones/tipos-polizas', title: 'Tipos de Pólizas', roles: BOTH },
          { path: '/contratos/actualizaciones/modalidades-financiacion', title: 'Modalidades de Financiación', roles: BOTH },
          { path: '/contratos/actualizaciones/tipos-obras', title: 'Tipos de Obras', roles: BOTH },
          { path: '/contratos/actualizaciones/clases-obras', title: 'Clases de Obras', roles: BOTH },
          { path: '/contratos/actualizaciones/bancos', title: 'Bancos', roles: BOTH },
          { path: '/contratos/actualizaciones/supervisores', title: 'Supervisores', roles: BOTH },
          { path: '/contratos/actualizaciones/codigos-estado', title: 'Códigos de Estado', roles: BOTH },
          { path: '/contratos/actualizaciones/maestro-terceros', title: 'Maestro de Terceros', roles: BOTH },
        ],
      },
      {
        kind: 'informe',
        key: 'informes', title: 'Informes', icon: 'informes',
                desc: 'Vigencias, vencimientos y maestro.',
        children: [
          { path: '/contratos/informes/por-vigencia', title: 'Relación por Vigencia', roles: BOTH },
          { path: '/contratos/informes/relacion-convenios', title: 'Relación de Convenios', roles: BOTH },
          { path: '/contratos/informes/por-estados', title: 'Por Estados', roles: BOTH },
          { path: '/contratos/informes/por-presupuesto', title: 'Por Presupuesto', roles: BOTH },
          { path: '/contratos/informes/a-vencerse', title: 'Contratos a Vencerse', roles: BOTH },
          { path: '/contratos/informes/polizas-vencerse', title: 'Pólizas a Vencerse', roles: BOTH },
          { path: '/contratos/informes/exporta-maestro', title: 'Exporta Maestro', roles: BOTH },
        ],
      },
    ],
  },
];

// Categoría global de configuración, anclada al fondo del nav.
const CONFIG = [
  { path: '/seguridad', title: 'Seguridad', icon: 'seguridad', roles: ADMIN_ONLY, nav: true },
  { path: '/roles', title: 'Roles', icon: 'roles', roles: BOTH, nav: true },
  { path: '#perfil', title: 'Perfil', icon: 'consultas', roles: BOTH, nav: true, modal: 'perfil' },
];

// Compat: lista plana de nivel módulo (matriz viva + guards viejos).
const MODULES = NAV.map((m) => ({ path: m.path, title: m.title, roles: m.roles, nav: m.nav !== false }));

function canAccess(role, mod) {
  return (mod.roles || []).includes(role);
}

/** Hojas planas con su contexto (módulo + sub) para generar rutas con guard. */
function flattenLeaves() {
  const out = [];
  for (const mod of NAV) {
    for (const sub of mod.children || []) {
      for (const leaf of sub.children || []) {
        out.push({ leaf, sub, mod });
      }
    }
  }
  return out;
}

function findLeaf(path) {
  for (const { leaf, sub, mod } of flattenLeaves()) {
    if (leaf.path === path) return { leaf, sub, mod };
  }
  return null;
}

module.exports = { MODULES, NAV, CONFIG, BOTH, ADMIN_ONLY, canAccess, flattenLeaves, findLeaf };


