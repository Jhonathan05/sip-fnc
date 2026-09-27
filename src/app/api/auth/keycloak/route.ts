import { NextResponse } from 'next/server';
import { getKcClient, getAppBaseUrl, pkce } from '@/lib/keycloak';
import { rateGuard } from '@/lib/rate-guard';

export const runtime = 'nodejs';

/**
 * PKCE init: state+nonce+verifier en cookies httpOnly 15 min → 307 a KC con
 * code_challenge S256 y prompt=login OBLIGATORIO (política FNC: sin SSO entre apps).
 */
export async function GET(request: Request) {
  const limited = await rateGuard(request);
  if (limited) return limited;
  const redirectUri = `${getAppBaseUrl()}/api/auth/callback/keycloak`;
  const client = getKcClient(redirectUri);
  const state = pkce.state();
  const nonce = pkce.nonce();
  const verifier = pkce.verifier();
  const url = client.authorizationUrl({
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: pkce.challenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'login',
  });
  const res = NextResponse.redirect(url, 307);
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 15 * 60,
  };
  res.cookies.set('kc_state', state, cookieOpts);
  res.cookies.set('kc_nonce', nonce, cookieOpts);
  res.cookies.set('kc_verifier', verifier, cookieOpts);
  return res;
}
