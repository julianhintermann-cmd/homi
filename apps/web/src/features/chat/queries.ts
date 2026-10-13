import { useEffect, useMemo } from 'react';
import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageDto, ReadState } from '@homi/shared';
import { fetchConversations, fetchMessages } from '@/api/chat';
import { queryKeys } from '@/api/queryKeys';
import { getSocket } from '@/lib/socket';
import { insertIntoPages, type MessagesData } from './cache';
import { mergeMessages } from './timeline';

export const MESSAGE_PAGE_SIZE = 50;
/** Catch-up pages after a reconnect (`?after=`), at most this many requests. */
const CATCH_UP_MAX_PAGES = 10;

export function conversationsQueryOptions(householdId: string) {
  return queryOptions({
    queryKey: queryKeys.conversations(householdId),
    queryFn: ({ signal }) => fetchConversations(householdId, signal),
  });
}

/** Newest page first; `fetchNextPage()` loads older history (`?before=<oldest seq>`). */
export function messagesQueryOptions(householdId: string, conversationId: string) {
  return infiniteQueryOptions({
    queryKey: queryKeys.messages(householdId, conversationId),
    queryFn: ({ pageParam, signal }) =>
      fetchMessages(householdId, conversationId, { before: pageParam, limit: MESSAGE_PAGE_SIZE }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.messages[0]?.seq : undefined),
  });
}

const NO_MEMBERS: readonly ReadState[] = [];
const NO_MESSAGES: readonly MessageDto[] = [];

/**
 * History of one conversation: all loaded pages merged in ascending order plus the members'
 * read cursors. After a socket reconnect the messages newer than the last known `seq` are
 * fetched (`?after=`) and merged without reloading the history.
 */
export function useConversationMessages(householdId: string, conversationId: string) {
  const client = useQueryClient();
  const query = useInfiniteQuery(messagesQueryOptions(householdId, conversationId));
  const messages = useMemo(
    () =>
      query.data
        ? mergeMessages(
            [],
            query.data.pages.flatMap((page) => page.messages),
          )
        : NO_MESSAGES,
    [query.data],
  );
  const members = query.data?.pages[0]?.members ?? NO_MEMBERS;

  useEffect(() => {
    const socket = getSocket();
    const key = queryKeys.messages(householdId, conversationId);
    let cancelled = false;
    const catchUp = async () => {
      let after = client.getQueryData<MessagesData>(key)?.pages[0]?.messages.at(-1)?.seq;
      for (let page = 0; after && !cancelled && page < CATCH_UP_MAX_PAGES; page += 1) {
        const result = await fetchMessages(householdId, conversationId, { after, limit: 100 });
        if (cancelled) return;
        client.setQueryData<MessagesData>(key, (data) => {
          const merged = insertIntoPages(data, result.messages);
          const first = merged?.pages[0];
          return merged && first
            ? { ...merged, pages: [{ ...first, members: result.members }, ...merged.pages.slice(1)] }
            : merged;
        });
        if (!result.hasMore) return;
        after = result.messages.at(-1)?.seq;
      }
    };
    const onConnect = () => {
      catchUp().catch(() => undefined);
    };
    socket.on('connect', onConnect);
    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
    };
  }, [client, householdId, conversationId]);

  return { ...query, messages, members };
}
