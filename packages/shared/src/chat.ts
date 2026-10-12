import { z } from 'zod';
import {
  IdSchema,
  IsoDateTimeSchema,
  MemberRefSchema,
  QuantityStringSchema,
  SeqStringSchema,
  UserRefSchema,
  pageLimitSchema,
} from './common';
import { LIMITS } from './constants';
import { ConversationTypeSchema, MESSAGE_KIND_VALUES, MessageKindSchema, UnitSchema } from './enums';

/*
 * Chat (§5 "Chat", §6 realtime payloads reuse these schemas).
 */

/** Client-generated idempotency key (e.g. `crypto.randomUUID()`). */
export const ClientIdSchema = z
  .string({ error: 'Die Nachrichten-ID fehlt.' })
  .min(LIMITS.messageClientId.min, { error: 'Ungültige Nachrichten-ID.' })
  .max(LIMITS.messageClientId.max, { error: 'Ungültige Nachrichten-ID.' })
  .regex(/^[A-Za-z0-9_-]+$/, { error: 'Ungültige Nachrichten-ID.' });

export const MessageContentSchema = z
  .string({ error: 'Bitte gib eine Nachricht ein.' })
  .trim()
  .min(LIMITS.messageContent.min, { error: 'Bitte gib eine Nachricht ein.' })
  .max(LIMITS.messageContent.max, {
    error: `Die Nachricht darf höchstens ${LIMITS.messageContent.max} Zeichen lang sein.`,
  });

/** `meta` of a `SHOPPING_ITEM` message ("Zur Einkaufsliste hinzugefügt" card). */
export const ShoppingItemMessageMetaSchema = z.object({
  shoppingItemId: IdSchema,
  name: z.string().trim().min(1).max(LIMITS.shoppingItemName.max),
  quantity: QuantityStringSchema.nullable().optional(),
  unit: UnitSchema.nullable().optional(),
});
export type ShoppingItemMessageMeta = z.infer<typeof ShoppingItemMessageMetaSchema>;

const sendMessageShape = {
  clientId: ClientIdSchema,
  content: MessageContentSchema,
  kind: z.enum(MESSAGE_KIND_VALUES, { error: 'Ungültige Nachrichtenart.' }).default('TEXT'),
  meta: ShoppingItemMessageMetaSchema.nullable().optional(),
};

function refineMessageMeta(
  value: { kind: 'TEXT' | 'SHOPPING_ITEM'; meta?: ShoppingItemMessageMeta | null | undefined },
  ctx: z.RefinementCtx,
): void {
  const hasMeta = value.meta !== undefined && value.meta !== null;
  if (value.kind === 'SHOPPING_ITEM' && !hasMeta) {
    ctx.addIssue({ code: 'custom', path: ['meta'], message: 'Angaben zum Einkaufsartikel fehlen.' });
  }
  if (value.kind === 'TEXT' && hasMeta) {
    ctx.addIssue({ code: 'custom', path: ['meta'], message: 'Textnachrichten haben keine Zusatzangaben.' });
  }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const CreateDirectConversationRequestSchema = z.object({ userId: IdSchema });
export type CreateDirectConversationRequest = z.input<typeof CreateDirectConversationRequestSchema>;

/** `POST /households/:hid/conversations/:cid/messages` (idempotent per `clientId`). */
export const SendMessageRequestSchema = z.object(sendMessageShape).superRefine(refineMessageMeta);
export type SendMessageRequest = z.input<typeof SendMessageRequestSchema>;
export type SendMessageInput = z.output<typeof SendMessageRequestSchema>;

/** Socket `chat:send` payload: the HTTP body plus the target conversation. */
export const ChatSendPayloadSchema = z
  .object({ conversationId: IdSchema, ...sendMessageShape })
  .superRefine(refineMessageMeta);
export type ChatSendPayload = z.input<typeof ChatSendPayloadSchema>;
export type ChatSendInput = z.output<typeof ChatSendPayloadSchema>;

/** `POST /households/:hid/conversations/:cid/read` – the read cursor only ever moves forward. */
export const ReadCursorRequestSchema = z.object({ seq: SeqStringSchema });
export type ReadCursorRequest = z.input<typeof ReadCursorRequestSchema>;

/** Query of `GET .../messages?before=<seq>&limit=50`. */
export const MessageListQuerySchema = z.object({
  before: SeqStringSchema.optional(),
  limit: pageLimitSchema(LIMITS.messagesPage.default, LIMITS.messagesPage.max),
});
export type MessageListQuery = z.input<typeof MessageListQuerySchema>;
export type MessageListParams = z.output<typeof MessageListQuerySchema>;

export const ConversationParamsSchema = z.object({ householdId: IdSchema, conversationId: IdSchema });

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const MessageDtoSchema = z.object({
  id: IdSchema,
  /** Global ordering key (BIGINT as string). */
  seq: SeqStringSchema,
  conversationId: IdSchema,
  sender: UserRefSchema.nullable(),
  kind: MessageKindSchema,
  content: z.string(),
  meta: ShoppingItemMessageMetaSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  clientId: z.string(),
});
export type MessageDto = z.infer<typeof MessageDtoSchema>;

/** HOUSEHOLD title = household name, DIRECT title = the other member's display name. */
export const ConversationDtoSchema = z.object({
  id: IdSchema,
  type: ConversationTypeSchema,
  title: z.string(),
  members: z.array(MemberRefSchema),
  lastMessage: MessageDtoSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  updatedAt: IsoDateTimeSchema,
});
export type ConversationDto = z.infer<typeof ConversationDtoSchema>;

export const ConversationListResponseSchema = z.array(ConversationDtoSchema);
export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;

export const ReadStateSchema = z.object({ userId: IdSchema, lastReadSeq: SeqStringSchema });
export type ReadState = z.infer<typeof ReadStateSchema>;

/** Messages are returned in ascending `seq` order. */
export const MessagePageSchema = z.object({
  messages: z.array(MessageDtoSchema),
  hasMore: z.boolean(),
  members: z.array(ReadStateSchema),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;
