import { getSessionUser } from '@/lib/get-session-user';
import { MODULE_MATRIX, accessLevel } from '@/lib/client-roles';

export default async function DashboardPage() {
  const user = await getSessionUser();
  const roles = user?.roles ?? [];
  const first = (roles[0] ?? '').toLowerCase();
  const visible = MODULE_MATRIX.filter((m) => roles.some((r) => accessLevel(r, m) !== 'none'));

  return (
    <div>
      <p className="text-xs font-semibold tracking-widest" style={{ color: 'var(--primary)' }}>SIP-FNC · TABLERO</p>
      <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: 'var(--font-headline)' }}>
        Hola, {user?.displayName}
      </h1>
      <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
        Gestión e informes contables por periodos · Rol: {roles.join(', ') || first}
      </p>
      <div className="mt-4 rounded-2xl p-5 gradient-primary" style={{ color: 'var(--on-primary)' }}>
        <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-headline)' }}>¿Qué gestiona SIP?</h2>
        <p className="text-sm mt-1 opacity-90">
          Cada año el Comité autoriza distribuir recursos por municipio y circunscripción (vigencia actual y
          anteriores). Las asignaciones descuentan de su distribución, los proyectos se cargan en SAP y la
          ejecución mensual reduce los saldos en orden: vigencias anteriores primero.
        </p>
      </div>
      <div className="grid gap-4 mt-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {visible.map((m) => (
          <a
            key={m.route}
            href={m.route}
            className="rounded-2xl p-5 no-underline shadow-ambient"
            style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}
          >
            <h2 className="text-base font-bold">{m.module}</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
              Acceso: {roles.map((r) => `${r} (${accessLevel(r, m)})`).join(' · ')}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
