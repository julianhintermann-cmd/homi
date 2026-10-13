import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  ChangeMemberRoleRequestSchema,
  CreateHouseholdRequestSchema,
  CreateInvitationRequestSchema,
  RenameHouseholdRequestSchema,
  type AcceptInvitationResponse,
  type CreatedInvitation,
  type HouseholdDetail,
  type HouseholdListResponse,
  type HouseholdRole,
  type InvitationListResponse,
  type InvitationPreview,
  type MemberDto,
} from '@homi/shared';
import { AppError } from '../../lib/http-errors';
import { RATE_LIMITS, type KeyedRateLimiter } from '../../lib/rate-limit';
import { requireMember, requireUser } from '../../plugins/auth';
import { householdSummarySelect, invitationDtoSelect, toHouseholdSummary, toInvitationDto, toMemberDto } from './dto';
import {
  acceptInvitation,
  activeInvitationWhere,
  changeMemberRole,
  createHousehold,
  createInvitation,
  deleteHousehold,
  loadHouseholdDetail,
  previewInvitation,
  removeMember,
  renameHousehold,
  revokeInvitation,
} from './service';

/**
 * Households, members & invitations (§5): /households, /households/:householdId(/members|/invitations),
 * public GET /invitations/:token and POST /invitations/:token/accept.
 *
 * Registered by app.ts under the `/api` prefix. Tenant isolation: every household route goes
 * through `requireMember()` (non-member or malformed id → 404) and every query filters by the
 * household id. Membership changes re-sync socket rooms and emit `membership` / `sync` after commit.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-user abuse guards for the authenticated "create" endpoints (in-memory, single process). */
export const HOUSEHOLD_RATE_LIMITS = {
  /** POST /households – 10 per hour per user. */
  createHousehold: { max: 10, windowMs: 60 * 60 * 1000 },
  /** POST /households/:id/invitations – 30 per hour per user. */
  createInvitation: { max: 30, windowMs: 60 * 60 * 1000 },
} as const;

/**
 * Malformed ids behave like unknown ids (404) – never reveal anything about other tenants.
 * Valid ids are returned in canonical (lower-case) form: PostgreSQL matches uuids
 * case-insensitively, Socket.IO room names do not.
 */
function requireId(value: string, message?: string): string {
  if (!UUID.test(value)) throw new AppError('NOT_FOUND', message);
  return value.toLowerCase();
}

/** `requireMember` with the household id in canonical (lower-case) form. */
async function requireHouseholdMember(request: FastifyRequest, householdId: string, minRole?: HouseholdRole) {
  const member = await requireMember(request, householdId, minRole);
  return { ...member, householdId: member.householdId.toLowerCase() };
}

function consumeOrThrow(limiter: KeyedRateLimiter, key: string, reply: FastifyReply, message: string): void {
  if (limiter.consume(key)) return;
  const retryAfterSeconds = Math.max(1, Math.ceil(limiter.retryAfterMs(key) / 1000));
  reply.header('retry-after', String(retryAfterSeconds));
  throw new AppError('RATE_LIMITED', message, { details: { retryAfterSeconds } });
}

interface HouseholdParams {
  householdId: string;
}
interface MemberParams extends HouseholdParams {
  userId: string;
}
interface InvitationParams extends HouseholdParams {
  invitationId: string;
}
interface TokenParams {
  token: string;
}

