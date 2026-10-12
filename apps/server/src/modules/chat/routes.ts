import type { FastifyPluginAsync } from 'fastify';

/**
 * Chat (§5, §6): /households/:householdId/conversations(/direct|/:conversationId/messages|/:conversationId/read).
 * Register socket handlers here with app.realtime.onConnection((socket) => …).
 *
 * Registered by app.ts under the `/api` prefix: declare paths relative to it
 * (e.g. `app.get('/households/:householdId/…')`). Validate input with the zod schemas from
 * `@homi/shared` and guard household routes with `requireMember()` (plugins/auth).
 */
export const chatRoutes: FastifyPluginAsync = async (_app) => {
  // Implemented by the feature team.
};
