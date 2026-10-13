import Fastify, { type FastifyInstance, type FastifyReply, type FastifyServerOptions } from 'fastify';
import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import './types/fastify';
import type { AppConfig } from './config';
import { createPrismaClient, type PrismaClient } from './db';
import { buildLoggerOptions } from './logger';
import { AppError } from './lib/http-errors';
import { createMailer, type Mailer } from './lib/mailer';
import { KeyedRateLimiter } from './lib/rate-limit';
import { createSessionService } from './lib/sessions';
import { LocalStorage, type Storage } from './lib/storage';
import { authPlugin } from './plugins/auth';
import { csrfPlugin } from './plugins/csrf';
import { apiNotFound, errorHandler } from './plugins/errors';
import { healthRoutes } from './plugins/health';
import { realtimePlugin } from './plugins/realtime';
import { securityPlugin } from './plugins/security';
import { registerSpa } from './plugins/static';
import { accountRoutes } from './modules/account/routes';
import { activityRoutes } from './modules/activity/routes';
import { authRoutes } from './modules/auth/routes';
import { chatRoutes } from './modules/chat/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { householdsRoutes } from './modules/households/routes';
import { inventoryRoutes } from './modules/inventory/routes';
import { shoppingRoutes } from './modules/shopping/routes';

/** Headers for responses produced before the helmet hook could run (see `frameworkErrors`). */
export function frameworkErrorHeaders(config: AppConfig): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'SAMEORIGIN',
    ...(config.isProduction && config.appUrlIsHttps ? { 'strict-transport-security': 'max-age=15552000' } : {}),
  };
}

export interface BuildAppOptions {
  config: AppConfig;
  /** Injected client (tests, index.ts). The caller owns it; otherwise one is created and closed with the app. */
  prisma?: PrismaClient;
  storage?: Storage;
  mailer?: Mailer;
  /** Fastify logger option; defaults to the redacting pino setup from `logger.ts`. */
  logger?: FastifyServerOptions['logger'];
  /** Serve the SPA from `config.webDistDir` (default: in production). */
  serveStatic?: boolean;
  /** Enforce rate limits (default: true; tests usually disable them). */
  rateLimit?: boolean;
}

/**
 * Builds the fully wired Fastify instance without listening. Used by `index.ts` and the tests.
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const rateLimitEnabled = options.rateLimit ?? true;
  const { trustProxy } = config;

  const app = Fastify({
    logger: options.logger ?? buildLoggerOptions(config),
    // A hop count N trusts the N nearest proxies (same semantics as proxy-addr).
    trustProxy: typeof trustProxy === 'number' ? (_address: string, hop: number) => hop < trustProxy : trustProxy,
    bodyLimit: 1_048_576,
    return503OnClosing: true,
    // Router-level failures (e.g. FST_ERR_BAD_URL for `/api/%ff`) happen before any hook: answer with
    // the standard error body and the security headers instead of Fastify's raw message (which
    // echoes the URL).
    frameworkErrors: (error, request, reply) => {
      request.log.info({ code: error.code }, 'request rejected by the router');
      void (reply as FastifyReply)
        .code(400)
        .headers(frameworkErrorHeaders(config))
        .send(new AppError('BAD_REQUEST').toBody());
    },
  });

  const ownsPrisma = options.prisma === undefined;
  const prisma =
    options.prisma ??
    createPrismaClient(config.databaseUrl, {
      onPoolError: (error) => app.log.error({ err: error }, 'postgres pool error'),
    });
  const mailer = options.mailer ?? createMailer(config.smtp, app.log);

  // Core services, decorated on the root instance.
  await app.register(
    fp(
      async (instance) => {
        instance.decorate('config', config);
        instance.decorate('prisma', prisma);
        instance.decorate('storage', options.storage ?? new LocalStorage(config.uploadDir));
        instance.decorate('mailer', mailer);
        instance.decorate(
          'sessions',
          createSessionService(prisma, { secret: config.sessionSecret, ttlMs: config.sessionTtlMs }),
        );
        instance.decorate(
          'createKeyedRateLimiter',
          (limiterOptions: ConstructorParameters<typeof KeyedRateLimiter>[0]) =>
            new KeyedRateLimiter(limiterOptions, rateLimitEnabled),
        );
      },
      { name: 'homi-core', fastify: '5.x' },
    ),
  );

  app.setErrorHandler(errorHandler);

  await app.register(cookie);
  await app.register(securityPlugin);
  await app.register(rateLimit, {
    global: false,
    ...(rateLimitEnabled ? {} : { allowList: () => true }),
    errorResponseBuilder: (_request, context) =>
      new AppError('RATE_LIMITED', undefined, { details: { retryAfterSeconds: Math.ceil(context.ttl / 1000) } }),
  });
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 10, parts: 11, fieldSize: 1024 },
  });
  await app.register(csrfPlugin);
  await app.register(authPlugin);
  await app.register(realtimePlugin);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(accountRoutes);
      await api.register(householdsRoutes);
      await api.register(dashboardRoutes);
      await api.register(inventoryRoutes);
      await api.register(shoppingRoutes);
      await api.register(chatRoutes);
      await api.register(activityRoutes);
    },
    { prefix: '/api' },
  );

  const serveStatic = options.serveStatic ?? config.isProduction;
  const spaFallback = serveStatic ? await registerSpa(app, { root: config.webDistDir }) : null;
  app.setNotFoundHandler(spaFallback ?? apiNotFound);

  app.addHook('onClose', async () => {
    mailer.close();
    if (ownsPrisma) await prisma.$disconnect();
  });

  return app;
}
