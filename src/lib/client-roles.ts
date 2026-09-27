/**
 * Catálogo de client roles + matriz módulo×rol (F0.4, acta aprobada).
 * CLIENT_ROLES existe desde el día 1 aunque no haya login.
 */

export const CLIENT_ROLES = (process.env.CLIENT_ROLES ?? 'admin,coordinador,consultor,analista,auxiliar')
  .split(',')
  .map((r) => r.trim().toLowerCase())
  .filter(Boolean);

export type Visibility = 'permitido' | 'deshabilitado' | 'oculto';

export interface ModuleRule {
  module: string;
  route: string;
  /** roles con acceso total */
  full: string[];
  /** roles con carga+consulta sin borrar maestros */
  limited: string[];
  /** roles solo lectura e informes */
  readonly: string[];
}

export const MODULE_MATRIX: ModuleRule[] = [
  {
    module: 'Distribución Recursos',
    route: '/distribucion',
    full: ['admin', 'coordinador'],
    limited: ['analista', 'auxiliar'],
    readonly: ['consultor'],
  },
  {
    module: 'Adjudicaciones',
    route: '/adjudicaciones',
    full: ['admin', 'coordinador'],
    limited: ['analista', 'auxiliar'],
    readonly: ['consultor'],
  },
  {
    module: 'Asignaciones',
    route: '/asignaciones',
    full: ['admin', 'coordinador'],
    limited: ['analista', 'auxiliar'],
    readonly: ['consultor'],
  },
  {
    module: 'Órdenes SAP',
    route: '/ordenes-sap',
    full: ['admin', 'coordinador'],
    limited: ['analista', 'auxiliar'],
    readonly: ['consultor'],
  },
  {
    module: 'Contratos',
    route: '/contratos',
    full: ['admin', 'coordinador'],
    limited: ['analista', 'auxiliar'],
    readonly: ['consultor'],
  },
  {
    module: 'Seguridad',
    route: '/seguridad',
    full: ['admin'],
    limited: [],
    readonly: [],
  },
];

/** ¿Puede el rol ver el módulo? (coordinador ve todo menos Seguridad) */
export function canAccessModule(role: string, rule: ModuleRule): boolean {
  const r = role.toLowerCase();
  return rule.full.includes(r) || rule.limited.includes(r) || rule.readonly.includes(r);
}

/** Nivel de acceso: full | limited | readonly | none */
export function accessLevel(role: string, rule: ModuleRule): 'full' | 'limited' | 'readonly' | 'none' {
  const r = role.toLowerCase();
  if (rule.full.includes(r)) return 'full';
  if (rule.limited.includes(r)) return 'limited';
  if (rule.readonly.includes(r)) return 'readonly';
  return 'none';
}

/** Mapeo KC → rol app: 'admin' → ADMIN, resto → FUNCIONARIO (contrato inmutable). */
export function mapKcRolesToAppRole(roles: string[]): 'ADMIN' | 'FUNCIONARIO' {
  return roles.map((r) => r.toLowerCase()).includes('admin') ? 'ADMIN' : 'FUNCIONARIO';
}
