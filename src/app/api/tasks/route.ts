import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { unsealData } from 'iron-session';
import { sessionOptions, isSessionAlive, type FncSession } from '@/lib/session';
import { rateGuard } from '@/lib/rate-guard';
import { listTasks, createTask, completeTask } from '@/lib/notify';
import { z } from 'zod';

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

/** Bandeja de pendientes del rol (realtime B). */
export async function GET(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  const session = await me();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  return NextResponse.json({ tasks: listTasks(session.roles, true) });
}

const taskSchema = z.object({
  role: z.string().min(2).max(40),
  title: z.string().min(3).max(200),
  detail: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  const session = await me();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (session.role !== 'ADMIN' && !session.roles.map((r) => r.toLowerCase()).includes('coordinador')) {
    return NextResponse.json({ error: 'Prohibido.' }, { status: 403 });
  }
  const parsed = taskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.', issues: parsed.error.issues }, { status: 400 });
  const task = createTask(parsed.data);
  const { writeAudit } = await import('@/lib/audit');
  await writeAudit({
    actorSub: session.sub,
    actorEmail: session.email,
    action: 'task.create',
    module: 'tasks',
    entityId: task.id,
    detail: task.title,
  });
  return NextResponse.json({ ok: true, task }, { status: 201 });
}

export async function PATCH(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  const session = await me();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id || !completeTask(body.id, session.sub)) {
    return NextResponse.json({ error: 'Tarea no encontrada.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
