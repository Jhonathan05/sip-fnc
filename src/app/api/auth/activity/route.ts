import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type FncSession } from '@/lib/session';
import { rateGuard } from '@/lib/rate-guard';

export const runtime = 'nodejs';

const ACTIVITY_COOKIE = 'sip-fnc_activity';

/** Renueva el timestamp de actividad (inactividad 5 min). Exenta del conteo de inactividad. */
export async function POST(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  const res = NextResponse.json({ ok: true });
  const session = await getIronSession<FncSession>(await cookies(), sessionOptions);
  if (!session.sub) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  res.cookies.set(ACTIVITY_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  return res;
}
