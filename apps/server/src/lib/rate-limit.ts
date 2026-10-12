import type { RateLimitOptions } from '@fastify/rate-limit';
import { LIMITS } from '@homi/shared';

/**
 * Route-level rate-limit presets (§4.2). `@fastify/rate-limit` is registered with `global: false`,
 * so a route opts in via its config:
 *
 *   app.post('/auth/login', { config: { rateLimit: RATE_LIMITS.login } }, handler)
 *
 * Per-IP limits use the client IP as key (honours TRUST_PROXY). Limits keyed by something else
 * (e.g. "5/min per email") use {@link KeyedRateLimiter} via `app.createKeyedRateLimiter()`.
 */
export const RATE_LIMITS = {
  /** POST /auth/login – 10 per minute per IP. */
  login: { max: 10, timeWindow: '1 minute', groupId: 'auth-login' },
  /** POST /auth/register – 5 per minute per IP. */
  register: { max: 5, timeWindow: '1 minute', groupId: 'auth-register' },
  /** POST /auth/password-reset/request – 3 per 15 minutes per IP. */
  passwordResetRequest: { max: 3, timeWindow: '15 minutes', groupId: 'auth-reset-request' },
  /** POST /auth/password-reset/confirm – brute-force guard. */
  passwordResetConfirm: { max: 10, timeWindow: '15 minutes', groupId: 'auth-reset-confirm' },
  /** Public invitation preview/accept – token guessing guard. */
  invitation: { max: 30, timeWindow: '1 minute', groupId: 'invitation' },
  /** Image uploads. */
  upload: { max: 30, timeWindow: '1 minute', groupId: 'upload' },
} as const satisfies Record<string, RateLimitOptions>;

/** Keyed limits that are not per IP. */
export const KEYED_RATE_LIMITS = {
  /** Login attempts per (normalised) email: 5 per minute. */
  loginPerEmail: { max: 5, windowMs: 60_000 },
  /** Chat messages per user: 20 per 10 s (§6). */
  chatSend: { max: LIMITS.chat.sendMax, windowMs: LIMITS.chat.sendWindowMs },
  /** Typing indicators per user: at most one per second. */
  chatTyping: { max: 1, windowMs: LIMITS.chat.typingMinIntervalMs },
} as const;

export interface KeyedRateLimiterOptions {
  max: number;
  windowMs: number;
  /** Upper bound of tracked keys (oldest are evicted). */
  maxKeys?: number;
}

/**
 * In-memory sliding-window limiter keyed by an arbitrary string (single-process deployment).
 *
 *   if (!limiter.consume(`login:${email}`)) throw new AppError('RATE_LIMITED');
 */
export class KeyedRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly maxKeys: number;

  constructor(
    private readonly options: KeyedRateLimiterOptions,
    private readonly enabled = true,
    private readonly now: () => number = Date.now,
  ) {
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  /** Records a hit and returns `true` if it is within the limit. */
  consume(key: string): boolean {
    if (!this.enabled) return true;
    const now = this.now();
    const windowStart = now - this.options.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (timestamps.length >= this.options.max) {
      this.hits.set(key, timestamps);
      return false;
    }
    timestamps.push(now);
    this.hits.delete(key); // re-insert to keep Map order ≈ LRU
    this.hits.set(key, timestamps);
    this.evict();
    return true;
  }

  /** Milliseconds until the next hit for `key` would be accepted (0 if allowed now). */
  retryAfterMs(key: string): number {
    if (!this.enabled) return 0;
    const timestamps = this.hits.get(key) ?? [];
    const windowStart = this.now() - this.options.windowMs;
    const active = timestamps.filter((t) => t > windowStart);
    if (active.length < this.options.max) return 0;
    return Math.max(0, (active[0] ?? 0) + this.options.windowMs - this.now());
  }

  reset(key?: string): void {
    if (key === undefined) this.hits.clear();
    else this.hits.delete(key);
  }

  private evict(): void {
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next();
      if (oldest.done) break;
      this.hits.delete(oldest.value);
    }
  }
}
