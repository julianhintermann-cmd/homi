import { describe, expect, it, vi } from 'vitest';
import {
  SOCKET_PATH as SHARED_SOCKET_PATH,
  SOCKET_UNAUTHORIZED as SHARED_UNAUTHORIZED,
  type SyncEvent,
} from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { createQueryClient } from '@/lib/queryClient';
import { SOCKET_PATH, SOCKET_UNAUTHORIZED } from '@/lib/socket';
import { applyMembershipEvent, applyReconnect, queryKeysForSyncEvent } from './useRealtimeSync';

const H = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';

const sync = (event: Omit<SyncEvent, 'householdId' | 'actorId'>): SyncEvent => ({
  householdId: H,
  actorId: ACTOR,
  ...event,
});

describe('queryKeysForSyncEvent', () => {
  it('maps scopes to the §7 query keys', () => {
    expect(queryKeysForSyncEvent(sync({ scope: 'inventory', action: 'updated', entityId: 'i1' }))).toEqual([
      ['items', H],
      ['item', H, 'i1'],
    ]);
    expect(queryKeysForSyncEvent(sync({ scope: 'inventory', action: 'bulk' }))).toEqual([
      ['items', H],
      ['item', H],
    ]);
    expect(queryKeysForSyncEvent(sync({ scope: 'shopping', action: 'created' }))).toEqual([['shopping', H]]);
    expect(queryKeysForSyncEvent(sync({ scope: 'dashboard', action: 'updated' }))).toEqual([['dashboard', H]]);
    expect(queryKeysForSyncEvent(sync({ scope: 'household', action: 'updated' }))).toEqual([['household', H], ['me']]);
    expect(queryKeysForSyncEvent(sync({ scope: 'members', action: 'deleted' }))).toEqual([
      ['household', H],
      ['me'],
      ['dashboard', H],
      ['conversations', H],
      ['invitations', H],
    ]);
    expect(queryKeysForSyncEvent(sync({ scope: 'conversations', action: 'created', entityId: 'c1' }))).toEqual([
      ['conversations', H],
      ['messages', H, 'c1'],
    ]);
  });
});

describe('membership and reconnect handling', () => {
  it('drops cached data of a household the user was removed from', () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.items(H, { sort: 'name' }), { items: [] });
    client.setQueryData(queryKeys.shopping(H), { open: [] });
    client.setQueryData(queryKeys.shopping(OTHER), { open: [] });
    client.setQueryData(queryKeys.me, null);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    applyMembershipEvent(client, { householdId: H, action: 'removed' });

    expect(client.getQueryData(queryKeys.items(H, { sort: 'name' }))).toBeUndefined();
    expect(client.getQueryData(queryKeys.shopping(H))).toBeUndefined();
    expect(client.getQueryData(queryKeys.shopping(OTHER))).toEqual({ open: [] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] });
  });

  it('invalidates me + all household queries after a reconnect', async () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.me, null);
    client.setQueryData(queryKeys.dashboard(H), {});
    client.setQueryData(['auth-config'], { passwordResetEnabled: true });

    applyReconnect(client);

    expect(client.getQueryState(queryKeys.me)?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.dashboard(H))?.isInvalidated).toBe(true);
    expect(client.getQueryState(['auth-config'])?.isInvalidated).toBe(false);
  });
});

describe('socket constants', () => {
  it('mirror the shared contract', () => {
    expect(SOCKET_PATH).toBe(SHARED_SOCKET_PATH);
    expect(SOCKET_UNAUTHORIZED).toBe(SHARED_UNAUTHORIZED);
  });
});
