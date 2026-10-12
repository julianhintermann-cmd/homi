import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client';

export { Prisma, PrismaClient };

/** Interactive transaction client (`prisma.$transaction(async (tx) => …)`). */
export type Tx = Prisma.TransactionClient;

/** Anything that can run queries: the root client or a transaction client. */
export type Db = PrismaClient | Tx;

export interface CreatePrismaOptions {
  /** Log Prisma warnings/errors through this callback instead of stdout. */
  onPoolError?: (error: Error) => void;
}

/**
 * Creates a Prisma client backed by node-postgres via the Prisma 7 driver adapter.
 * The caller owns the client and must call `$disconnect()`.
 */
export function createPrismaClient(databaseUrl: string, options: CreatePrismaOptions = {}): PrismaClient {
  const adapter = new PrismaPg(
    { connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 },
    options.onPoolError ? { onPoolError: options.onPoolError } : undefined,
  );
  return new PrismaClient({ adapter });
}

/** Resolves when the database answers `SELECT 1` within `timeoutMs`; rejects otherwise. */
export async function pingDatabase(prisma: PrismaClient, timeoutMs = 2_000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Database ping timed out after ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
