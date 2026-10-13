import type { FastifyInstance } from 'fastify';
import {
  ChatReadPayloadSchema,
  ChatSendPayloadSchema,
  ChatTypingPayloadSchema,
  type MessageDto,
  type SocketAck,
} from '@homi/shared';
import type { KeyedRateLimiter } from '../../lib/rate-limit';
import { toErrorResponse } from '../../plugins/errors';
import { socketAckError, toAck, type HomiSocket } from '../../plugins/realtime';
import { emitMessage, emitRead } from './events';
import {
  consumeReadAttempt,
  consumeSendAttempt,
  markRead,
  requireConversationForUser,
  sendMessage,
  type ChatLimiters,
} from './service';

/**
 * Client → server chat events (§6). Every payload is zod-validated and every event re-checks
 * that the socket's user is a member of the conversation and of its household. Failures are
 * acknowledged as `{ ok: false, error: { code, message } }` with the shared error catalogue.
 *
 * Same guarantees as the HTTP routes: the per-user attempt limits (`chat:send` 60 / 10 s incl.
 * retries and rejected sends, `chat:read` 60 / 10 s) are consumed before parsing or any database
 * access and share their budget with HTTP; `chat:message` / `chat:read` go to the recipients
 * read inside the write transaction (under the household lock), never to a member list read
 * before it – a member removed while the write waited gets nothing.
 */
export function registerChatSocketHandlers(
  app: FastifyInstance,
  limiters: ChatLimiters & { typing: KeyedRateLimiter },
): void {
  const fail = (socket: HomiSocket, event: string, error: unknown) => {
    const { statusCode, body } = toErrorResponse(error);
    if (statusCode >= 500) {
      app.log.error({ err: error, event, userId: socket.data.userId }, 'chat socket event failed');
    }
    return socketAckError(body.error.code, body.error.message);
  };

  app.realtime.onConnection((socket) => {
    const { userId } = socket.data;

    socket.on('chat:send', (payload: unknown, ack: unknown) => {
      const reply = toAck<SocketAck<{ message: MessageDto }>>(ack);
      void (async () => {
        try {
          consumeSendAttempt(limiters, userId);
          const input = ChatSendPayloadSchema.parse(payload);
          const access = await requireConversationForUser(app.prisma, input.conversationId, userId);
          const result = await sendMessage(app.prisma, access, userId, input, limiters);
          if (result.created) {
            const recipients = { ...access, memberIds: result.recipientIds };
            emitMessage(app, recipients, result.message);
            if (result.readAdvanced) emitRead(app, recipients, userId, result.message.seq);
          }
          reply({ ok: true, message: result.message });
        } catch (error) {
          reply(fail(socket, 'chat:send', error));
        }
      })();
    });

    socket.on('chat:read', (payload: unknown, ack?: unknown) => {
      const reply = toAck<SocketAck>(ack);
      void (async () => {
        try {
          consumeReadAttempt(limiters, userId);
          const input = ChatReadPayloadSchema.parse(payload);
          const access = await requireConversationForUser(app.prisma, input.conversationId, userId);
          const result = await markRead(app.prisma, access, userId, input.seq);
          if (result.advanced) emitRead(app, { ...access, memberIds: result.recipientIds }, userId, result.seq);
          reply({ ok: true });
        } catch (error) {
          reply(fail(socket, 'chat:read', error));
        }
      })();
    });

    socket.on('chat:typing', (payload: unknown) => {
      void (async () => {
        try {
          const input = ChatTypingPayloadSchema.parse(payload);
          // At most one start and one stop signal per second and user.
          if (!limiters.typing.consume(`chat-typing:${userId}:${input.typing ? 'start' : 'stop'}`)) return;
          // Members are read right here and used immediately (no write in between): the event
          // carries no content and goes only to current members of the conversation's household.
          const access = await requireConversationForUser(app.prisma, input.conversationId, userId);
          const recipients = access.memberIds.filter((memberId) => memberId !== userId);
          app.realtime.emitToUsers(recipients, 'chat:typing', {
            conversationId: access.conversationId,
            userId,
            displayName: socket.data.displayName,
            typing: input.typing,
          });
        } catch (error) {
          // Typing indicators are best effort: invalid or unauthorised signals are dropped.
          const { statusCode } = toErrorResponse(error);
          if (statusCode >= 500) app.log.error({ err: error, userId }, 'chat:typing failed');
        }
      })();
    });
  });
}
