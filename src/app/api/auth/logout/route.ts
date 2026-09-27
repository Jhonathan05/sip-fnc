import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, type FncSession } from '@/lib/session';
import { isKeycloakMode } from '@/lib/auth-provider';
import { getEndSessionUrl, getAppBaseUrl } from '@/lib/keycloak';
import { rateGuard } from '@/lib/rate-guard';

export const runtime = 'nodejs';

/** Destruye sesión DB+cookie, limpia kc_id_token, devuelve endSessionUrl (SSO). */
export async function POST(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  const res = NextResponse.json({ ok: true });
  const session = await getIronSession<FncSession>(await cookies(), sessionOptions);
  const sub = session.sub;
  try {
    await session.destroy();
  } catch {
    // ya destruida
  }
  res.cookies.delete('sip-fnc_activity');
  res.cookies.delete('kc_id_token');
  if (sub) {
    const { writeAudit } = await import('@/lib/audit');
    await writeAudit({ actorSub: sub, actorEmail: '', action: 'logout', module: 'auth' });
  }
  if (isKeycloakMode()) {
    return NextResponse.json({
      ok: true,
      endSessionUrl: `${getEndSessionUrl()}?post_logout_redirect_uri=${encodeURIComponent(`${getAppBaseUrl()}/login`)}`,
    });
  }
  return res;
}
