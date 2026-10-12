import type { FastifyPluginAsync } from 'fastify';

/**
 * Dashboard (§5): GET /households/:householdId/dashboard.
 * See modules/activity/service.ts for listRecentActivity / sumValueDeltaSince.
 *
 * Registered by app.ts under the `/api` prefix: declare paths relative to it
 * (e.g. `app.get('/households/:householdId/…')`). Validate input with the zod schemas from
 * `@homi/shared` and guard household routes with `requireMember()` (plugins/auth).
 */
export const dashboardRoutes: FastifyPluginAsync = async (_app) => {
  // Implemented by the feature team.
};
