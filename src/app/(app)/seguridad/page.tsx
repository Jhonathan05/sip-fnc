import { listAudit } from '@/lib/audit';
import { rateLimitMax } from '@/lib/rate-limit';

// Panel admin: auditoría reciente + rate-limit en caliente (mini-form cliente aparte).
export default async function SeguridadPage() {
  const entries = await listAudit(50);
  const perMin = rateLimitMax();
  return (
    <div>
      <p className="text-xs font-semibold tracking-widest" style={{ color: 'var(--primary)' }}>SIP-FNC · ADMIN</p>
      <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: 'var(--font-headline)' }}>Seguridad</h1>
      <div className="mt-6 rounded-2xl p-5" style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}>
        <h2 className="text-base font-bold">Rate limit vigente: {perMin}/min por IP</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
          Cambio en caliente vía POST /api/admin/rate-limit (solo ADMIN). Volátil: revierte al env al reiniciar.
        </p>
      </div>
      <h2 className="text-base font-bold mt-6">Auditoría reciente ({entries.length})</h2>
      <div className="mt-3 space-y-2">
        {entries.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>Sin eventos aún. Cada acción (login, tareas, cambios) queda aquí.</p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="rounded-xl p-3 text-xs" style={{ border: '1px solid var(--outline-variant)' }}>
            <span className="font-mono">{e.at}</span> · <strong>{e.action}</strong> · {e.module} · {e.actorEmail || e.actorSub}
            {e.detail ? ` · ${e.detail}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
