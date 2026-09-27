import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { unsealData } from 'iron-session';
import { sessionOptions, isSessionAlive, type FncSession } from '@/lib/session';
import { rateGuard } from '@/lib/rate-guard';

export const runtime = 'nodejs';

/** Contrato FncSession completo (P8 check 3: mismos campos en mock y KC). */
export async function GET(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  const store = await cookies();
  const sealed = store.get('sip-fnc_session')?.value;
  if (!sealed || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  try {
    const data = (await unsealData<FncSession>(sealed, sessionOptions)) as FncSession;
    if (!isSessionAlive(data)) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    const { sub, email, displayName, roles, role, fingerprint, iat, exp } = data;
    return NextResponse.json({ sub, email, displayName, roles, role, fingerprint, iat, exp });
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
}
