import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/get-session-user';
import { MODULE_MATRIX, accessLevel } from '@/lib/client-roles';

/** Stub de módulo con guard por rol (el negocio se construye en Fase 2). */
export async function ModuleStub({ route }: { route: string }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const rule = MODULE_MATRIX.find((m) => m.route === route);
  if (!rule) redirect('/error?reason=forbidden');
  const levels = user.roles.map((r) => accessLevel(r, rule));
  if (levels.every((l) => l === 'none')) redirect('/error?reason=forbidden');
  const level = levels.includes('full') ? 'total' : levels.includes('limited') ? 'carga y consulta (sin borrar maestros)' : 'solo lectura e informes';
  return (
    <div>
      <p className="text-xs font-semibold tracking-widest" style={{ color: 'var(--primary)' }}>SIP-FNC · MÓDULO</p>
      <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: 'var(--font-headline)' }}>{rule.module}</h1>
      <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
        Tu acceso: {level}. El negocio de este módulo se construye en la siguiente fase.
      </p>
    </div>
  );
}
