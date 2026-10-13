import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  LoginRequestSchema,
  PASSWORD_EQUALS_EMAIL_MESSAGE,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  RegisterRequestSchema,
  SESSION_COOKIE_NAME,
  passwordEqualsEmail,
  type AuthConfigResponse,
} from '@homi/shared';
import { Prisma } from '../../db';
import { AppError } from '../../lib/http-errors';
import { hashPassword, verifyPasswordOrDummy } from '../../lib/passwords';
import { KEYED_RATE_LIMITS, RATE_LIMITS } from '../../lib/rate-limit';
import { hashToken } from '../../lib/tokens';
import type { AuthSession } from '../../lib/sessions';
import { clearSessionCookie, requireUser, setSessionCookie } from '../../plugins/auth';
import { lockUserRow, passwordHashUnchanged } from './credentials';
import { fieldValidationError, keyedRateLimitError, noStore } from './http';
import { loadMe } from './me';
import { PASSWORD_RESET_PER_EMAIL_LIMIT, createBackgroundTasks, issuePasswordReset } from './password-reset';

/**
 * Auth (§5 "Auth & account", §4.1–4.3): GET /auth/config, POST /auth/register, POST /auth/login,
 * POST /auth/logout, GET /auth/me, POST /auth/password-reset/request,
 * POST /auth/password-reset/confirm.
 *
 * Registered by app.ts under the `/api` prefix. Every mutation passes the CSRF hook first.
 */

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const loginPerEmail = app.createKeyedRateLimiter(KEYED_RATE_LIMITS.loginPerEmail);
  const resetPerEmail = app.createKeyedRateLimiter(PASSWORD_RESET_PER_EMAIL_LIMIT);
  const background = createBackgroundTasks(app);

  /**
   * The session presented with the request: resolved by the auth hook, or – should a request ever
   * bypass that hook – looked up from the raw cookie, so its sockets can be closed as well.
   */
  async function presentedSession(request: FastifyRequest): Promise<AuthSession | null> {
    if (request.session) return request.session;
    const token = request.cookies[SESSION_COOKIE_NAME];
    return token ? ((await app.sessions.validate(token))?.session ?? null) : null;
  }

  async function endSession(session: AuthSession): Promise<void> {
    await app.sessions.destroyById(session.id);
    await app.realtime.disconnectUser(session.userId, { sessionId: session.id });
  }

  /**
   * Starts a fresh session (login / registration) and sets the cookie. A session presented with
   * the request is destroyed, so a pre-set cookie can never be "upgraded" (session fixation).
   *
   * `verifiedPasswordHash` (login): the session only stands if that hash is still current once the
   * session exists – a password reset or change that committed while the password was being
   * verified wins, and the login fails (see credentials.ts). Returns `false` in that case.
   */
  async function startSession(
    request: FastifyRequest,
    reply: FastifyReply,
    userId: string,
    verifiedPasswordHash?: string,
  ): Promise<boolean> {
    const { token, session } = await app.sessions.create(userId, {
      userAgent: request.headers['user-agent'] ?? null,
    });
    if (
      verifiedPasswordHash !== undefined &&
      !(await passwordHashUnchanged(app.prisma, userId, verifiedPasswordHash))
    ) {
      await app.sessions.destroyById(session.id);
      return false;
    }

    const previous = await presentedSession(request);
    if (previous) await endSession(previous);
    setSessionCookie(reply, token);
    return true;
  }

  app.get('/auth/config', async (_request, reply) => {
    noStore(reply);
    const body: AuthConfigResponse = { passwordResetEnabled: app.mailer.isEnabled() };
    return body;
  });

  app.post('/auth/register', { config: { rateLimit: RATE_LIMITS.register } }, async (request, reply) => {
    const body = RegisterRequestSchema.parse(request.body);

    const existing = await app.prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
    if (existing) throw new AppError('EMAIL_TAKEN');

    const passwordHash = await hashPassword(body.password);
    let userId: string;
    try {
      const user = await app.prisma.user.create({
        data: { displayName: body.displayName, email: body.email, passwordHash },
        select: { id: true },
      });
      userId = user.id;
    } catch (error) {
      // Two registrations for the same address raced past the check above.
      if (isUniqueViolation(error)) throw new AppError('EMAIL_TAKEN');
      throw error;
    }

    await startSession(request, reply, userId);
    request.log.info({ userId }, 'user registered');
    return noStore(reply)
      .status(201)
      .send(await loadMe(app.prisma, userId));
  });

  app.post('/auth/login', { config: { rateLimit: RATE_LIMITS.login } }, async (request, reply) => {
    const { email, password } = LoginRequestSchema.parse(request.body);
    if (!loginPerEmail.consume(email)) throw keyedRateLimitError(reply, loginPerEmail, email);

    const user = await app.prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
    // Unknown e-mail: verify against a dummy hash so both failures take the same time.
    const valid = await verifyPasswordOrDummy(user?.passwordHash, password);
    if (!user || !valid) throw new AppError('INVALID_CREDENTIALS');
    // The password was changed while it was being verified: the old one no longer counts.
    if (!(await startSession(request, reply, user.id, user.passwordHash))) throw new AppError('INVALID_CREDENTIALS');

    // Successful logins do not count against the per-address limit (several devices, typos before).
    loginPerEmail.reset(email);
    return noStore(reply).send(await loadMe(app.prisma, user.id));
  });

  /** Idempotent: always 204, deletes the current session (if any), closes its sockets, clears the cookie. */
  app.post('/auth/logout', async (request, reply) => {
    const session = await presentedSession(request);
    if (session) await endSession(session);
    clearSessionCookie(reply);
    return noStore(reply).status(204).send();
  });

  app.get('/auth/me', async (request, reply) => {
    const user = requireUser(request);
    noStore(reply);
    return loadMe(app.prisma, user.id);
  });

  /**
   * Always `202` – whether the address belongs to an account is never revealed (neither by the
   * status nor by the timing: the token + mail work runs after the response).
   */
  app.post(
    '/auth/password-reset/request',
    { config: { rateLimit: RATE_LIMITS.passwordResetRequest } },
    async (request, reply) => {
      const { email } = PasswordResetRequestSchema.parse(request.body);
      if (app.mailer.isEnabled() && resetPerEmail.consume(email)) {
        background.run('password reset request', request.log, () => issuePasswordReset(app, email, request.log));
      }
      return noStore(reply).status(202).send();
    },
  );

  app.post(
    '/auth/password-reset/confirm',
    { config: { rateLimit: RATE_LIMITS.passwordResetConfirm } },
    async (request, reply) => {
      const { token, password } = PasswordResetConfirmSchema.parse(request.body);
      const tokenHash = hashToken(app.config.sessionSecret, token);

      const record = await app.prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, usedAt: true, user: { select: { email: true } } },
      });
      if (!record || record.usedAt !== null || record.expiresAt.getTime() <= Date.now()) {
        throw new AppError('INVALID_TOKEN');
      }
      if (passwordEqualsEmail(password, record.user.email)) {
        throw fieldValidationError('password', PASSWORD_EQUALS_EMAIL_MESSAGE);
      }

      const passwordHash = await hashPassword(password);
      await app.prisma.$transaction(async (tx) => {
        // Serialises against logins, password changes and new reset tokens of the account
        // (credentials.ts) – always taken first, so the lock order is the same everywhere.
        if (!(await lockUserRow(tx, record.userId))) throw new AppError('INVALID_TOKEN');
        // Claim the token atomically: a concurrent confirmation with the same token loses here.
        const now = new Date();
        const claimed = await tx.passwordResetToken.updateMany({
          where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) throw new AppError('INVALID_TOKEN');
        await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
        await tx.session.deleteMany({ where: { userId: record.userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } });
      });

      // Every session of the account is gone – close its sockets as well.
      await app.realtime.disconnectUser(record.userId);
      if (request.user?.id === record.userId) clearSessionCookie(reply);
      request.log.info({ userId: record.userId }, 'password reset completed');
      return noStore(reply).status(204).send();
    },
  );
};
