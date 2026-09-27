/**
 * Notificaciones + tareas pendientes (acta F0: realtime A+B vía SSE).
 * Hub SSE en memoria por instancia (multi-instancia futuro → Redis, misma firma).
 * Sin DB → memoria volátil. Con DB → tablas notification/task.
 */

export interface SipNotification {
  id: string;
  at: string;
  audience: string[]; // roles destino, ej ['coordinador'] — [] = todos
  title: string;
  body?: string;
  readBy: string[];
}

export interface SipTask {
  id: string;
  at: string;
  role: string; // rol responsable
  title: string;
  detail?: string;
  status: 'pendiente' | 'hecha';
  doneBy?: string;
}

type Listener = (event: string, data: unknown) => void;
const listeners = new Set<Listener>();

export function subscribeSSE(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function publishSSE(event: string, data: unknown): void {
  for (const fn of listeners) {
    try {
      fn(event, data);
    } catch {
      // un listener lento no tumba a los demás
    }
  }
}

const notifications: SipNotification[] = [];
const tasks: SipTask[] = [];

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pushNotification(n: Omit<SipNotification, 'id' | 'at' | 'readBy'>): SipNotification {
  const full: SipNotification = { ...n, id: uid(), at: new Date().toISOString(), readBy: [] };
  notifications.push(full);
  if (notifications.length > 500) notifications.splice(0, notifications.length - 500);
  publishSSE('notification', full);
  return full;
}

export function listNotifications(forRoles: string[], sub: string, limit = 50): SipNotification[] {
  const set = new Set(forRoles.map((r) => r.toLowerCase()));
  return notifications
    .filter((n) => n.audience.length === 0 || n.audience.some((a) => set.has(a.toLowerCase())))
    .slice(-limit)
    .reverse()
    .map((n) => ({ ...n, readBy: n.readBy.includes(sub) ? n.readBy : n.readBy }));
}

export function markNotificationRead(id: string, sub: string): boolean {
  const n = notifications.find((x) => x.id === id);
  if (!n || n.readBy.includes(sub)) return false;
  n.readBy.push(sub);
  return true;
}

export function createTask(t: Omit<SipTask, 'id' | 'at' | 'status'>): SipTask {
  const full: SipTask = { ...t, id: uid(), at: new Date().toISOString(), status: 'pendiente' };
  tasks.push(full);
  publishSSE('task', full);
  return full;
}

export function listTasks(forRoles: string[], onlyPending = true): SipTask[] {
  const set = new Set(forRoles.map((r) => r.toLowerCase()));
  return tasks
    .filter((t) => set.has(t.role.toLowerCase()))
    .filter((t) => !onlyPending || t.status === 'pendiente')
    .reverse();
}

export function completeTask(id: string, sub: string): boolean {
  const t = tasks.find((x) => x.id === id);
  if (!t || t.status === 'hecha') return false;
  t.status = 'hecha';
  t.doneBy = sub;
  publishSSE('task-done', { id, doneBy: sub });
  return true;
}
