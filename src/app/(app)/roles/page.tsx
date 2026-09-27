import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/get-session-user';
import { MODULE_MATRIX, accessLevel } from '@/lib/client-roles';

// Matriz viva módulo×rol (F0.4): lo que ve cada rol con la sesión actual.
export default async function RolesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return (
    <div>
      <p className="text-xs font-semibold tracking-widest" style={{ color: 'var(--primary)' }}>SIP-FNC · GOBERNANZA</p>
      <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: 'var(--font-headline)' }}>Matriz de roles</h1>
      <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
        Tu sesión: {user.displayName} · {user.roles.join(', ')} ({user.role}) · exp-iat={user.exp - user.iat}s
      </p>
      <div className="mt-6 overflow-x-auto rounded-2xl" style={{ border: '1px solid var(--outline-variant)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-container-low)' }}>
              <th className="text-left p-3">Módulo</th>
              <th className="text-left p-3">Ruta</th>
              <th className="text-left p-3">Total</th>
              <th className="text-left p-3">Carga/consulta</th>
              <th className="text-left p-3">Lectura</th>
              <th className="text-left p-3">Tu acceso</th>
            </tr>
          </thead>
          <tbody>
            {MODULE_MATRIX.map((m) => (
              <tr key={m.route} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                <td className="p-3 font-semibold">{m.module}</td>
                <td className="p-3 font-mono text-xs">{m.route}</td>
                <td className="p-3">{m.full.join(', ') || '—'}</td>
                <td className="p-3">{m.limited.join(', ') || '—'}</td>
                <td className="p-3">{m.readonly.join(', ') || '—'}</td>
                <td className="p-3">{user.roles.map((r) => accessLevel(r, m)).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
