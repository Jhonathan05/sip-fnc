import { Suspense } from 'react';

const REASONS: Record<string, string> = {
  state: 'Sesión de autenticación inválida o expirada (state). Intenta ingresar de nuevo.',
  token: 'No se pudo validar la identidad con Keycloak.',
  profile: 'Keycloak no devolvió un perfil válido.',
  db: 'No hay base de datos disponible para completar el ingreso.',
  forbidden: 'No tienes permiso para ese módulo.',
};

/**
 * Página TERMINAL: muestra el motivo y NUNCA redirige a KC (evita loops).
 */
function ErrorBody({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--surface-dim)' }}>
      <div className="w-full max-w-md rounded-2xl p-8 shadow-float text-center" style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}>
        <h1 className="text-xl font-bold">Algo salió mal</h1>
        <p className="text-sm mt-3" style={{ color: 'var(--on-surface-variant)' }}>
          {REASONS[reason] ?? 'Error inesperado.'}
        </p>
        {reason && <p className="text-xs mt-2 font-mono" style={{ color: 'var(--outline)' }}>reason={reason}</p>}
        <a href="/login" className="inline-block mt-6 px-6 py-2.5 rounded-xl text-sm font-semibold no-underline gradient-primary" style={{ color: 'var(--on-primary)' }}>
          Volver al ingreso
        </a>
      </div>
    </div>
  );
}

export default async function ErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const params = await searchParams;
  return (
    <Suspense>
      <ErrorBody reason={params.reason ?? ''} />
    </Suspense>
  );
}
