import { getSessionUser } from '@/lib/get-session-user';

// Dashboard virgen: bienvenida + contexto del sistema. Los módulos nacen en Fase 2 con negocio real.
export default async function DashboardPage() {
  const user = await getSessionUser();
  const roles = user?.roles ?? [];

  return (
    <div>
      <p className="text-xs font-semibold tracking-widest" style={{ color: 'var(--primary)' }}>SIP-FNC · TABLERO</p>
      <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: 'var(--font-headline)' }}>
        Hola, {user?.displayName}
      </h1>
      <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
        Gestión e informes contables por periodos · Rol: {roles.join(', ')}
      </p>
      <div className="mt-4 rounded-2xl p-5 gradient-primary" style={{ color: 'var(--on-primary)' }}>
        <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-headline)' }}>¿Qué gestiona SIP?</h2>
        <p className="text-sm mt-1 opacity-90">
          Cada año el Comité autoriza distribuir recursos por municipio y circunscripción (vigencia actual y
          anteriores). Las asignaciones descuentan de su distribución, los proyectos se cargan en SAP y la
          ejecución mensual reduce los saldos en orden: vigencias anteriores primero.
        </p>
      </div>
      <div className="mt-4 rounded-2xl p-5" style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}>
        <h2 className="text-base font-bold">Sistema en construcción</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
          Los módulos (Distribución, Adjudicaciones, Asignaciones, Órdenes SAP, Contratos) se habilitan aquí
          a medida que se construyen con negocio real. Sin páginas vacías.
        </p>
      </div>
    </div>
  );
}
