import type { FastifyPluginAsync } from 'fastify';
import type { HealthResponse } from '@homi/shared';
import { pingDatabase } from '../db';

/** `GET /api/health` → `{ status: "ok", db: "ok" }`, or 503 when the database is unreachable. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', { logLevel: 'warn' }, async (request, reply) => {
    void reply.header('cache-control', 'no-store');
    try {
      await pingDatabase(app.prisma);
      const body: HealthResponse = { status: 'ok', db: 'ok' };
      return body;
    } catch (error) {
      request.log.error({ err: error }, 'health check: database unreachable');
      const body: HealthResponse = { status: 'error', db: 'down' };
      return reply.status(503).send(body);
    }
  });
};
