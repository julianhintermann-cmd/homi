import type { FastifyPluginAsync } from 'fastify';
import {
  ChangePasswordRequestSchema,
  PASSWORD_EQUALS_EMAIL_MESSAGE,
  SetActiveHouseholdRequestSchema,
  UpdateProfileRequestSchema,
  passwordEqualsEmail,
} from '@homi/shared';
import { AppError } from '../../lib/http-errors';
import { hashPassword, verifyPassword } from '../../lib/passwords';
import { requireMember, requireUser } from '../../plugins/auth';
import { userRoom } from '../../plugins/realtime';
import { lockUserRow } from '../auth/credentials';
import { loadMe } from '../auth/me';
import { fieldValidationError, keyedRateLimitError, noStore } from '../auth/http';

/**
 * Account (§5 "Auth & account"): PATCH /account, POST /account/password,
 * PUT /account/active-household. All routes require a session; mutations pass the CSRF hook.
 */

/** Current-password checks per user: a stolen session must not be usable to brute-force the password. */
export const PASSWORD_CHANGE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 } as const;

export const accountRoutes: FastifyPluginAsync = async (app) => {
  const passwordChecks = app.createKeyedRateLimiter(PASSWORD_CHANGE_LIMIT);

  app.patch('/account', async (request, reply) => {
    const user = requireUser(request);
    const { displayName } = UpdateProfileRequestSchema.parse(request.body);

    await app.prisma.user.update({ where: { id: user.id }, data: { displayName } });
    const me = await loadMe(app.prisma, user.id);

    if (displayName !== user.displayName) {
      // The name appears in member lists, chats and the dashboard of every household.
      for (const household of me.households) {
        app.realtime.emitSync({
          householdId: household.id,
          scope: 'members',
          action: 'updated',
          entityId: user.id,
          actorId: user.id,
        });
      }
      // Open sockets carry the name for typing indicators.
      try {
        const sockets = await app.realtime.io.in(userRoom(user.id)).fetchSockets();
        for (const socket of sockets) socket.data.displayName = displayName;
      } catch (error) {
        request.log.warn({ err: error }, 'could not update the display name of open sockets');
      }
    }

    return noStore(reply).send(me);
  });

  app.post('/account/password', async (request, reply) => {
    const user = requireUser(request);
    const session = request.session;
    if (!session) throw new AppError('UNAUTHORIZED');
    const { currentPassword, newPassword } = ChangePasswordRequestSchema.parse(request.body);

    if (!passwordChecks.consume(user.id)) throw keyedRateLimitError(reply, passwordChecks, user.id);
    if (passwordEqualsEmail(newPassword, user.email)) {
      throw fieldValidationError('newPassword', PASSWORD_EQUALS_EMAIL_MESSAGE);
    }

    const account = await app.prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!account || !(await verifyPassword(account.passwordHash, currentPassword))) {
      throw new AppError('WRONG_PASSWORD');
    }

    const passwordHash = await hashPassword(newPassword);
    await app.prisma.$transaction(async (tx) => {
      // Same lock as reset confirm / login (auth/credentials.ts): a login with the old password
      // that is still being verified cannot keep a session once this commits.
      await lockUserRow(tx, user.id);
      // Only replace the hash the current password was verified against: if a reset (or another
      // change) committed meanwhile, the "current" password is no longer current.
      const replaced = await tx.user.updateMany({
        where: { id: user.id, passwordHash: account.passwordHash },
        data: { passwordHash },
      });
      if (replaced.count !== 1) throw new AppError('WRONG_PASSWORD');
      // Keep the session that made the change, sign out everywhere else.
      await tx.session.deleteMany({ where: { userId: user.id, id: { not: session.id } } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    });
    passwordChecks.reset(user.id);
    await app.realtime.disconnectUser(user.id, { exceptSessionId: session.id });
    request.log.info({ userId: user.id }, 'password changed');
    return noStore(reply).status(204).send();
  });

  app.put('/account/active-household', async (request, reply) => {
    requireUser(request);
    const { householdId } = SetActiveHouseholdRequestSchema.parse(request.body);
    // Not a member (or no such household) → 404, existence is never revealed.
    const membership = await requireMember(request, householdId);
    await app.prisma.user.update({ where: { id: membership.user.id }, data: { lastHouseholdId: householdId } });
    return noStore(reply).status(204).send();
  });
};
