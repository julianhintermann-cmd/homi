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
import { formatNumber, formatQuantity } from './format';
import { hasControlCharacter } from './text';

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
  })
  // Line breaks and tabs are fine; NUL (PostgreSQL rejects it) and other control characters are not.
  .refine((value) => !hasControlCharacter(value, { multiline: true }), {
    error: 'Die Nachricht enthält ungültige Zeichen.',
  });

/** `meta` of a `SHOPPING_ITEM` message ("Zur Einkaufsliste hinzugefügt" card). */
export const ShoppingItemMessageMetaSchema = z.object({
  shoppingItemId: IdSchema,
  name: z.string().trim().min(1).max(LIMITS.shoppingItemName.max),
  quantity: QuantityStringSchema.nullable().optional(),
  unit: UnitSchema.nullable().optional(),
});
export type ShoppingItemMessageMeta = z.infer<typeof ShoppingItemMessageMetaSchema>;

/**
 * `meta` a client sends with a `SHOPPING_ITEM` message: only the reference. The server loads the
 * shopping item (same household only) and snapshots name/quantity/unit into the stored `meta`;
 * any other keys sent by the client are stripped.
 */
export const ShoppingItemMessageMetaInputSchema = z.object({
  shoppingItemId: IdSchema,
});
export type ShoppingItemMessageMetaInput = z.infer<typeof ShoppingItemMessageMetaInputSchema>;

/** Status line of the shared-item card (design 08). */
export const SHOPPING_ITEM_MESSAGE_STATUS = 'Zur Einkaufsliste hinzugefügt';

/**
 * Card title / text content of a `SHOPPING_ITEM` message: "Milch · 2 Liter", "Brot", "Eier · 6".
 * The server stores this as the message `content`, so previews and notifications agree.
 */
export function shoppingItemMessageTitle(meta: Pick<ShoppingItemMessageMeta, 'name' | 'quantity' | 'unit'>): string {
  const quantity = meta.quantity ?? null;
  if (quantity === null) return meta.name;
  const amount = meta.unit ? formatQuantity(quantity, meta.unit) : formatNumber(quantity, 3);
  return `${meta.name} · ${amount}`;
}

const sendMessageShape = {
  clientId: ClientIdSchema,
  content: MessageContentSchema,
  kind: z.enum(MESSAGE_KIND_VALUES, { error: 'Ungültige Nachrichtenart.' }).default('TEXT'),
  meta: ShoppingItemMessageMetaInputSchema.nullable().optional(),
};

function refineMessageMeta(
  value: { kind: 'TEXT' | 'SHOPPING_ITEM'; meta?: ShoppingItemMessageMetaInput | null | undefined },
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

/**
 * Query of `GET .../messages?before=<seq>&limit=50` (older history, newest page first) or
 * `?after=<seq>` (catch-up after a reconnect: the oldest messages newer than `after`).
 * Both are exclusive cursors; they cannot be combined.
 */
export const MessageListQuerySchema = z
  .object({
    before: SeqStringSchema.optional(),
    after: SeqStringSchema.optional(),
    limit: pageLimitSchema(LIMITS.messagesPage.default, LIMITS.messagesPage.max),
  })
  .superRefine((value, ctx) => {
    if (value.before !== undefined && value.after !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['after'], message: '“before” und “after” schliessen sich aus.' });
    }
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

/**
 * Messages are returned in ascending `seq` order. `hasMore`: older messages exist (`before`/no
 * cursor) or newer messages exist beyond this page (`after`).
 */
export const MessagePageSchema = z.object({
  messages: z.array(MessageDtoSchema),
  hasMore: z.boolean(),
  members: z.array(ReadStateSchema),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;

/** Response of `POST .../read`: the caller's (possibly unchanged) read cursor. */
export const ReadCursorResponseSchema = z.object({
  conversationId: IdSchema,
  userId: IdSchema,
  seq: SeqStringSchema,
});
export type ReadCursorResponse = z.infer<typeof ReadCursorResponseSchema>;

/**
 * Deterministic key of a DIRECT conversation ("<householdId>:<minUserId>:<maxUserId>",
 * `Conversation.directKey`, unique) – both participants map to the same row.
 */
export function directConversationKey(householdId: string, userA: string, userB: string): string {
  const a = userA.toLowerCase();
  const b = userB.toLowerCase();
  const [first, second] = a < b ? [a, b] : [b, a];
  return `${householdId.toLowerCase()}:${first}:${second}`;
}
