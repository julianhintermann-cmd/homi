import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  CreateInvitationRequest,
  HouseholdDetail,
  HouseholdRole,
  InvitationListResponse,
  MeResponse,
} from '@homi/shared';
import {
  acceptInvitation,
  changeMemberRole,
  createHousehold,
  createInvitation,
  deleteHousehold,
  fetchHousehold,
  fetchInvitationPreview,
  fetchInvitations,
  removeMember,
  renameHousehold,
  revokeInvitation,
} from '@/api/households';
import { setActiveHousehold } from '@/api/account';
import { isApiError } from '@/api/client';
import { isHouseholdScopedKey, queryKeys } from '@/api/queryKeys';
import { useActiveHouseholdUiStore } from '@/hooks/useActiveHousehold';
import { meQueryOptions } from '@/hooks/useAuth';

/*
 * TanStack Query hooks for households, members and invitations. Realtime `sync` events
 * (scopes `household` / `members`) invalidate the same keys (hooks/useRealtimeSync.ts).
 */

export function householdQueryOptions(householdId: string) {
  return queryOptions({
    queryKey: queryKeys.household(householdId),
    queryFn: ({ signal }) => fetchHousehold(householdId, signal),
    staleTime: 30_000,
  });
}

export function useHouseholdDetail(householdId: string) {
  return useQuery(householdQueryOptions(householdId));
}

export function useInvitations(householdId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.invitations(householdId),
    queryFn: ({ signal }) => fetchInvitations(householdId, signal),
    enabled,
  });
}

export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: queryKeys.invitationPreview(token),
    queryFn: ({ signal }) => fetchInvitationPreview(token, signal),
    // 404 = invalid link: a definitive answer, retrying cannot change it.
    retry: (failureCount, error) => !(isApiError(error) && error.isClientError) && failureCount < 2,
    staleTime: 0,
  });
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Makes `householdId` the active household in the cached session. Household creation and
 * invitation acceptance (also by an existing member) persist `lastHouseholdId` on the server;
 * `/auth/me` is refetched to pick up the membership. Should the fresh session still name another
 * household, the switch is persisted explicitly (`PUT /account/active-household`) – otherwise the
 * next `/auth/me` refetch (focus, sync event, reload) would silently switch back.
 */
async function activateHousehold(client: QueryClient, householdId: string): Promise<void> {
  useActiveHouseholdUiStore.getState().setPendingHouseholdId(null);
  let fresh: MeResponse | null | undefined;
  try {
    fresh = await client.fetchQuery({ ...meQueryOptions, staleTime: 0 });
  } catch {
    // Offline right after the mutation: keep the optimistic session, refetch later.
    void client.invalidateQueries({ queryKey: queryKeys.me });
  }
  if (
    fresh &&
    fresh.activeHouseholdId !== householdId &&
    fresh.households.some((household) => household.id === householdId)
  ) {
    try {
      await setActiveHousehold(householdId);
      fresh = { ...fresh, activeHouseholdId: householdId };
    } catch {
      // Keep the local switch; the user can still switch via the household switcher.
    }
  }
  client.setQueryData<MeResponse | null>(queryKeys.me, (current) => {
    const me = fresh ?? current;
    if (!me) return current;
    const isMember = me.households.some((household) => household.id === householdId);
    return isMember ? { ...me, activeHouseholdId: householdId } : me;
  });
}

/** Drops every cached query of a household the user no longer belongs to and refreshes the session. */
async function forgetHousehold(client: QueryClient, householdId: string): Promise<void> {
  client.removeQueries({ predicate: (query) => isHouseholdScopedKey(query.queryKey, householdId) });
  client.setQueryData<MeResponse | null>(queryKeys.me, (current) =>
    current
      ? {
          ...current,
          households: current.households.filter((household) => household.id !== householdId),
          activeHouseholdId: current.activeHouseholdId === householdId ? null : current.activeHouseholdId,
        }
      : current,
  );
  await client.invalidateQueries({ queryKey: queryKeys.me });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Creates a household and switches to it. */
export function useCreateHousehold() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createHousehold({ name }),
    onSuccess: async (detail) => {
      client.setQueryData(queryKeys.household(detail.id), detail);
      client.setQueryData<MeResponse | null>(queryKeys.me, (current) =>
        current
          ? {
              ...current,
              households: [
                ...current.households.filter((household) => household.id !== detail.id),
                { id: detail.id, name: detail.name, role: detail.myRole, memberCount: detail.members.length },
              ],
              activeHouseholdId: detail.id,
            }
          : current,
      );
      await activateHousehold(client, detail.id);
    },
  });
}

