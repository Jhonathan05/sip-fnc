import { getDb } from './db';

export interface AuditEntry {
  id: string;
  at: string;
  actorSub: string;
  actorEmail: string;
  action: string;
  module: string;
  entityId?: string;
  detail?: string;
  ip?: string;
}

const memoryLog: AuditEntry[] = [];
const MAX_MEMORY = 2000;

/**
 * Auditoría de acciones por usuario (acta F0: indefinida, particionada por año en Postgres).
 * Sin DB → memoria volátil (dev mock). Con DB → tabla audit_log.
 */
export async function writeAudit(entry: Omit<AuditEntry, 'id' | 'at'>): Promise<AuditEntry> {
  const full: AuditEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  };
  const db = getDb();
  if (db) {
    try {
      await db.auditLog.create({
        data: {
          actorSub: full.actorSub,
          actorEmail: full.actorEmail,
          action: full.action,
          module: full.module,
          entityId: full.entityId,
          detail: full.detail,
          ip: full.ip,
        },
      });
      return full;
    } catch {
      // cae a memoria si la tabla aún no existe (pre-migración)
    }
  }
  memoryLog.push(full);
  if (memoryLog.length > MAX_MEMORY) memoryLog.splice(0, memoryLog.length - MAX_MEMORY);
  return full;
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  const db = getDb();
  if (db) {
    try {
      const rows = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(limit, 500) });
      return rows.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        actorSub: r.actorSub,
        actorEmail: r.actorEmail,
        action: r.action,
        module: r.module,
        entityId: r.entityId ?? undefined,
        detail: r.detail ?? undefined,
        ip: r.ip ?? undefined,
      }));
    } catch {
      // cae a memoria
    }
  }
  return [...memoryLog].reverse().slice(0, limit);
}
