import { z } from 'zod';
import { MessageDtoSchema, type ChatSendPayload, type MessageDto } from './chat';
import { IdSchema, SeqStringSchema } from './common';
import type { ApiErrorCode } from './errors';

/*
 * Socket.IO contract (§6). Typed event maps are used as generics:
 *   server: new Server<ClientToServerEvents, ServerToClientEvents>(…)
 *   client: io() as Socket<ServerToClientEvents, ClientToServerEvents>
 */

// `SOCKET_PATH`, `SOCKET_EVENTS` and `SOCKET_UNAUTHORIZED` are zod-free constants (constants.ts).

// ---------------------------------------------------------------------------
// Server → client payloads
// ---------------------------------------------------------------------------

export const SYNC_SCOPE_VALUES = [
  'inventory',
  'shopping',
  'dashboard',
  'household',
  'members',
  'conversations',
] as const;
export const SyncScopeSchema = z.enum(SYNC_SCOPE_VALUES);
export type SyncScope = z.infer<typeof SyncScopeSchema>;

export const SYNC_ACTION_VALUES = ['created', 'updated', 'deleted', 'bulk'] as const;
export const SyncActionSchema = z.enum(SYNC_ACTION_VALUES);
export type SyncAction = z.infer<typeof SyncActionSchema>;

/** Broadcast to `household:<id>` after the DB commit; clients invalidate matching queries. */
export const SyncEventSchema = z.object({
  householdId: IdSchema,
  scope: SyncScopeSchema,
  action: SyncActionSchema,
  entityId: z.string().optional(),
  actorId: IdSchema,
});
export type SyncEvent = z.infer<typeof SyncEventSchema>;

export const ChatMessageEventSchema = z.object({
  householdId: IdSchema,
  conversationId: IdSchema,
  message: MessageDtoSchema,
});
export type ChatMessageEvent = z.infer<typeof ChatMessageEventSchema>;

export const ChatReadEventSchema = z.object({
  conversationId: IdSchema,
  userId: IdSchema,
  seq: SeqStringSchema,
});
export type ChatReadEvent = z.infer<typeof ChatReadEventSchema>;

export const ChatTypingEventSchema = z.object({
  conversationId: IdSchema,
  userId: IdSchema,
  displayName: z.string(),
  typing: z.boolean(),
});
export type ChatTypingEvent = z.infer<typeof ChatTypingEventSchema>;

export const MembershipEventSchema = z.object({
  householdId: IdSchema,
  action: z.enum(['added', 'removed']),
});
export type MembershipEvent = z.infer<typeof MembershipEventSchema>;

// ---------------------------------------------------------------------------
// Client → server payloads
// ---------------------------------------------------------------------------

// `chat:send` payload: see `ChatSendPayloadSchema` in ./chat.

export const ChatReadPayloadSchema = z.object({ conversationId: IdSchema, seq: SeqStringSchema });
export type ChatReadPayload = z.infer<typeof ChatReadPayloadSchema>;

export const ChatTypingPayloadSchema = z.object({ conversationId: IdSchema, typing: z.boolean() });
export type ChatTypingPayload = z.infer<typeof ChatTypingPayloadSchema>;

// ---------------------------------------------------------------------------
// Acknowledgements
// ---------------------------------------------------------------------------

export interface SocketAckError {
  ok: false;
  error: { code: ApiErrorCode; message: string };
}

/** Ack callback payload: `{ ok: true, ...data } | { ok: false, error }`. */
export type SocketAck<T extends object = Record<never, never>> = ({ ok: true } & T) | SocketAckError;

// ---------------------------------------------------------------------------
// Typed event maps
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
  sync: (event: SyncEvent) => void;
  'chat:message': (event: ChatMessageEvent) => void;
  'chat:read': (event: ChatReadEvent) => void;
  'chat:typing': (event: ChatTypingEvent) => void;
  membership: (event: MembershipEvent) => void;
}

export interface ClientToServerEvents {
  'chat:send': (payload: ChatSendPayload, ack: (response: SocketAck<{ message: MessageDto }>) => void) => void;
  'chat:read': (payload: ChatReadPayload, ack?: (response: SocketAck) => void) => void;
  'chat:typing': (payload: ChatTypingPayload) => void;
}

export type ServerToClientEventName = keyof ServerToClientEvents;
export type ClientToServerEventName = keyof ClientToServerEvents;