export function useRenameHousehold(householdId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameHousehold(householdId, { name }),
    onSuccess: (detail) => {
      client.setQueryData(queryKeys.household(householdId), detail);
      client.setQueryData<MeResponse | null>(queryKeys.me, (current) =>
        current
          ? {
              ...current,
              households: current.households.map((household) =>
                household.id === householdId ? { ...household, name: detail.name } : household,
              ),
            }
          : current,
      );
    },
  });
}

export interface LeaveOptions {
  /**
   * Runs right after the server confirmed, before the household is dropped from the session –
   * navigate away here, so the screen never re-renders with another household's data.
   */
  onGone?: () => void;
}

export function useDeleteHousehold(householdId: string, options: LeaveOptions = {}) {
  const client = useQueryClient();
  const { onGone } = options;
  return useMutation({
    mutationFn: () => deleteHousehold(householdId),
    onSuccess: async () => {
      onGone?.();
      await forgetHousehold(client, householdId);
    },
  });
}

/** Leave the household (= remove yourself). */
export function useLeaveHousehold(householdId: string, meId: string, options: LeaveOptions = {}) {
  const client = useQueryClient();
  const { onGone } = options;
  return useMutation({
    mutationFn: () => removeMember(householdId, meId),
    onSuccess: async () => {
      onGone?.();
      await forgetHousehold(client, householdId);
    },
  });
}

export interface RemoveMemberOptions {
  /**
   * Runs right after the server confirmed, before the member disappears from the cache – the
   * member screen navigates away here (it unmounts once the member is gone, so callbacks passed
   * to `mutate()` would never run).
   */
  onRemoved?: (userId: string) => void;
}

export function useRemoveMember(householdId: string, options: RemoveMemberOptions = {}) {
  const client = useQueryClient();
  const { onRemoved } = options;
  return useMutation({
    mutationFn: (userId: string) => removeMember(householdId, userId),
    onSuccess: (_result, userId) => {
      onRemoved?.(userId);
      client.setQueryData<HouseholdDetail>(queryKeys.household(householdId), (current) =>
        current ? { ...current, members: current.members.filter((member) => member.userId !== userId) } : current,
      );
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.household(householdId) }),
        client.invalidateQueries({ queryKey: queryKeys.dashboard(householdId) }),
        client.invalidateQueries({ queryKey: queryKeys.me }),
      ]);
    },
  });
}

export function useChangeMemberRole(householdId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: HouseholdRole }) =>
      changeMemberRole(householdId, userId, role),
    onSuccess: (member) => {
      client.setQueryData<HouseholdDetail>(queryKeys.household(householdId), (current) =>
        current
          ? { ...current, members: current.members.map((m) => (m.userId === member.userId ? member : m)) }
          : current,
      );
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.household(householdId) }),
        client.invalidateQueries({ queryKey: queryKeys.me }),
      ]);
    },
  });
}

export function useCreateInvitation(householdId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInvitationRequest) => createInvitation(householdId, body),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.invitations(householdId) }),
  });
}

export function useRevokeInvitation(householdId: string) {
  const client = useQueryClient();
  const key = queryKeys.invitations(householdId);
  return useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(householdId, invitationId),
    onMutate: async (invitationId) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<InvitationListResponse>(key);
      client.setQueryData<InvitationListResponse>(key, (current) =>
        current?.filter((invitation) => invitation.id !== invitationId),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}

/** Accepts an invitation and makes the joined household the active one. */
export function useAcceptInvitation(token: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: async ({ householdId }) => {
      await activateHousehold(client, householdId);
      void client.invalidateQueries({ queryKey: queryKeys.invitationPreview(token) });
    },
  });
}
