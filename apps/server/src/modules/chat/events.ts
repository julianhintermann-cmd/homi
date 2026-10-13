import type { FastifyInstance } from 'fastify';
import type { MessageDto } from '@homi/shared';
import type { ConversationAccess } from './service';

/*
 * Chat realtime fan-out (§6). Chat events go only to the `user:<id>` rooms of the conversation's
 * members – never to the household room – and are emitted after the write committed.
 */

export function emitMessage(app: FastifyInstance, access: ConversationAccess, message: MessageDto): void {
  app.realtime.emitToUsers(access.memberIds, 'chat:message', {
    householdId: access.householdId,
    conversationId: access.conversationId,
    message,
  });
}

export function emitRead(app: FastifyInstance, access: ConversationAccess, userId: string, seq: string): void {
  app.realtime.emitToUsers(access.memberIds, 'chat:read', {
    conversationId: access.conversationId,
    userId,
    seq,
  });
}
