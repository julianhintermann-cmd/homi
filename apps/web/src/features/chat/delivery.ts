import type { QueryClient } from '@tanstack/react-query';
import type { MessageDto, MessageKind, SendMessageRequest, ShoppingItemMessageMeta } from '@homi/shared';
import { postMessage, postReadCursor } from '@/api/chat';
import { ApiError, isApiError } from '@/api/client';
import { showToast } from '@/components';
import { getSocket } from '@/lib/socket';
import { applyConfirmedMessage, applyReadEvent, currentUser } from './cache';
import { newClientId, selectFlushable, useOutboxStore, type OutboxEntry } from './outbox';
import { compareSeq } from './timeline';

/*
 * Sending with an optimistic outbox. Transport: the socket (`chat:send` with ack) while it is
 * connected, otherwise HTTP. Both are idempotent on the `clientId`, so retries and the reconnect
 * flush can never duplicate a message.
 */

const ACK_TIMEOUT_MS = 10_000;

/** Messages currently being delivered (guards against double sends from retry + flush). */
const inFlight = new Set<string>();

/** Errors worth retrying automatically once the connection is back. */
const RETRYABLE_CODES = new Set(['NETWORK_ERROR', 'ACK_TIMEOUT', 'INTERNAL', 'SERVICE_UNAVAILABLE', 'SERVER_ERROR']);

const SOCKET_ERROR_STATUS: Readonly<Record<string, number>> = {
  VALIDATION: 400,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export interface ComposeMessage {
  householdId: string;
  conversationId: string;
  content: string;
  kind?: MessageKind;
  /** `SHOPPING_ITEM`: the created shopping item (shown in the optimistic card). */
  shoppingItem?: ShoppingItemMessageMeta;
}

function toRequest(entry: OutboxEntry): SendMessageRequest {
  return {
    clientId: entry.clientId,
    content: entry.content,
    kind: entry.kind,
    ...(entry.shoppingItemId ? { meta: { shoppingItemId: entry.shoppingItemId } } : {}),
  };
}

function sendOverSocket(entry: OutboxEntry): Promise<MessageDto> {
  const socket = getSocket();
  return new Promise<MessageDto>((resolve, reject) => {
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit(
        'chat:send',
        { conversationId: entry.conversationId, ...toRequest(entry) },
        (error: Error | null, response) => {
          if (error) {
            reject(new ApiError({ status: 0, code: 'ACK_TIMEOUT', message: 'Der Server hat nicht geantwortet.' }));
          } else if (response.ok) {
            resolve(response.message);
          } else {
            reject(
              new ApiError({
                status: SOCKET_ERROR_STATUS[response.error.code] ?? 400,
                code: response.error.code,
                message: response.error.message,
              }),
            );
          }
        },
      );
  });
}

function transport(entry: OutboxEntry): Promise<MessageDto> {
  if (getSocket().connected) return sendOverSocket(entry);
  return postMessage(entry.householdId, entry.conversationId, toRequest(entry));
}

async function deliver(client: QueryClient, entry: OutboxEntry): Promise<void> {
  if (inFlight.has(entry.clientId)) return;
  inFlight.add(entry.clientId);
  useOutboxStore.getState().update(entry.clientId, { status: 'sending', error: undefined });
  try {
    const message = await transport(entry);
    applyConfirmedMessage(client, entry.householdId, message);
    useOutboxStore.getState().remove(entry.clientId);
  } catch (error) {
    const code = isApiError(error) ? error.code : 'NETWORK_ERROR';
    const retryable = RETRYABLE_CODES.has(code);
    const message = isApiError(error) ? error.message : 'Die Nachricht konnte nicht gesendet werden.';
    useOutboxStore.getState().update(entry.clientId, { status: 'failed', error: message, retryOnReconnect: retryable });
    // Connection problems are visible in the bubble (and retried automatically); rejections
    // such as the rate limit deserve an explanation.
    if (!retryable) showToast({ tone: 'error', message });
  } finally {
    inFlight.delete(entry.clientId);
  }
}

/** Queues a message optimistically and delivers it. Returns its `clientId`. */
export function sendChatMessage(client: QueryClient, input: ComposeMessage): string {
  const entry: OutboxEntry = {
    clientId: newClientId(),
    householdId: input.householdId,
    conversationId: input.conversationId,
    kind: input.kind ?? 'TEXT',
    content: input.content,
    meta: input.shoppingItem ?? null,
    shoppingItemId: input.shoppingItem?.shoppingItemId ?? null,
    createdAt: new Date().toISOString(),
    status: 'sending',
    retryOnReconnect: true,
  };
  useOutboxStore.getState().add(entry);
  void deliver(client, entry);
  return entry.clientId;
}

/** "Erneut senden" – same `clientId`, so a message that did arrive is not duplicated. */
export function retryChatMessage(client: QueryClient, clientId: string): void {
  const entry = useOutboxStore.getState().entries.find((candidate) => candidate.clientId === clientId);
  if (entry) void deliver(client, entry);
}

/** Re-delivers queued and connection-failed messages (socket `connect`). */
export function flushOutbox(client: QueryClient): void {
  for (const entry of selectFlushable(useOutboxStore.getState().entries, inFlight)) void deliver(client, entry);
}

/** Last read cursor sent per conversation (avoids re-sending the same position). */
const sentReadCursors = new Map<string, string>();

/**
 * Marks a conversation as read up to `seq`: optimistic cache update (badge, receipts), then
 * `chat:read` over the socket or `POST …/read`. The server keeps the cursor monotonic.
 */
export function markConversationRead(client: QueryClient, householdId: string, conversationId: string, seq: string) {
  const me = currentUser(client);
  if (!me) return;
  const previous = sentReadCursors.get(conversationId);
  if (previous !== undefined && compareSeq(previous, seq) >= 0) return;
  sentReadCursors.set(conversationId, seq);
  applyReadEvent(client, conversationId, me.id, seq);

  const forget = () => {
    if (sentReadCursors.get(conversationId) === seq) sentReadCursors.delete(conversationId);
  };
  const socket = getSocket();
  if (socket.connected) {
    socket.emit('chat:read', { conversationId, seq }, (response) => {
      if (!response.ok) forget();
    });
  } else {
    postReadCursor(householdId, conversationId, seq).catch(forget);
  }
}

/** Forgets the sent cursors (e.g. after a reconnect the server state is authoritative again). */
export function resetReadCursorMemory(): void {
  sentReadCursors.clear();
}
