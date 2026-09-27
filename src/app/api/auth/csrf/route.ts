import { NextResponse } from 'next/server';
import { rateGuard } from '@/lib/rate-guard';

export const runtime = 'nodejs';

const CSRF_COOKIE = 'fnc-csrf-token';

/** Emite token CSRF double-submit para el form de login. */
export async function GET(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  const res = NextResponse.json({ csrfToken: token });
  res.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  return res;
}
