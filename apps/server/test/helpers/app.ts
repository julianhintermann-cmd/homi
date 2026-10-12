import { rm } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { buildApp, type BuildAppOptions } from '../../src/app';
import type { AppConfig } from '../../src/config';
import type { PrismaClient } from '../../src/db';
import { createMemoryMailer, type MailMessage, type Mailer } from '../../src/lib/mailer';
import { LocalStorage, type Storage } from '../../src/lib/storage';
import { createTestConfig } from './config';
import { getTestPrisma } from './db';
import { TestClient } from './http';

export interface TestApp {
  app: FastifyInstance;
  config: AppConfig;
  prisma: PrismaClient;
  storage: Storage;
  /** Records every mail "sent" by the app (e.g. password reset links). */
  mailer: Mailer & { readonly sent: MailMessage[] };
  /** New cookie-aware client (one per simulated browser). */
  client(): TestClient;
  /** Closes the app and removes the temp upload dir (the shared Prisma client stays open). */
  close(): Promise<void>;
}

export interface BuildTestAppOptions extends Pick<
  BuildAppOptions,
  'prisma' | 'storage' | 'rateLimit' | 'serveStatic' | 'logger'
> {
  /** Extra env vars for {@link createTestConfig}, e.g. `{ NODE_ENV: 'production' }`. */
  env?: Record<string, string | undefined>;
  /** Hook to add routes/plugins before the app is made ready. */
  configure?: (app: FastifyInstance) => void | Promise<void>;
}

/**
 * Builds the real app against the integration database (`DATABASE_URL_TEST`) with a temp upload
 * dir, an in-memory mailer, silent logs and rate limiting disabled (enable with `rateLimit: true`).
 * Unit tests pass a stub `prisma` (no DB access unless a route needs it).
 */
export async function buildTestApp(options: BuildTestAppOptions = {}): Promise<TestApp> {
  const { env, configure, ...overrides } = options;
  const config = createTestConfig(env);
  const prisma = overrides.prisma ?? getTestPrisma();
  const storage = overrides.storage ?? new LocalStorage(config.uploadDir);
  const mailer = createMemoryMailer();

  const app = await buildApp({
    logger: false,
    rateLimit: false,
    serveStatic: false,
    ...overrides,
    config,
    prisma,
    storage,
    mailer,
  });
  if (configure) await configure(app);
  await app.ready();

  return {
    app,
    config,
    prisma,
    storage,
    mailer,
    client: () => new TestClient(app),
    async close() {
      await app.close();
      await rm(config.uploadDir, { recursive: true, force: true });
    },
  };
}
