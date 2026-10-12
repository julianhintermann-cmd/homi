import { SESSION_REFRESH_INTERVAL_MS } from '@homi/shared';
import type { PrismaClient } from '../db';
import { generateToken, hashToken, isWellFormedToken } from './tokens';

/**
 * Server-side sessions (§4.1): the cookie carries a random 32-byte token, the database stores
 * only `HMAC-SHA256(SESSION_SECRET, token)`. Expiry slides forward at most every 15 minutes.
 */

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  lastHouseholdId: string | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface ValidatedSession {
  user: AuthUser;
  session: AuthSession;
  /** True when the expiry was extended – the cookie's Max-Age should be refreshed too. */
  refreshed: boolean;
}

export interface SessionService {
  /** Session lifetime in milliseconds (`SESSION_TTL_DAYS`). */
  readonly ttlMs: number;
  /** Creates a session and returns the raw token for the cookie (never stored). */
  create(
    userId: string,
    meta?: { userAgent?: string | null | undefined },
  ): Promise<{ token: string; session: AuthSession }>;
  /** Resolves a raw token to its user, deleting it if expired and sliding the expiry if due. */
  validate(token: string): Promise<ValidatedSession | null>;
  /** Deletes the session identified by the raw token (logout). */
  destroy(token: string): Promise<void>;
  destroyById(sessionId: string): Promise<void>;
  /** Deletes all sessions of a user, optionally keeping one (password change). Returns the count. */
  destroyAllForUser(userId: string, options?: { exceptSessionId?: string | undefined }): Promise<number>;
  /** Deletes expired sessions. Returns the count. */
  purgeExpired(): Promise<number>;
}

export interface SessionServiceOptions {
  secret: string;
  ttlMs: number;
  refreshIntervalMs?: number;
  now?: () => Date;
}

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
  lastHouseholdId: true,
} as const;

export function createSessionService(prisma: PrismaClient, options: SessionServiceOptions): SessionService {
  const { secret, ttlMs } = options;
  const refreshIntervalMs = options.refreshIntervalMs ?? SESSION_REFRESH_INTERVAL_MS;
  const now = options.now ?? (() => new Date());

  const hash = (token: string) => hashToken(secret, token);

  return {
    ttlMs,

    async create(userId, meta = {}) {
      const token = generateToken();
      const createdAt = now();
      const record = await prisma.session.create({
        data: {
          tokenHash: hash(token),
          userId,
          userAgent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
          createdAt,
          lastSeenAt: createdAt,
          expiresAt: new Date(createdAt.getTime() + ttlMs),
        },
        select: { id: true, userId: true, createdAt: true, lastSeenAt: true, expiresAt: true },
      });
      return { token, session: record };
    },

    async validate(token) {
      if (!isWellFormedToken(token)) return null;
      const record = await prisma.session.findUnique({
        where: { tokenHash: hash(token) },
        select: {
          id: true,
          userId: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
          user: { select: USER_SELECT },
        },
      });
      if (!record) return null;

      const current = now();
      if (record.expiresAt.getTime() <= current.getTime()) {
        await prisma.session.deleteMany({ where: { id: record.id } });
        return null;
      }

      const { user, ...session } = record;
      if (current.getTime() - record.lastSeenAt.getTime() < refreshIntervalMs) {
        return { user, session, refreshed: false };
      }

      const expiresAt = new Date(current.getTime() + ttlMs);
      const updated = await prisma.session.updateMany({
        where: { id: record.id },
        data: { lastSeenAt: current, expiresAt },
      });
      if (updated.count === 0) return null; // destroyed concurrently
      return { user, session: { ...session, lastSeenAt: current, expiresAt }, refreshed: true };
    },

    async destroy(token) {
      if (!isWellFormedToken(token)) return;
      await prisma.session.deleteMany({ where: { tokenHash: hash(token) } });
    },

    async destroyById(sessionId) {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    },

    async destroyAllForUser(userId, opts = {}) {
      const result = await prisma.session.deleteMany({
        where: { userId, ...(opts.exceptSessionId ? { id: { not: opts.exceptSessionId } } : {}) },
      });
      return result.count;
    },

    async purgeExpired() {
      const result = await prisma.session.deleteMany({ where: { expiresAt: { lte: now() } } });
      return result.count;
    },
  };
}
