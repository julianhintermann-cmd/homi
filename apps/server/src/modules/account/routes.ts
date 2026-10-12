import type { FastifyPluginAsync } from 'fastify';

/**
 * Account (§5): PATCH /account, POST /account/password, PUT /account/active-household.
 *
 * Registered by app.ts under the `/api` prefix: declare paths relative to it
 * (e.g. `app.get('/households/:householdId/…')`). Validate input with the zod schemas from
 * `@homi/shared` and guard household routes with `requireMember()` (plugins/auth).
 */
export const accountRoutes: FastifyPluginAsync = async (_app) => {
  // Implemented by the feature team.
};
