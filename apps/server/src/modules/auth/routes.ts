import type { FastifyPluginAsync } from 'fastify';

/**
 * Auth (§5 "Auth & account"): GET /auth/config, POST /auth/register, POST /auth/login,
 * POST /auth/logout, GET /auth/me, POST /auth/password-reset/request, POST /auth/password-reset/confirm.
 * Helpers: RATE_LIMITS (lib/rate-limit), setSessionCookie / clearSessionCookie (plugins/auth),
 * lib/passwords, app.sessions, app.mailer.
 *
 * Registered by app.ts under the `/api` prefix: declare paths relative to it
 * (e.g. `app.get('/households/:householdId/…')`). Validate input with the zod schemas from
 * `@homi/shared` and guard household routes with `requireMember()` (plugins/auth).
 */
export const authRoutes: FastifyPluginAsync = async (_app) => {
  // Implemented by the feature team.
};
