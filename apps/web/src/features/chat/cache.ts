import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { ConversationDto, MeResponse, MessageDto, MessagePage } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { applyMessageToConversations, applyOwnReadToConversations, maxSeq, mergeMessages } from './timeline';

/*
 * Direct TanStack Query cache updates for realtime chat events and acks – no refetch per
 * message ("no refetch storms"). The messages query is an infinite query whose first page holds
 * the newest messages; realtime inserts always go there.
 */

export type MessagesData = InfiniteData<MessagePage, string | undefined>;

/**
 * Puts a conversation returned by `POST …/conversations/direct` into the cached list right away, so
 * the conversation screen opened next finds it without waiting for a refetch (used by "Neuer Chat"
 * and the member screen's "Nachricht senden").
 */
export function rememberConversation(client: QueryClient, householdId: string, conversation: ConversationDto): void {
  client.setQueryData<ConversationDto[]>(queryKeys.conversations(householdId), (list) =>
    list && !list.some((entry) => entry.id === conversation.id) ? [...list, conversation] : list,
  );
}

export function currentUser(client: QueryClient): MeResponse['user'] | null {
  return client.getQueryData<MeResponse | null>(queryKeys.me)?.user ?? null;
}

/** Inserts (dedupes) messages into the newest page of a loaded history. */
export function insertIntoPages(
  data: MessagesData | undefined,
  messages: readonly MessageDto[],
): MessagesData | undefined {
  const first = data?.pages[0];
  if (!data || !first) return data;
  return { ...data, pages: [{ ...first, messages: mergeMessages(first.messages, messages) }, ...data.pages.slice(1)] };
}

/** Moves one member's read cursor forward in the cached history (never backwards). */
export function applyReadToPages(
  data: MessagesData | undefined,
  userId: string,
  seq: string,
): MessagesData | undefined {
  const first = data?.pages[0];
  if (!data || !first) return data;
  let changed = false;
  const members = first.members.map((member) => {
    if (member.userId !== userId) return member;
    const next = maxSeq(member.lastReadSeq, seq);
    if (next === member.lastReadSeq) return member;
    changed = true;
    return { ...member, lastReadSeq: next };
  });
  if (!changed) return data;
  return { ...data, pages: [{ ...first, members }, ...data.pages.slice(1)] };
}

/** All cached message histories of a conversation (the household id is not in `chat:read`). */
function messageQueriesOf(client: QueryClient, conversationId: string) {
  return client
    .getQueryCache()
    .findAll({ queryKey: ['messages'] })
    .filter((query) => query.queryKey[2] === conversationId);
}

/**
 * A confirmed message (ack, HTTP response or `chat:message`): history + conversation list.
 * Unknown conversations make the list refetch once.
 */
export function applyConfirmedMessage(client: QueryClient, householdId: string, message: MessageDto): void {
  const me = currentUser(client);
  client.setQueryData<MessagesData>(queryKeys.messages(householdId, message.conversationId), (data) =>
    insertIntoPages(data, [message]),
  );
  const listKey = queryKeys.conversations(householdId);
  const list = client.getQueryData<ConversationDto[]>(listKey);
  if (!list) return;
  const next = me ? applyMessageToConversations(list, message, me.id) : null;
  if (next) client.setQueryData(listKey, next);
  else void client.invalidateQueries({ queryKey: listKey });
}

/** `chat:read` (anyone, including the caller on another device). */
export function applyReadEvent(client: QueryClient, conversationId: string, userId: string, seq: string): void {
  for (const query of messageQueriesOf(client, conversationId)) {
    client.setQueryData<MessagesData>(query.queryKey, (data) => applyReadToPages(data, userId, seq));
  }
  const me = currentUser(client);
  if (!me || me.id !== userId) return;
  for (const [key, list] of client.getQueriesData<ConversationDto[]>({ queryKey: ['conversations'] })) {
    if (!list) continue;
    const result = applyOwnReadToConversations(list, conversationId, seq);
    client.setQueryData(key, result.conversations);
    if (!result.exact) void client.invalidateQueries({ queryKey: key });
  }
}
