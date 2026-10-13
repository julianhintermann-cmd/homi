import { useEffect } from 'react';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { MembershipEvent, SyncEvent } from '@homi/shared';
import { isHouseholdScopedKey, queryKeys } from '@/api/queryKeys';
import { getSocket } from '@/lib/socket';

/**
 * Query keys to invalidate for a realtime `sync` event (ARCHITECTURE §6/§7). The server
 * emits `scope: "dashboard"` separately for inventory/shopping changes, so each scope maps
 * only to its own data. Invalidation = authoritative refetch of active queries.
 */
export function queryKeysForSyncEvent(event: SyncEvent): QueryKey[] {
  const hid = event.householdId;
  switch (event.scope) {
    case 'inventory':
      return [queryKeys.itemsAll(hid), event.entityId ? queryKeys.item(hid, event.entityId) : queryKeys.itemAll(hid)];
    case 'shopping':
      return [queryKeys.shopping(hid)];
    case 'dashboard':
      return [queryKeys.dashboard(hid)];
    case 'household':
      // Household name/role also appear in `/auth/me` (household switcher) and as the title of the
      // household group chat in the conversation list.
      return [queryKeys.household(hid), queryKeys.me, queryKeys.conversations(hid)];
    case 'members':
      return [
        queryKeys.household(hid),
        queryKeys.me,
        queryKeys.dashboard(hid),
        queryKeys.conversations(hid),
        queryKeys.invitations(hid),
        // Display names (account rename) are part of every message's `sender`.
        queryKeys.messagesAll(hid),
      ];
    case 'conversations':
      return event.entityId
        ? [queryKeys.conversations(hid), queryKeys.messages(hid, event.entityId)]
        : [queryKeys.conversations(hid)];
    default: {
      const unknownScope: never = event.scope;
      void unknownScope;
      return [];
    }
  }
}

export function applySyncEvent(client: QueryClient, event: SyncEvent): void {
  for (const queryKey of queryKeysForSyncEvent(event)) {
    void client.invalidateQueries({ queryKey });
  }
}

/**
 * Membership changed for the current user: refetch `/auth/me`. When removed, drop all cached
 * data of that household immediately (no stale data of a household we no longer belong to).
 */
export function applyMembershipEvent(client: QueryClient, event: MembershipEvent): void {
  if (event.action === 'removed') {
    client.removeQueries({ predicate: (query) => isHouseholdScopedKey(query.queryKey, event.householdId) });
  }
  void client.invalidateQueries({ queryKey: queryKeys.me });
}

/** After a reconnect, events may have been missed: refetch everything that is on screen. */
export function applyReconnect(client: QueryClient): void {
  void client.invalidateQueries({
    predicate: (query) => query.queryKey[0] === queryKeys.me[0] || isHouseholdScopedKey(query.queryKey),
  });
}

/**
 * Subscribes to `sync` and `membership` events and to reconnects of the singleton socket.
 * Mount once while authenticated (see `AppRuntime`).
 */
export function useRealtimeSync(enabled: boolean): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled) return undefined;
    const socket = getSocket();
    const onSync = (event: SyncEvent): void => applySyncEvent(client, event);
    const onMembership = (event: MembershipEvent): void => applyMembershipEvent(client, event);
    const onReconnect = (): void => applyReconnect(client);

    socket.on('sync', onSync);
    socket.on('membership', onMembership);
    socket.io.on('reconnect', onReconnect);
    return () => {
      socket.off('sync', onSync);
      socket.off('membership', onMembership);
      socket.io.off('reconnect', onReconnect);
    };
  }, [client, enabled]);
}
