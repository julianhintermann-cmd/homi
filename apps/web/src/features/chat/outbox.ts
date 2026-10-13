import { create } from 'zustand';
import type { PendingMessage } from './timeline';

/*
 * Optimistic outbox: messages the user sent that the server has not confirmed yet. Entries are
 * keyed by their `clientId` (the idempotency key), so any number of retries – manual, after a
 * reconnect, or racing with the realtime echo – store exactly one message server-side.
 * In-memory on purpose: message text is private data and never written to web storage.
 */

export interface OutboxEntry extends PendingMessage {
  householdId: string;
  /** Request meta of a `SHOPPING_ITEM` message (the server snapshots name/quantity/unit). */
  shoppingItemId: string | null;
  /** Network/timeout/server failures are retried automatically when the socket reconnects. */
  retryOnReconnect: boolean;
}

interface OutboxState {
  entries: OutboxEntry[];
  /** Unsent composer text per conversation. */
  drafts: Record<string, string>;
  add: (entry: OutboxEntry) => void;
  update: (clientId: string, patch: Partial<Omit<OutboxEntry, 'clientId'>>) => void;
  remove: (clientId: string) => void;
  setDraft: (conversationId: string, text: string) => void;
  /** Drops everything (logout / household removal). */
  reset: () => void;
}

export const useOutboxStore = create<OutboxState>()((set) => ({
  entries: [],
  drafts: {},
  add: (entry) =>
    set((state) => ({
      entries: state.entries.some((existing) => existing.clientId === entry.clientId)
        ? state.entries
        : [...state.entries, entry],
    })),
  update: (clientId, patch) =>
    set((state) => ({
      entries: state.entries.map((entry) => (entry.clientId === clientId ? { ...entry, ...patch } : entry)),
    })),
  remove: (clientId) =>
    set((state) =>
      state.entries.some((entry) => entry.clientId === clientId)
        ? { entries: state.entries.filter((entry) => entry.clientId !== clientId) }
        : state,
    ),
  setDraft: (conversationId, text) =>
    set((state) => {
      const drafts = { ...state.drafts };
      if (text) drafts[conversationId] = text;
      else delete drafts[conversationId];
      return { drafts };
    }),
  reset: () => set({ entries: [], drafts: {} }),
}));

/** Pending entries of one conversation (stable order by creation time). */
export function selectPending(entries: readonly OutboxEntry[], conversationId: string): OutboxEntry[] {
  return entries.filter((entry) => entry.conversationId === conversationId);
}

/** Entries the reconnect flush should (re)deliver. */
export function selectFlushable(entries: readonly OutboxEntry[], inFlight: ReadonlySet<string>): OutboxEntry[] {
  return entries.filter(
    (entry) =>
      !inFlight.has(entry.clientId) &&
      (entry.status === 'sending' || (entry.status === 'failed' && entry.retryOnReconnect)),
  );
}

/** RFC 4122 v4 id as idempotency key (`crypto.randomUUID`, with a fallback for old WebViews). */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
