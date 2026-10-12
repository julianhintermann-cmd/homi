import type { FastifyPluginAsync } from 'fastify';

/**
 * Activity: no public routes yet; the recording helper lives in ./service.ts.
 *
 * Registered by app.ts under the `/api` prefix: declare paths relative to it
 * (e.g. `app.get('/households/:householdId/…')`). Validate input with the zod schemas from
 * `@homi/shared` and guard household routes with `requireMember()` (plugins/auth).
 */
export const activityRoutes: FastifyPluginAsync = async (_app) => {
  // Implemented by the feature team.
};
