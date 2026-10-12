import { buildApp } from './app';
import { ConfigError, loadConfig, usesDevSessionSecret } from './config';
import { createPrismaClient } from './db';
import { warmUpPasswordHasher } from './lib/passwords';

/**
 * Process entry: load config, listen, purge expired sessions periodically and shut down
 * gracefully on SIGTERM/SIGINT (Socket.IO → Fastify → Prisma).
 */

const SHUTDOWN_TIMEOUT_MS = 10_000;
const SESSION_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(error instanceof ConfigError ? error.message : error);
    process.exit(1);
  }

  const prisma = createPrismaClient(config.databaseUrl);
  const app = await buildApp({ config, prisma });

  if (usesDevSessionSecret(config)) {
    app.log.warn('SESSION_SECRET is not set – using an insecure development secret');
  }

  let shuttingDown = false;
  const shutdown = async (reason: string, exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ reason }, 'shutting down');
    const forceExit = setTimeout(() => {
      app.log.error('graceful shutdown timed out – forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();
    try {
      await app.close(); // preClose closes Socket.IO, onClose the mailer
      await prisma.$disconnect();
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown');
      exitCode = 1;
    }
    clearTimeout(forceExit);
    process.exit(exitCode);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM', 0));
  process.once('SIGINT', () => void shutdown('SIGINT', 0));
  process.on('unhandledRejection', (reason) => {
    app.log.fatal({ err: reason }, 'unhandled promise rejection');
    void shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (error) => {
    app.log.fatal({ err: error }, 'uncaught exception');
    void shutdown('uncaughtException', 1);
  });

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (error) {
    app.log.fatal({ err: error }, 'failed to start server');
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  }

  const purge = setInterval(() => {
    app.sessions
      .purgeExpired()
      .then((count) => count > 0 && app.log.info({ count }, 'purged expired sessions'))
      .catch((error: unknown) => app.log.warn({ err: error }, 'session purge failed'));
  }, SESSION_PURGE_INTERVAL_MS);
  purge.unref();

  void warmUpPasswordHasher();
}

main().catch((error: unknown) => {
  console.error('Fatal start-up error:', error);
  process.exit(1);
});
