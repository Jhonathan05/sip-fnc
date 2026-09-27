import type { PrismaClient } from '@prisma/client';

/**
 * Prisma lazy singleton con degradación elegante:
 * sin DATABASE_URL o sin cliente generado → null y los stores usan memoria.
 * (P4 mock funciona sin Postgres; prod exige Postgres.)
 */

let client: PrismaClient | null | undefined;

export function getDb(): PrismaClient | null {
  if (client !== undefined) return client;
  if (!process.env.DATABASE_URL) {
    client = null;
    return client;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient: Ctor } = require('@prisma/client') as typeof import('@prisma/client');
    client = new Ctor();
  } catch {
    client = null;
  }
  return client;
}
