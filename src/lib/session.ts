import type { SessionOptions } from 'iron-session';

/**
 * FncSession — forma canónica FNC (PROMPT-CREAR-APP §CONTRATO DE SESIÓN).
 * INMUTABLE: cualquier desviación rompe el flip mock → keycloak.
 * - KC: sub=userId uuid KC, roles=resource_access[clientId] (fallback realm_access)
 * - Mock: sub=uuid fijo por rol, roles=MOCK_ROLES
 */
export interface FncSession {
  sub: string;
  email: string;
  displayName: string;
  roles: string[];
  role: 'ADMIN' | 'FUNCIONARIO';
  fingerprint: string;
  iat: number;
  exp: number;
}

export const SESSION_ABSOLUTE_TTL_SEC = 28800; // 8h

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'sip-fnc_session',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_ABSOLUTE_TTL_SEC,
    path: '/',
  },
};

/** Validez por TTL absoluto (sin importar actividad). */
export function isSessionAlive(session: Partial<FncSession>, nowSec = Math.floor(Date.now() / 1000)): session is FncSession {
  return typeof session.sub === 'string' && session.sub.length > 0 && typeof session.exp === 'number' && nowSec < session.exp;
}
