'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeToggle } from './ThemeToggle';
import { useInactivityTimer } from '@/hooks/useInactivityTimer';
import { MODULE_MATRIX, accessLevel } from '@/lib/client-roles';
import type { FncSession } from '@/lib/session';

// Adaptado de fnc-layout/templates/react-impactoVisual/HeaderSidebarLayout.
// Marca SIP-FNC + nav por rol (matriz F0.4) + campana SSE (realtime A) + modal inactividad.

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function icon(path: React.ReactNode): React.ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  dashboard: icon(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>),
  distribucion: icon(<><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></>),
  adjudicaciones: icon(<><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>),
  asignaciones: icon(<><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></>),
  sap: icon(<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>),
  contratos: icon(<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></>),
  tareas: icon(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>),
  seguridad: icon(<><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>),
  roles: icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
};

function navFor(roles: string[]): NavItem[] {
  const lower = roles.map((r) => r.toLowerCase());
  const items: NavItem[] = [
    { href: '/dashboard', label: 'Tablero', icon: ICONS.dashboard },
    { href: '/tareas', label: 'Pendientes', icon: ICONS.tareas },
  ];
  const keys: Array<[string, string]> = [
    ['distribucion', '/distribucion'],
    ['adjudicaciones', '/adjudicaciones'],
    ['asignaciones', '/asignaciones'],
    ['sap', '/ordenes-sap'],
    ['contratos', '/contratos'],
  ];
  MODULE_MATRIX.forEach((rule) => {
    const key = keys.find(([, href]) => href === rule.route)?.[0];
    if (!key) return;
    const lvl = accessLevel(lower[0] ?? '', rule);
    const anyAccess = lower.some((r) => accessLevel(r, rule) !== 'none');
    void lvl;
    if (anyAccess) items.push({ href: rule.route, label: rule.module, icon: ICONS[key] });
  });
  items.push({ href: '/roles', label: 'Matriz de roles', icon: ICONS.roles });
  if (lower.includes('admin')) items.push({ href: '/seguridad', label: 'Seguridad', icon: ICONS.seguridad });
  return items;
}

