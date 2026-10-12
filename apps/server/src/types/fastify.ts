import type { AppConfig } from '../config';
import type { PrismaClient } from '../db';
import type { Mailer } from '../lib/mailer';
import type { KeyedRateLimiter, KeyedRateLimiterOptions } from '../lib/rate-limit';
import type { AuthSession, AuthUser, SessionService } from '../lib/sessions';
import type { Storage } from '../lib/storage';
import type { Realtime } from '../plugins/realtime';

/**
 * Decorations available on every Fastify instance / request created by `buildApp()`.
 */
declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    prisma: PrismaClient;
    storage: Storage;
    mailer: Mailer;
    sessions: SessionService;
    realtime: Realtime;
    /** Keyed sliding-window limiter; a no-op when rate limiting is disabled (tests). */
    createKeyedRateLimiter(options: KeyedRateLimiterOptions): KeyedRateLimiter;
  }

  interface FastifyRequest {
    /** Authenticated user, or `null`. Use `requireUser(req)` in handlers. */
    user: AuthUser | null;
    /** Current session, or `null`. */
    session: AuthSession | null;
    /** Raw session token from the cookie (only set when the session is valid). */
    sessionToken: string | null;
  }
}

export {};
