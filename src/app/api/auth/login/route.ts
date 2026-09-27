import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type FncSession } from '@/lib/session';
import { getMockSession, isKeycloakMode } from '@/lib/auth-provider';
import { rateGuard } from '@/lib/rate-guard';
import { timingSafeEqual } from 'crypto';

export const runtime = 'nodejs';

const CSRF_COOKIE = 'fnc-csrf-token';
const CSRF_HEADER = 'x-csrf-token';
const ACTIVITY_COOKIE = 'sip-fnc_activity';

function csrfOk(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  const m = cookie.match(/(?:^|;\s*)fnc-csrf-token=([^;]+)/);
  const a = m?.[1] ?? '';
  const b = request.headers.get(CSRF_HEADER) ?? '';
  if (!a || !b || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Mock: setea sesión FncSession directamente → redirect dashboard.
 * Keycloak: 403 login local deshabilitado (Opción B skill OIDC).
 */
export async function POST(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  if (isKeycloakMode()) {
    return NextResponse.json({ error: 'Login local deshabilitado. Usa Comité Tolima.' }, { status: 403 });
  }
  if (!csrfOk(request)) {
    return NextResponse.json({ error: 'CSRF token inválido.' }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true, redirect: '/dashboard' });
  const cookieStore = await cookies();
  const session = await getIronSession<FncSession>(cookieStore, sessionOptions);
  Object.assign(session, getMockSession());
  await session.save();
  res.cookies.set(ACTIVITY_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  const { writeAudit } = await import('@/lib/audit');
  await writeAudit({
    actorSub: 'mock-00000000-0000-0000-0000-000000000001',
    actorEmail: 'dev@test.local',
    action: 'login.mock',
    module: 'auth',
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
  });
  return res;
}

export async function GET() {
  const store = await cookies();
  void store.get(CSRF_COOKIE);
  return NextResponse.json({ error: 'Método no permitido' }, { status: 405 });
}
