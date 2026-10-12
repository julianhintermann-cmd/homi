import type { FastifyPluginAsync } from 'fastify';

/**
 * Inventory (§5): /households/:householdId/items(/:itemId(/quantity)) and
 * /households/:householdId/images(/:imageId). Multipart is registered globally (single file,
 * MAX_UPLOAD_MB); blobs go through app.storage (lib/storage).
 *
 * Registered by app.ts under the `/api` prefix: declare paths relative to it
 * (e.g. `app.get('/households/:householdId/…')`). Validate input with the zod schemas from
 * `@homi/shared` and guard household routes with `requireMember()` (plugins/auth).
 */
export const inventoryRoutes: FastifyPluginAsync = async (_app) => {
  // Implemented by the feature team.
};
