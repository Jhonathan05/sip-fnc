import { cookies } from 'next/headers';
import { unsealData } from 'iron-session';
import { sessionOptions, isSessionAlive, type FncSession } from './session';

/** Sesión del usuario en Server Components (la cookie la protege el middleware). */
export async function getSessionUser(): Promise<FncSession | null> {
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
