import type { FastifyPluginAsync } from 'fastify';

/**
 * Shopping (§5): /households/:householdId/shopping(/items(/:shoppingItemId)|/clear-completed).
 *
 * Registered by app.ts under the `/api` prefix: declare paths relative to it
 * (e.g. `app.get('/households/:householdId/…')`). Validate input with the zod schemas from
 * `@homi/shared` and guard household routes with `requireMember()` (plugins/auth).
 */
export const shoppingRoutes: FastifyPluginAsync = async (_app) => {
  // Implemented by the feature team.
};
