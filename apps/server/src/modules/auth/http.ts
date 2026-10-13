import type { FastifyReply } from 'fastify';
import { AppError } from '../../lib/http-errors';
import type { KeyedRateLimiter } from '../../lib/rate-limit';

/**
 * Small HTTP helpers shared by the auth and account routes.
 * (Percent-encoded `/api` prefixes are rejected globally by the CSRF hook – see lib/api-path.ts.)
 */

/** `400 VALIDATION` for a single field, shaped like the zod mapping in plugins/errors.ts. */
export function fieldValidationError(field: string, message: string): AppError {
  return new AppError('VALIDATION', undefined, { details: { fieldErrors: { [field]: message }, formErrors: [] } });
}

/** `429 RATE_LIMITED` for a keyed limiter, with `Retry-After` like the route-level limits. */
export function keyedRateLimitError(reply: FastifyReply, limiter: KeyedRateLimiter, key: string): AppError {
  const retryAfterSeconds = Math.max(1, Math.ceil(limiter.retryAfterMs(key) / 1000));
  reply.header('retry-after', String(retryAfterSeconds));
  return new AppError('RATE_LIMITED', undefined, { details: { retryAfterSeconds } });
}

/** Personal data must never be stored by browsers or proxies. */
export function noStore(reply: FastifyReply): FastifyReply {
  return reply.header('cache-control', 'no-store');
}
