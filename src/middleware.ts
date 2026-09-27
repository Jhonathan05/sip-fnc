import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type FncSession, SESSION_ABSOLUTE_TTL_SEC } from './lib/session';

/**
 * Guards por rol + renovación + rutas exentas (PROMPT-CREAR-APP §P7).
 * Edge-safe: sin Prisma, sin openid-client, sin crypto node (WebCrypto).
 */

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/keycloak',
  '/api/auth/callback/keycloak',
  '/api/auth/login',
  '/api/auth/csrf',
  '/error',
];

const INACTIVITY_MS = 5 * 60 * 1000; // 5 min (acta F0)
const CSRF_COOKIE = 'fnc-csrf-token';
const CSRF_HEADER = 'x-csrf-token';
const ACTIVITY_COOKIE = 'sip-fnc_activity';

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'));
}

function getRealIp(request: NextRequest): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() ?? '0.0.0.0';
}

async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** fingerprint canónico: SHA-256(substring(UA,0,64) + ':' + IP primeros 3 octetos) */
export async function computeFingerprint(request: NextRequest): Promise<string> {
  const ua = (request.headers.get('user-agent') ?? '').substring(0, 64);
  const ipParts = getRealIp(request).split('.');
  const prefix = ipParts.length >= 3 ? ipParts.slice(0, 3).join('.') : getRealIp(request);
  return sha256hex(`${ua}:${prefix}`);
}

function getUaHash(request: NextRequest): string {
  const ua = request.headers.get('user-agent') || 'unknown';
  let hash = 2166136261;
  for (let i = 0; i < ua.length; i++) {
    hash ^= ua.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function getIpPrefix(request: NextRequest): string {
  const parts = getRealIp(request).split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : getRealIp(request).substring(0, 8);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // CSP con nonce por request
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes));
  const csp = `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
  const baseResponse = NextResponse.next({
    request: { headers: new Headers({ ...Object.fromEntries(request.headers), 'x-nonce': nonce }) },
  });
  baseResponse.headers.set('Content-Security-Policy', csp);

  if (isPublic(pathname)) return baseResponse;

  // CSRF double-submit en mutantes /api (Edge: comparación directa)
  if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const cookieCsrf = request.cookies.get(CSRF_COOKIE)?.value;
    const headerCsrf = request.headers.get(CSRF_HEADER);
    if (!cookieCsrf || !headerCsrf || cookieCsrf !== headerCsrf) {
      return NextResponse.json({ error: 'CSRF token inválido.' }, { status: 403 });
    }
  }

  const response = baseResponse;
  const session = await getIronSession<FncSession>(request, response, sessionOptions);
  const nowSec = Math.floor(Date.now() / 1000);

  if (!session.sub || !(session.exp && nowSec < session.exp)) {
    if (session.sub) {
      try {
        await session.destroy();
      } catch {
        // sesión ya inválida
      }
    }
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    const url = new URL('/login', request.url);
    if (session.sub) url.searchParams.set('expired', '1');
    return NextResponse.redirect(url);
  }

  // TTL absoluto 8h (respaldo aunque exp ya lo cubre)
  if (session.iat && nowSec - session.iat > SESSION_ABSOLUTE_TTL_SEC) {
    await session.destroy();
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sesión expirada.' }, { status: 401 });
    const url = new URL('/login', request.url);
    url.searchParams.set('expired', '1');
    return NextResponse.redirect(url);
  }

  // Fingerprint dual (se omite en mock: fingerprint 'mock-*')
  if (!session.fingerprint.startsWith('mock-')) {
    const [fp, uaHash, ipPrefix] = await Promise.all([
      computeFingerprint(request),
      Promise.resolve(getUaHash(request)),
      Promise.resolve(getIpPrefix(request)),
    ]);
    void uaHash;
    void ipPrefix;
    if (fp !== session.fingerprint) {
      await session.destroy();
      if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
      const url = new URL('/login', request.url);
      url.searchParams.set('reason', 'security');
      return NextResponse.redirect(url);
    }
  }

  // Inactividad 5 min (cookie deslizante solo renovada por /api/auth/activity)
  const renewalPaths = ['/api/auth/activity', '/api/auth/logout', '/api/auth/login'];
  if (!renewalPaths.some((p) => pathname.startsWith(p))) {
    const lastActivity = Number(request.cookies.get(ACTIVITY_COOKIE)?.value ?? '0');
    if (!lastActivity || Date.now() - lastActivity > INACTIVITY_MS) {
      await session.destroy();
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Sesión cerrada por inactividad.', code: 'INACTIVE' }, { status: 401 });
      }
      const url = new URL('/login', request.url);
      url.searchParams.set('reason', 'inactivity');
      return NextResponse.redirect(url);
    }
  }

  // Guard de rol: /seguridad solo admin (resto de módulos: control fino en páginas/APIs)
  if (pathname.startsWith('/seguridad')) {
    const roles = (session.roles ?? []).map((r) => r.toLowerCase());
    if (!roles.includes('admin')) {
      if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Prohibido.' }, { status: 403 });
      const url = new URL('/error', request.url);
      url.searchParams.set('reason', 'forbidden');
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
