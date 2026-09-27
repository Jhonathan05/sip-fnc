'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Suspense } from 'react';

const REASONS: Record<string, string> = {
  inactivity: 'Sesión cerrada por inactividad.',
  security: 'Sesión invalidada por seguridad. Ingresa de nuevo.',
  forbidden: 'No tienes permiso para ese módulo.',
};

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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--surface-dim)' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md rounded-2xl p-8 shadow-float"
        style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}
      >
        <p className="text-xs font-semibold tracking-widest" style={{ color: 'var(--primary)' }}>COMITÉ DEL TOLIMA</p>
        <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: 'var(--font-headline)' }}>SIP-FNC</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>Sistema de Información de Proyectos</p>

        {(reason && REASONS[reason]) != null && (
          <p className="text-sm mt-4 p-3 rounded-xl" style={{ background: 'color-mix(in srgb, var(--error) 8%, transparent)', color: 'var(--error)' }}>
            {REASONS[reason as string]}
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
              style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface)' }}
            >
              {loading ? 'Ingresando…' : 'Entrar (desarrollo local)'}
            </button>
          )}
        </div>
        <p className="text-xs mt-6 text-center" style={{ color: 'var(--on-surface-variant)' }}>
          Sesión de 8 horas · Inactividad 5 min · Sin SSO entre apps
        </p>
      </motion.div>
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
