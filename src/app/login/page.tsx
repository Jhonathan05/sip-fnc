'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';

const REASONS: Record<string, string> = {
  inactivity: 'Sesión cerrada por inactividad.',
  security: 'Sesión invalidada por seguridad. Ingresa de nuevo.',
  forbidden: 'No tienes permiso para ese módulo.',
};

const MODULES = [
  { name: 'Distribución de Recursos', desc: 'Por municipio y circunscripción' },
  { name: 'Adjudicaciones', desc: 'Contratistas e invitaciones' },
  { name: 'Asignaciones', desc: 'Control por vigencia y origen' },
  { name: 'Órdenes SAP', desc: 'Ejecución mensual' },
  { name: 'Contratos', desc: 'Convenios, otrosíes y pólizas' },
];

function LoginForm({ mockMode }: { mockMode: boolean }) {
  const params = useSearchParams();
  const [csrf, setCsrf] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reason = params.get('reason');
  const expired = params.get('expired');

  useEffect(() => {
    if (mockMode) {
      fetch('/api/auth/csrf').then((r) => r.json()).then((d) => setCsrf(d.csrfToken ?? '')).catch(() => undefined);
    }
  }, [mockMode]);

  async function mockLogin() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
      });
      const data = (await res.json().catch(() => null)) as { redirect?: string; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo ingresar.');
      window.location.href = data?.redirect ?? '/dashboard';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de ingreso.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Hero institucional */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex-1 p-8 lg:p-12 flex flex-col justify-between gradient-primary"
        style={{ color: 'var(--on-primary)' }}
      >
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold" style={{ background: 'rgba(255,255,255,0.15)' }}>
              S
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest opacity-80">COMITÉ DEL TOLIMA · FNC</p>
              <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)' }}>SIP-FNC</h1>
            </div>
          </div>
          <h2 className="text-xl lg:text-2xl font-semibold mt-8 max-w-md" style={{ fontFamily: 'var(--font-headline)' }}>
            Sistema de Información de Proyectos
          </h2>
          <p className="text-sm mt-3 max-w-md opacity-85">
            Gestión e informes contables por periodos: distribuciones por municipio y circunscripción,
            asignaciones con origen de recursos, ejecución SAP mensual y control de contratos.
          </p>
          <ul className="mt-6 space-y-2.5 max-w-md">
            {MODULES.map((m) => (
              <li key={m.name} className="flex items-center gap-3 text-sm rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.10)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span><strong>{m.name}</strong> <span className="opacity-75">— {m.desc}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs mt-8 opacity-70">
          Federación Nacional de Cafeteros · Comité Departamental del Tolima · Sesión de 8 horas · Inactividad 5 min
        </p>
      </motion.section>

      {/* Formulario */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="flex-1 p-8 lg:p-12 flex items-center justify-center"
        style={{ background: 'var(--surface)' }}
      >
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-headline)' }}>Ingreso</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
            Acceso con la cuenta institucional del Comité.
          </p>

          {reason && REASONS[reason] && (
            <p className="text-sm mt-4 p-3 rounded-xl" style={{ background: 'color-mix(in srgb, var(--error) 8%, transparent)', color: 'var(--error)' }}>
              {REASONS[reason]}
            </p>
          )}
          {expired && (
            <p className="text-sm mt-4 p-3 rounded-xl" style={{ background: 'color-mix(in srgb, var(--error) 8%, transparent)', color: 'var(--error)' }}>
              Tu sesión de 8 horas terminó. Ingresa de nuevo.
            </p>
          )}
          {error && (
            <p className="text-sm mt-4 p-3 rounded-xl" style={{ background: 'color-mix(in srgb, var(--error) 8%, transparent)', color: 'var(--error)' }}>
              {error}
            </p>
          )}

          <div className="mt-6 space-y-3">
            <a
              href="/api/auth/keycloak"
              className="block text-center py-3 rounded-xl text-sm font-semibold no-underline gradient-primary"
              style={{ color: 'var(--on-primary)' }}
            >
              Continuar con Comité Tolima
            </a>
            {mockMode && (
              <button
                onClick={mockLogin}
                disabled={loading || !csrf}
                className="w-full py-3 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface)', background: 'var(--surface-container-lowest)' }}
              >
                {loading ? 'Ingresando…' : 'Entrar (desarrollo local)'}
              </button>
            )}
          </div>
          <p className="text-xs mt-6" style={{ color: 'var(--on-surface-variant)' }}>
            Sin SSO entre aplicaciones: cada app pide tus credenciales. Ante fallos de ingreso, la pantalla de error
            indica el motivo sin redirigirte en bucle.
          </p>
        </div>
      </motion.section>
    </div>
  );
}

export default function LoginPage() {
  const mockMode = process.env.NEXT_PUBLIC_AUTH_PROVIDER !== 'keycloak';
  return (
    <Suspense>
      <LoginForm mockMode={mockMode} />
    </Suspense>
  );
}
