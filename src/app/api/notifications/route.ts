import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { unsealData } from 'iron-session';
import { sessionOptions, isSessionAlive, type FncSession } from '@/lib/session';
import { rateGuard } from '@/lib/rate-guard';
import { listNotifications, markNotificationRead } from '@/lib/notify';

export const runtime = 'nodejs';

async function me(): Promise<FncSession | null> {
  const store = await cookies();
  const sealed = store.get('sip-fnc_session')?.value;
  if (!sealed || !process.env.SESSION_SECRET) return null;
  try {
    const data = (await unsealData<FncSession>(sealed, sessionOptions)) as FncSession;
    return isSessionAlive(data) ? data : null;
  } catch {
    return null;
  }
}

/** Campana de avisos del rol (realtime A). */
export async function GET(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  const session = await me();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  return NextResponse.json({ notifications: listNotifications(session.roles, session.sub) });
}

export async function PATCH(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  const session = await me();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id || !markNotificationRead(body.id, session.sub)) {
    return NextResponse.json({ error: 'Notificación no encontrada.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
