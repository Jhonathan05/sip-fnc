import { NextResponse } from 'next/server';
import { rateLimitMax, setRateLimit } from '@/lib/rate-limit';
import { rateGuard } from '@/lib/rate-guard';
import { cookies } from 'next/headers';
import { unsealData } from 'iron-session';
import { sessionOptions, isSessionAlive, type FncSession } from '@/lib/session';

export const runtime = 'nodejs';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const sealed = store.get('sip-fnc_session')?.value;
  if (!sealed || !process.env.SESSION_SECRET) return false;
  try {
    const data = (await unsealData<FncSession>(sealed, sessionOptions)) as FncSession;
    if (!isSessionAlive(data)) return false;
    if (data.role === 'ADMIN') return true;
    return data.roles.map((r) => r.toLowerCase()).includes('admin');
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  if (!(await isAdmin())) return NextResponse.json({ error: 'Prohibido.' }, { status: 403 });
  return NextResponse.json({ perMin: rateLimitMax() });
}

/** Cambio en caliente (volátil: revierte al env al reiniciar). Exento del limiter: es la llave. */
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Prohibido.' }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { perMin?: number } | null;
  const perMin = Number(body?.perMin);
  // Rango 1–100000: valores <10 solo para pruebas (en real, NAT corporativo: nunca <10).
  if (!Number.isInteger(perMin) || perMin < 1 || perMin > 100000) {
    return NextResponse.json({ error: 'perMin entero entre 1 y 100000.' }, { status: 400 });
  }
  setRateLimit(perMin);
  const store = await cookies();
  const sealed = store.get('sip-fnc_session')?.value;
  let who = 'unknown';
  try {
    const data = (await unsealData<FncSession>(sealed ?? '', sessionOptions)) as FncSession;
    who = data.email ?? who;
  } catch {
    // sin identidad
  }
  console.info(`[rate-limit] override a ${perMin}/min por ${who} at ${new Date().toISOString()}`);
  return NextResponse.json({ ok: true, perMin });
}
