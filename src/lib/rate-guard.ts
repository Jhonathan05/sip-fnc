import { NextResponse } from 'next/server';
import { checkRateLimit } from './rate-limit';

/** IP real detrás de Cloudflare/proxy: cf-connecting-ip → x-forwarded-for → x-real-ip */
export function getRealIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() || '0.0.0.0';
}

/**
 * Primera línea de cada handler /api/* (exactamente una vez por handler).
 * Sin esto el rate-limit ve IPs Docker y se auto-bloquea.
 */
export async function rateGuard(request: Request): Promise<NextResponse | null> {
  const rl = checkRateLimit(getRealIp(request));
  if (!rl.allowed) {
    const res = NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta de nuevo en unos segundos.' },
      { status: 429 },
    );
    res.headers.set('Retry-After', String(rl.retryAfterSec));
    return res;
  }
  return null;
}
