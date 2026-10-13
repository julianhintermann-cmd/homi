import type { FastifyPluginAsync } from 'fastify';
import type { DashboardDto } from '@homi/shared';
import { requireMember } from '../../plugins/auth';
import { loadDashboard } from './service';

/**
 * Dashboard (§5): GET /households/:householdId/dashboard – Home aggregates (inventory value,
 * counts, weekly trend, 3 recent items, 3 open shopping items, members, 5 latest activities).
 *
 * Registered by app.ts under the `/api` prefix. Non-members get 404 (`requireMember`).
 */
export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { householdId: string } }>(
    '/households/:householdId/dashboard',
    async (request, reply): Promise<DashboardDto> => {
      const member = await requireMember(request, request.params.householdId);
      reply.header('Cache-Control', 'private, no-store');
      // Canonical (lower-case) id: it ends up in the image URLs of the DTO.
      return loadDashboard(app.prisma, member.householdId.toLowerCase());
    },
  );
};
