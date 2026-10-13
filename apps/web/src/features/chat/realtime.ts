import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { ChatMessageEvent, ChatReadEvent, ChatTypingEvent } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { getSocket } from '@/lib/socket';
import { applyConfirmedMessage, applyReadEvent, currentUser } from './cache';
import { flushOutbox, resetReadCursorMemory } from './delivery';
import { useOutboxStore } from './outbox';

/*
 * App-lifetime chat listeners on the singleton socket, installed once per QueryClient the first
 * time a chat screen mounts. `chat:message` / `chat:read` patch the cache directly (history,
 * list order, unread badges) instead of refetching; `connect` flushes the outbox.
 */

/** A typing indicator expires if no update arrives (lost "stop" signal). */
const TYPING_TTL_MS = 6_000;

interface TypingEntry {
  displayName: string;
  until: number;
}

interface TypingState {
  /** conversationId → userId → entry */
  byConversation: Record<string, Record<string, TypingEntry>>;
  apply: (event: ChatTypingEvent, now?: number) => void;
  prune: (now?: number) => void;
}

export const useTypingStore = create<TypingState>()((set) => ({
  byConversation: {},
  apply: (event, now = Date.now()) =>
    set((state) => {
      const current = { ...state.byConversation[event.conversationId] };
      if (event.typing) current[event.userId] = { displayName: event.displayName, until: now + TYPING_TTL_MS };
      else delete current[event.userId];
      return { byConversation: { ...state.byConversation, [event.conversationId]: current } };
    }),
  prune: (now = Date.now()) =>
    set((state) => {
      let changed = false;
      const next: TypingState['byConversation'] = {};
      for (const [conversationId, users] of Object.entries(state.byConversation)) {
        const kept: Record<string, TypingEntry> = {};
        for (const [userId, entry] of Object.entries(users)) {
          if (entry.until > now) kept[userId] = entry;
          else changed = true;
        }
        next[conversationId] = kept;
      }
      return changed ? { byConversation: next } : state;
    }),
}));

const installed = new WeakSet<QueryClient>();

export function installChatRealtime(client: QueryClient): void {
  if (installed.has(client)) return;
  installed.add(client);
  const socket = getSocket();

  socket.on('chat:message', (event: ChatMessageEvent) => {
    applyConfirmedMessage(client, event.householdId, event.message);
    const me = currentUser(client);
    if (me && event.message.sender?.id === me.id) useOutboxStore.getState().remove(event.message.clientId);
    // A new message ends the sender's typing indicator.
    if (event.message.sender) {
      useTypingStore.getState().apply({
        conversationId: event.conversationId,
        userId: event.message.sender.id,
        displayName: event.message.sender.displayName,
        typing: false,
      });
    }
  });

  socket.on('chat:read', (event: ChatReadEvent) => {
    applyReadEvent(client, event.conversationId, event.userId, event.seq);
  });

  socket.on('chat:typing', (event: ChatTypingEvent) => {
    useTypingStore.getState().apply(event);
  });

  socket.on('connect', () => {
    resetReadCursorMemory();
    flushOutbox(client);
  });

  // Logout: no message text of the previous user stays in memory.
  client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.query.queryKey[0] !== queryKeys.me[0]) return;
    if (event.query.state.data === null) {
      useOutboxStore.getState().reset();
      useTypingStore.setState({ byConversation: {} });
    }
  });

  if (socket.connected) flushOutbox(client);
}

/** Mount in every chat screen: installs the listeners once (they stay for the app lifetime). */
export function useChatRealtime(): void {
  const client = useQueryClient();
  useEffect(() => {
    installChatRealtime(client);
  }, [client]);
}