export const householdsRoutes: FastifyPluginAsync = async (app) => {
  const createHouseholdLimiter = app.createKeyedRateLimiter(HOUSEHOLD_RATE_LIMITS.createHousehold);
  const createInvitationLimiter = app.createKeyedRateLimiter(HOUSEHOLD_RATE_LIMITS.createInvitation);

  // ── Households ──────────────────────────────────────────────────────────────

  app.get('/households', async (request): Promise<HouseholdListResponse> => {
    const user = requireUser(request);
    const rows = await app.prisma.householdMember.findMany({
      where: { userId: user.id },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      select: householdSummarySelect,
    });
    return rows.map(toHouseholdSummary);
  });

  app.post('/households', async (request, reply): Promise<HouseholdDetail> => {
    const user = requireUser(request);
    const { name } = CreateHouseholdRequestSchema.parse(request.body);
    consumeOrThrow(
      createHouseholdLimiter,
      `household-create:${user.id}`,
      reply,
      'Du hast in kurzer Zeit zu viele Haushalte erstellt. Bitte versuche es später nochmals.',
    );
    const detail = await createHousehold(app, user, name);
    reply.code(201);
    return detail;
  });

  app.get<{ Params: HouseholdParams }>('/households/:householdId', async (request): Promise<HouseholdDetail> => {
    const member = await requireHouseholdMember(request, request.params.householdId);
    return loadHouseholdDetail(app.prisma, member.householdId, member.role);
  });

  app.patch<{ Params: HouseholdParams }>('/households/:householdId', async (request): Promise<HouseholdDetail> => {
    const member = await requireHouseholdMember(request, request.params.householdId, 'ADMIN');
    const { name } = RenameHouseholdRequestSchema.parse(request.body);
    return renameHousehold(app, { id: member.user.id, role: member.role }, member.householdId, name);
  });

  app.delete<{ Params: HouseholdParams }>('/households/:householdId', async (request, reply) => {
    const member = await requireHouseholdMember(request, request.params.householdId, 'OWNER');
    await deleteHousehold(app, member.user.id, member.householdId);
    return reply.code(204).send();
  });

  // ── Members ─────────────────────────────────────────────────────────────────

  app.patch<{ Params: MemberParams }>(
    '/households/:householdId/members/:userId',
    async (request): Promise<MemberDto> => {
      const member = await requireHouseholdMember(request, request.params.householdId, 'OWNER');
      const userId = requireId(request.params.userId, 'Dieses Mitglied gibt es in deinem Haushalt nicht.');
      const { role } = ChangeMemberRoleRequestSchema.parse(request.body);
      const row = await changeMemberRole(app, member.user.id, member.householdId, userId, role);
      return toMemberDto(row);
    },
  );

  app.delete<{ Params: MemberParams }>('/households/:householdId/members/:userId', async (request, reply) => {
    const member = await requireHouseholdMember(request, request.params.householdId);
    const userId = requireId(request.params.userId, 'Dieses Mitglied gibt es in deinem Haushalt nicht.');
    await removeMember(app, member.user.id, member.householdId, userId);
    return reply.code(204).send();
  });

  // ── Invitations (admin side) ────────────────────────────────────────────────

  app.get<{ Params: HouseholdParams }>(
    '/households/:householdId/invitations',
    async (request): Promise<InvitationListResponse> => {
      const member = await requireHouseholdMember(request, request.params.householdId, 'ADMIN');
      const rows = await app.prisma.householdInvitation.findMany({
        where: activeInvitationWhere(member.householdId),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: invitationDtoSelect,
      });
      return rows.map(toInvitationDto);
    },
  );

  app.post<{ Params: HouseholdParams }>(
    '/households/:householdId/invitations',
    async (request, reply): Promise<CreatedInvitation> => {
      const member = await requireHouseholdMember(request, request.params.householdId, 'ADMIN');
      const input = CreateInvitationRequestSchema.parse(request.body ?? {});
      consumeOrThrow(
        createInvitationLimiter,
        `invitation-create:${member.user.id}`,
        reply,
        'Du hast in kurzer Zeit zu viele Einladungslinks erstellt. Bitte versuche es später nochmals.',
      );
      const created = await createInvitation(app, member.user.id, member.householdId, input);
      reply.code(201);
      return created;
    },
  );

  app.delete<{ Params: InvitationParams }>(
    '/households/:householdId/invitations/:invitationId',
    async (request, reply) => {
      const member = await requireHouseholdMember(request, request.params.householdId, 'ADMIN');
      const invitationId = requireId(request.params.invitationId, 'Diese Einladung gibt es nicht.');
      await revokeInvitation(app, member.user.id, member.householdId, invitationId);
      return reply.code(204).send();
    },
  );

  // ── Invitations (public preview + accept) ──────────────────────────────────

  app.get<{ Params: TokenParams }>(
    '/invitations/:token',
    { config: { rateLimit: RATE_LIMITS.invitation } },
    async (request, reply): Promise<InvitationPreview> => {
      // Never cache: the status changes (accepted, revoked) and the URL carries a secret.
      reply.header('Cache-Control', 'no-store');
      return previewInvitation(app, request.params.token);
    },
  );

  app.post<{ Params: TokenParams }>(
    '/invitations/:token/accept',
    { config: { rateLimit: RATE_LIMITS.invitation } },
    async (request): Promise<AcceptInvitationResponse> => {
      const user = requireUser(request);
      return acceptInvitation(app, user, request.params.token);
    },
  );
};
