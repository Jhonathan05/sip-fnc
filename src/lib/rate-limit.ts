/**
 * Rate limit anti-DoS por IP en /api/* con cambio en caliente (skill fnc-rate-limit).
 * Verificación en handlers Node (runtime compartido), NUNCA en middleware Edge.
 * Default 600 req/min: ~40× sobre usuario activo, seguro tras NAT corporativo. Nunca <10 en real.
 */

const ENV_MAX = Number.parseInt(process.env.RATE_LIMIT_API_PER_MIN ?? '', 10) || 600;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
let hotOverride: number | null = null;

export function setRateLimit(perMin: number): void {
  hotOverride = perMin;
  buckets.clear();
}

export function rateLimitMax(): number {
  return hotOverride ?? ENV_MAX;
}

const WINDOW_MS = 60_000;

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const max = rateLimitMax();
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    if (buckets.size > 10_000) {
      // poda oportunista
      for (const [k, v] of buckets) {
        if (now - v.windowStart >= WINDOW_MS) buckets.delete(k);
        if (buckets.size <= 8_000) break;
      }
    }
    return { allowed: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count <= max) return { allowed: true, retryAfterSec: 0 };
  return { allowed: false, retryAfterSec: Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000) };
}
