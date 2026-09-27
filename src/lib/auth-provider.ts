import type { FncSession } from './session';
import { SESSION_ABSOLUTE_TTL_SEC } from './session';

const MOCK_ROLES = (process.env.MOCK_ROLES ?? 'admin').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);

/**
 * Garantía del flip mock → keycloak: ambos modos producen exactamente FncSession.
 * En mock, la sesión es idéntica en forma a la real (valores de dev).
 */
export function getMockSession(): FncSession {
  const now = Math.floor(Date.now() / 1000);
  const roles = MOCK_ROLES.length > 0 ? MOCK_ROLES : ['admin'];
  return {
    sub: 'mock-00000000-0000-0000-0000-000000000001',
    email: 'dev@test.local',
    displayName: 'Dev Local',
    roles,
    role: roles.includes('admin') ? 'ADMIN' : 'FUNCIONARIO',
    fingerprint: 'mock-fingerprint-dev',
    iat: now,
    exp: now + SESSION_ABSOLUTE_TTL_SEC,
  };
}

export function isKeycloakMode(): boolean {
  return process.env.AUTH_PROVIDER === 'keycloak';
}
