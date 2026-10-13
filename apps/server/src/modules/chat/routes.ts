import type { FastifyPluginAsync } from 'fastify';
import {
  CreateDirectConversationRequestSchema,
  MessageListQuerySchema,
  ReadCursorRequestSchema,
  SendMessageRequestSchema,
  type ConversationDto,
  type MessageDto,
  type MessagePage,
  type ReadCursorResponse,
} from '@homi/shared';
import { KEYED_RATE_LIMITS } from '../../lib/rate-limit';
import { requireMember, requireUser } from '../../plugins/auth';
import { emitMessage, emitRead } from './events';
import {
  consumeReadAttempt,
  consumeSendAttempt,
  getOrCreateDirectConversation,
  listConversations,
  listMessages,
  markRead,
  requireConversationInHousehold,
  sendMessage,
  type ChatLimiters,
} from './service';
import { registerChatSocketHandlers } from './socket';

/**
 * Send attempts per user incl. idempotent retries and rejected ones (in front of the 20 / 10 s
 * limit for new messages) and read-cursor updates per user – both checked before any DB access
 * and shared by the HTTP routes and the socket handlers (same limiter instances).
 */
const CHAT_SEND_ATTEMPTS = { max: 60, windowMs: 10_000 } as const;
const CHAT_READS = { max: 60, windowMs: 10_000 } as const;

interface HouseholdParams {
  householdId: string;
}

interface ConversationRouteParams extends HouseholdParams {
  conversationId: string;
}

/**
 * Chat (§5, §6): /households/:householdId/conversations(/direct|/:conversationId/messages|/:conversationId/read)
 * plus the Socket.IO handlers (`chat:send`, `chat:read`, `chat:typing`).
 *
 * Tenant isolation: `requireMember` (household) and `requireConversationInHousehold`
 * (conversation of that household with the caller as member) – everything else is a 404.
 */
export const chatRoutes: FastifyPluginAsync = async (app) => {
  const limiters: ChatLimiters = {
    send: app.createKeyedRateLimiter(KEYED_RATE_LIMITS.chatSend),
    attempts: app.createKeyedRateLimiter(CHAT_SEND_ATTEMPTS),
    reads: app.createKeyedRateLimiter(CHAT_READS),
  };
  const typing = app.createKeyedRateLimiter(KEYED_RATE_LIMITS.chatTyping);

  app.get<{ Params: HouseholdParams }>(
    '/households/:householdId/conversations',
    async (request): Promise<ConversationDto[]> => {
      const { householdId, user } = await requireMember(request, request.params.householdId);
      return listConversations(app.prisma, householdId, user.id);
    },
  );

  app.post<{ Params: HouseholdParams }>('/households/:householdId/conversations/direct', async (request, reply) => {
    const { householdId, user } = await requireMember(request, request.params.householdId);
    const body = CreateDirectConversationRequestSchema.parse(request.body);
    const result = await getOrCreateDirectConversation(app.prisma, householdId, user.id, body.userId);
    return reply.code(result.created ? 201 : 200).send(result.conversation);
  });

  app.get<{ Params: ConversationRouteParams }>(
    '/households/:householdId/conversations/:conversationId/messages',
    async (request): Promise<MessagePage> => {
      const { householdId, user } = await requireMember(request, request.params.householdId);
      const access = await requireConversationInHousehold(
        app.prisma,
        householdId,
        request.params.conversationId,
        user.id,
      );
      const query = MessageListQuerySchema.parse(request.query);
      return listMessages(app.prisma, access, query);
    },
  );

  app.post<{ Params: ConversationRouteParams }>(
    '/households/:householdId/conversations/:conversationId/messages',
    async (request, reply): Promise<MessageDto> => {
      consumeSendAttempt(limiters, requireUser(request).id);
      const { householdId, user } = await requireMember(request, request.params.householdId);
      const access = await requireConversationInHousehold(
        app.prisma,
        householdId,
        request.params.conversationId,
        user.id,
      );
      const body = SendMessageRequestSchema.parse(request.body);
      const result = await sendMessage(app.prisma, access, user.id, body, limiters);
      if (result.created) {
        const recipients = { ...access, memberIds: result.recipientIds };
        emitMessage(app, recipients, result.message);
        if (result.readAdvanced) emitRead(app, recipients, user.id, result.message.seq);
      }
      return reply.code(result.created ? 201 : 200).send(result.message);
    },
  );

  app.post<{ Params: ConversationRouteParams }>(
    '/households/:householdId/conversations/:conversationId/read',
    async (request): Promise<ReadCursorResponse> => {
      consumeReadAttempt(limiters, requireUser(request).id);
      const { householdId, user } = await requireMember(request, request.params.householdId);
      const access = await requireConversationInHousehold(
        app.prisma,
        householdId,
        request.params.conversationId,
        user.id,
      );
      const body = ReadCursorRequestSchema.parse(request.body);
      const result = await markRead(app.prisma, access, user.id, body.seq);
      if (result.advanced) emitRead(app, { ...access, memberIds: result.recipientIds }, user.id, result.seq);
      return { conversationId: access.conversationId, userId: user.id, seq: result.seq };
    },
  );

  registerChatSocketHandlers(app, { ...limiters, typing });
};
