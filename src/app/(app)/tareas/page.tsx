'use client';

import { useState, useEffect } from 'react';

interface Task {
  id: string;
  title: string;
  detail?: string;
  at: string;
}

// Bandeja de pendientes del rol (realtime B: SSE + REST).
export default function TareasPage() {
  const [tasks, setTasks] = useState<Task[]>([]);

  async function reload() {
    const res = await fetch('/api/tasks');
    const data = (await res.json().catch(() => null)) as { tasks?: Task[] } | null;
    setTasks(data?.tasks ?? []);
  }

  useEffect(() => {
    void reload();
    const es = new EventSource('/api/events');
    es.addEventListener('task', () => void reload());
    es.addEventListener('task-done', () => void reload());
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  async function complete(id: string) {
    await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    void reload();
  }

  return (
    <div>
      <p className="text-xs font-semibold tracking-widest" style={{ color: 'var(--primary)' }}>SIP-FNC · PENDIENTES</p>
      <h1 className="text-2xl font-bold mt-1" style={{ fontFamily: 'var(--font-headline)' }}>Tareas de mi rol</h1>
      <div className="mt-6 space-y-3">
        {tasks.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>Sin pendientes. Las tareas aparecen aquí en vivo.</p>
        )}
        {tasks.map((t) => (
          <div key={t.id} className="rounded-2xl p-4 flex items-center justify-between gap-3" style={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--outline-variant)' }}>
            <div>
              <p className="text-sm font-semibold">{t.title}</p>
              {t.detail && <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{t.detail}</p>}
            </div>
            <button onClick={() => complete(t.id)} className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer gradient-primary shrink-0" style={{ color: 'var(--on-primary)' }}>
              Marcar hecha
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
