import type {
  ConversationDto,
  CreateDirectConversationRequest,
  MessageDto,
  MessagePage,
  ReadCursorRequest,
  ReadCursorResponse,
  SendMessageRequest,
} from '@homi/shared';
import { api } from './client';

/*
 * Chat endpoints (ARCHITECTURE §5 "Chat"). Realtime delivery and the optimistic outbox live in
 * `features/chat`; these functions are the plain HTTP transport.
 */

const household = (householdId: string) => `/api/households/${encodeURIComponent(householdId)}`;
const conversation = (householdId: string, conversationId: string) =>
  `${household(householdId)}/conversations/${encodeURIComponent(conversationId)}`;

/** Conversations of the active household the user belongs to (newest activity first). */
export function fetchConversations(householdId: string, signal?: AbortSignal): Promise<ConversationDto[]> {
  return api.get<ConversationDto[]>(`${household(householdId)}/conversations`, { signal });
}

/** Get-or-create the direct conversation with another household member. */
export function openDirectConversation(householdId: string, userId: string): Promise<ConversationDto> {
  const body: CreateDirectConversationRequest = { userId };
  return api.post<ConversationDto>(`${household(householdId)}/conversations/direct`, body);
}

export interface MessagePageParams {
  /** Older history: messages with `seq < before` (newest first page when omitted). */
  before?: string;
  /** Catch-up: messages with `seq > after`, oldest first. */
  after?: string;
  limit?: number;
}

/** One page of history in ascending `seq` order. */
export function fetchMessages(
  householdId: string,
  conversationId: string,
  params: MessagePageParams = {},
  signal?: AbortSignal,
): Promise<MessagePage> {
  return api.get<MessagePage>(`${conversation(householdId, conversationId)}/messages`, {
    query: { before: params.before, after: params.after, limit: params.limit },
    signal,
  });
}

/** Idempotent on `clientId` – retries return the stored message. */
export function postMessage(
  householdId: string,
  conversationId: string,
  body: SendMessageRequest,
): Promise<MessageDto> {
  return api.post<MessageDto>(`${conversation(householdId, conversationId)}/messages`, body);
}

/** Moves the read cursor forward (the server never moves it back). */
export function postReadCursor(householdId: string, conversationId: string, seq: string): Promise<ReadCursorResponse> {
  const body: ReadCursorRequest = { seq };
  return api.post<ReadCursorResponse>(`${conversation(householdId, conversationId)}/read`, body);
}

/** "Zur Einkaufsliste hinzufügen" from the composer creates the shopping item through the shopping client. */
export { createShoppingItem } from './shopping';
