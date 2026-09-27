import { cookies } from 'next/headers';
import { unsealData } from 'iron-session';
import { sessionOptions, isSessionAlive, type FncSession } from '@/lib/session';
import { subscribeSSE } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SSE unidireccional: notificaciones + tareas (acta F0: A+B, sin chat).
 * La cookie de sesión viaja con EventSource; heartbeat 25s anti-proxy.
 */
export async function GET(request: Request) {
  const store = await cookies();
  const sealed = store.get('sip-fnc_session')?.value;
  if (!sealed || !process.env.SESSION_SECRET) {
    return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });
  }
  let me: FncSession;
  try {
    me = (await unsealData<FncSession>(sealed, sessionOptions)) as FncSession;
    if (!isSessionAlive(me)) throw new Error('expired');
  } catch {
    return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });
  }
  const myRoles = me.roles.map((r) => r.toLowerCase());

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // cliente desconectado
        }
      };
      send('hello', { ok: true, sub: me.sub });
      const off = subscribeSSE((event, data) => {
        if (event === 'notification') {
          const n = data as { audience: string[] };
          if (n.audience.length > 0 && !n.audience.some((a) => myRoles.includes(a.toLowerCase()))) return;
        }
        if (event === 'task') {
          const t = data as { role: string };
          if (!myRoles.includes(t.role.toLowerCase())) return;
        }
        send(event, data);
      });
      const beat = setInterval(() => send('ping', { t: Date.now() }), 25_000);
      request.signal.addEventListener('abort', () => {
        clearInterval(beat);
        off();
        try {
          controller.close();
        } catch {
          // ya cerrado
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