export default function ClientLayout({ children, user }: { children: React.ReactNode; user: FncSession }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Array<{ id: string; title: string; body?: string; at: string }>>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; title: string }>>([]);
  const router = useRouter();
  const pathname = usePathname();
  const { showWarning, secondsLeft, stayActive, logout } = useInactivityTimer();
  const navItems = navFor(user.roles);

  const handleLogout = useCallback(async () => {
    let endSessionUrl: string | undefined;
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      const data = (await res.json().catch(() => null)) as { endSessionUrl?: string } | null;
      endSessionUrl = data?.endSessionUrl;
    } catch {
      // sigue a login
    }
    if (endSessionUrl) window.location.href = endSessionUrl;
    else {
      router.push('/login');
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    fetch('/api/notifications').then((r) => r.json()).then((d) => setNotifs(d.notifications ?? [])).catch(() => undefined);
    fetch('/api/tasks').then((r) => r.json()).then((d) => setTasks((d.tasks ?? []).map((t: { id: string; title: string }) => t))).catch(() => undefined);
    const es = new EventSource('/api/events');
    es.addEventListener('notification', (e) => {
      try {
        const n = JSON.parse((e as MessageEvent).data) as { id: string; title: string; body?: string; at: string };
        setNotifs((prev) => [n, ...prev].slice(0, 50));
      } catch {
        // evento malformado
      }
    });
    es.addEventListener('task', () => {
      fetch('/api/tasks').then((r) => r.json()).then((d) => setTasks((d.tasks ?? []).map((t: { id: string; title: string }) => t))).catch(() => undefined);
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  return (
    <div className="min-h-screen flex max-w-full overflow-x-hidden" style={{ background: 'var(--surface, #F8F9FA)' }}>
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 280 : 72 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="hidden lg:flex flex-col fixed h-screen z-30 border-r"
        style={{ background: 'var(--surface-container-lowest, #FFFFFF)', borderColor: 'var(--outline-variant)' }}
      >
        <div className="p-4 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer shrink-0"
            style={{ background: 'var(--surface-container-low, #F1F5F9)' }}
            aria-label="Alternar menú"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden">
                <h1 className="text-sm font-bold whitespace-nowrap" style={{ color: 'var(--on-surface)' }}>SIP-FNC</h1>
                <p className="text-xs whitespace-nowrap" style={{ color: 'var(--on-surface-variant)' }}>Comité del Tolima</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium no-underline"
                style={{
                  background: isActive ? 'rgba(141, 16, 36, 0.08)' : 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--on-surface-variant)',
                }}
              >
                <span className="shrink-0">{item.icon}</span>
                {sidebarOpen && <span>{item.label}</span>}
              </a>
            );
          })}
        </nav>
        <div className="p-3">
          <div className="p-3 rounded-xl" style={{ background: 'var(--surface-container-low)' }}>
            {sidebarOpen ? (
              <div>
                <p className="text-sm font-semibold truncate">{user.displayName}</p>
                <p className="text-xs truncate" style={{ color: 'var(--on-surface-variant)' }}>{user.roles.join(', ')}</p>
                <button onClick={handleLogout} className="mt-2 w-full text-xs py-1.5 rounded-lg cursor-pointer" style={{ background: 'color-mix(in srgb, var(--error) 10%, transparent)', color: 'var(--error)' }}>
                  Cerrar sesión
                </button>
              </div>
            ) : (
              <button onClick={handleLogout} className="w-full flex justify-center cursor-pointer" aria-label="Cerrar sesión">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16,17 21,12 16,7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </motion.aside>

      <div className="flex-1 min-h-screen flex flex-col" style={{ marginLeft: undefined }}>
        <motion.div initial={false} animate={{ marginLeft: sidebarOpen ? 280 : 72 }} transition={{ duration: 0.3, ease: 'easeInOut' }} className="hidden lg:block">
          <header className="flex items-center justify-end gap-3 px-8 py-3">
            <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
              {tasks.length > 0 ? `${tasks.length} pendiente(s)` : 'Sin pendientes'}
            </span>
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer" style={{ background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)' }} aria-label="Notificaciones">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {notifs.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[11px] flex items-center justify-center" style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}>
                    {notifs.length}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {notifOpen && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-float p-2 z-40" style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}>
                    {notifs.length === 0 && <p className="text-sm p-3" style={{ color: 'var(--on-surface-variant)' }}>Sin avisos.</p>}
                    {notifs.map((n) => (
                      <div key={n.id} className="p-3 rounded-lg">
                        <p className="text-sm font-semibold">{n.title}</p>
                        {n.body && <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{n.body}</p>}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <ThemeToggle />
          </header>
        </motion.div>
        <motion.main initial={false} animate={{ marginLeft: sidebarOpen ? 280 : 72 }} transition={{ duration: 0.3, ease: 'easeInOut' }} className="hidden lg:block flex-1 p-8 pt-2">
          {children}
        </motion.main>
        <main className="lg:hidden flex-1 p-4 pb-24">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-base font-bold">SIP-FNC</h1>
              <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{user.displayName}</p>
            </div>
            <ThemeToggle />
          </div>
          {children}
          <nav className="fixed bottom-0 left-0 right-0 z-30 flex justify-around py-2" style={{ background: 'var(--surface-container-lowest)', borderTop: '1px solid var(--outline-variant)' }}>
            {navItems.slice(0, 5).map((item) => (
              <a key={item.href} href={item.href} className="flex flex-col items-center gap-1 text-[10px] no-underline" style={{ color: pathname === item.href ? 'var(--primary)' : 'var(--on-surface-variant)' }}>
                {item.icon}
                {item.label.split(' ')[0]}
              </a>
            ))}
          </nav>
        </main>
      </div>

      <AnimatePresence>
        {showWarning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center modal-overlay">
            <div className="rounded-2xl p-6 max-w-sm mx-4 shadow-float" style={{ background: 'var(--surface-container-lowest)' }}>
              <h2 className="text-lg font-bold">Sesión por expirar</h2>
              <p className="text-sm mt-2" style={{ color: 'var(--on-surface-variant)' }}>
                Por inactividad se cerrará en {secondsLeft}s.
              </p>
              <div className="flex gap-2 mt-4">
                <button onClick={stayActive} className="flex-1 py-2 rounded-xl text-sm font-semibold cursor-pointer gradient-primary" style={{ color: 'var(--on-primary)' }}>
                  Seguir activo
                </button>
                <button onClick={() => logout('inactivity')} className="flex-1 py-2 rounded-xl text-sm cursor-pointer" style={{ border: '1px solid var(--outline-variant)' }}>
                  Salir
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
