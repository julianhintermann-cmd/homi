import type { FastifyPluginAsync } from 'fastify';

/**
 * Households, members & invitations (§5): /households, /households/:householdId(/members|/invitations),
 * public GET /invitations/:token and POST /invitations/:token/accept.
 * After membership changes call app.realtime.syncUserRooms(userId) and emit "membership".
 *
 * Registered by app.ts under the `/api` prefix: declare paths relative to it
 * (e.g. `app.get('/households/:householdId/…')`). Validate input with the zod schemas from
 * `@homi/shared` and guard household routes with `requireMember()` (plugins/auth).
 */
export const householdsRoutes: FastifyPluginAsync = async (_app) => {
  // Implemented by the feature team.
};
