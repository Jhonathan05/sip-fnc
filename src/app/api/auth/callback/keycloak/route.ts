import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { createHash } from 'crypto';
import { sessionOptions, type FncSession, SESSION_ABSOLUTE_TTL_SEC } from '@/lib/session';
import { getKcClient, getAppBaseUrl, getClientId, decodeAccessRoles } from '@/lib/keycloak';
import { mapKcRolesToAppRole } from '@/lib/client-roles';
import { rateGuard, getRealIp } from '@/lib/rate-guard';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

function terminal(request: Request, reason: string): NextResponse {
  const url = new URL('/error', getAppBaseUrl());
  url.searchParams.set('reason', reason);
  void request;
  return NextResponse.redirect(url, 307);
}

function fingerprintOf(ua: string, ip: string): string {
  const prefix = ip.split('.').length >= 3 ? ip.split('.').slice(0, 3).join('.') : ip;
  return createHash('sha256').update(`${ua.substring(0, 64)}:${prefix}`).digest('hex');
}

/**
 * Valida state → canje code→tokens → roles resource_access[clientId] (fallback
 * realm) → upsert usuario por email (idempotente) → FncSession → /dashboard.
 * Fallos → /error?reason= TERMINAL (jamás ruta KC: evita loops).
 */
export async function GET(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  const reqUrl = new URL(request.url);
  const cookieHeader = request.headers.get('cookie') ?? '';
  const getCookie = (name: string) => cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? '';

  const params = Object.fromEntries(reqUrl.searchParams.entries());
  if (!params.code || !params.state) return terminal(request, 'state');
  if (getCookie('kc_state') !== params.state) return terminal(request, 'state');

  try {
    const redirectUri = `${getAppBaseUrl()}/api/auth/callback/keycloak`;
    const client = getKcClient(redirectUri);
    const tokenSet = await client.callback(redirectUri, params, {
      state: getCookie('kc_state'),
      nonce: getCookie('kc_nonce'),
      code_verifier: getCookie('kc_verifier'),
    });
    const claims = (tokenSet.claims() ?? {}) as Record<string, unknown>;
    const roles = decodeAccessRoles(tokenSet.access_token, claims, getClientId());
    const email = String(claims.email ?? '');
    if (!email) return terminal(request, 'profile');
    const displayName = String(claims.name ?? claims.preferred_username ?? email);
    const sub = String(claims.sub ?? email);

    // Upsert idempotente por email (re-login actualiza, nunca duplica)
    const db = getDb();
    if (db) {
      try {
        await db.user.upsert({
          where: { email },
          update: { displayName, kcSub: sub, roles },
          create: { email, displayName, kcSub: sub, roles },
        });
      } catch {
        // pre-migración: la sesión se crea igual, el upsert se reintentará
      }
    }

    const ua = request.headers.get('user-agent') ?? '';
    const now = Math.floor(Date.now() / 1000);
    const res = NextResponse.redirect(`${getAppBaseUrl()}/dashboard`, 307);
    const { cookies } = await import('next/headers');
    const session = await getIronSession<FncSession>(await cookies(), sessionOptions);
    const fnc: FncSession = {
      sub,
      email,
      displayName,
      roles,
      role: mapKcRolesToAppRole(roles),
      fingerprint: fingerprintOf(ua, getRealIp(request)),
      iat: now,
      exp: now + SESSION_ABSOLUTE_TTL_SEC,
    };
    Object.assign(session, fnc);
    await session.save();
    res.cookies.set('sip-fnc_activity', String(Date.now()), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_ABSOLUTE_TTL_SEC,
    });
    if (tokenSet.id_token) {
      res.cookies.set('kc_id_token', tokenSet.id_token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60,
      });
    }
    for (const c of ['kc_state', 'kc_nonce', 'kc_verifier']) res.cookies.delete(c);
    const { writeAudit } = await import('@/lib/audit');
    await writeAudit({ actorSub: sub, actorEmail: email, action: 'login.keycloak', module: 'auth', ip: getRealIp(request) });
    return res;
  } catch {
    return terminal(request, 'token');
  }
}
