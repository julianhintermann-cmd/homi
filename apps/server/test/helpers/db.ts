import { inject } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../src/db';

/**
 * Database helpers for integration tests (one Prisma client per test file).
 */

let prisma: PrismaClient | undefined;

export function getTestDatabaseUrl(): string {
  const url = inject('databaseUrlTest') ?? process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not available – is this an integration test?');
  return url;
}

export function getTestPrisma(): PrismaClient {
  prisma ??= createPrismaClient(getTestDatabaseUrl());
  return prisma;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}

/** Truncates every application table (keeps `_prisma_migrations`). */
export async function resetDatabase(client: PrismaClient = getTestPrisma()): Promise<void> {
  const tables = await client.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"public"."${tablename.replace(/"/g, '""')}"`).join(', ');
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
