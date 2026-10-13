import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE_NAME, roleAtLeast, type HouseholdRole } from '@homi/shared';
import type { AppConfig } from '../config';
import { classifyApiTarget } from '../lib/api-path';
import { AppError } from '../lib/http-errors';
import type { AuthUser } from '../lib/sessions';

/**
 * Session authentication (§4.1): resolves the `homi_session` cookie on every `/api` request
 * and decorates `request.user` / `request.session`.
 */

export function sessionCookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: config.cookieSecure,
  };
}

/** Sets the session cookie (login, registration, sliding refresh). */
export function setSessionCookie(reply: FastifyReply, token: string): void {
  const { config } = reply.server;
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions(config),
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
}

/** Clears the session cookie (logout, invalid session). */
export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions(reply.server.config));
}

export const authPlugin = fp(
  async (app) => {
    app.decorateRequest('user', null);
    app.decorateRequest('session', null);
    app.decorateRequest('sessionToken', null);

    app.addHook('onRequest', async (request, reply) => {
      // Same decision as the CSRF hook (decoded path + matched route, see lib/api-path.ts).
      if (classifyApiTarget(request.url, request.routeOptions.url) === 'none') return;
      const token = request.cookies[SESSION_COOKIE_NAME];
      if (!token) return;

      const result = await app.sessions.validate(token);
      if (!result) {
        clearSessionCookie(reply);
        return;
      }
      request.user = result.user;
      request.session = result.session;
      request.sessionToken = token;
      if (result.refreshed) setSessionCookie(reply, token);
    });
  },
  { name: 'homi-auth', dependencies: ['@fastify/cookie'], fastify: '5.x' },
);

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Returns the authenticated user or throws `401 UNAUTHORIZED`. */
export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw new AppError('UNAUTHORIZED');
  return request.user;
}

export interface MembershipContext {
  user: AuthUser;
  householdId: string;
  membershipId: string;
  role: HouseholdRole;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tenant guard (§4.4): loads the caller's membership of `householdId`.
 * - not logged in → 401 `UNAUTHORIZED`
 * - not a member (or malformed id) → 404 `NOT_FOUND` (existence is never revealed)
 * - role below `minRole` (OWNER > ADMIN > MEMBER) → 403 `FORBIDDEN`
 */
export async function requireMember(
  request: FastifyRequest,
  householdId: string,
  minRole: HouseholdRole = 'MEMBER',
): Promise<MembershipContext> {
  const user = requireUser(request);
  if (!UUID.test(householdId)) throw new AppError('NOT_FOUND');

  const membership = await request.server.prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: user.id } },
    select: { id: true, role: true },
  });
  if (!membership) throw new AppError('NOT_FOUND');
  if (!roleAtLeast(membership.role, minRole)) throw new AppError('FORBIDDEN');

  return { user, householdId, membershipId: membership.id, role: membership.role };
}
