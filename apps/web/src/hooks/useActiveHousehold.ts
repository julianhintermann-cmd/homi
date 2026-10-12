import { useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { HouseholdSummary, MeResponse } from '@homi/shared';
import { setActiveHousehold } from '@/api/account';
import { queryKeys } from '@/api/queryKeys';
import { useMe } from './useAuth';

/** Optimistic local selection while `PUT /api/account/active-household` is in flight. */
interface ActiveHouseholdUiState {
  pendingHouseholdId: string | null;
  setPendingHouseholdId: (householdId: string | null) => void;
}

export const useActiveHouseholdUiStore = create<ActiveHouseholdUiState>()((set) => ({
  pendingHouseholdId: null,
  setPendingHouseholdId: (pendingHouseholdId) => set({ pendingHouseholdId }),
}));

/**
 * Active household resolution: optimistic selection → `me.activeHouseholdId` → first
 * membership. Ids that are no longer memberships (e.g. just removed) are ignored.
 */
export function resolveActiveHouseholdId(
  me: Pick<MeResponse, 'households' | 'activeHouseholdId'> | null | undefined,
  pendingHouseholdId: string | null,
): string | null {
  if (!me || me.households.length === 0) return null;
  const isMember = (id: string | null): id is string => id !== null && me.households.some((h) => h.id === id);
  if (isMember(pendingHouseholdId)) return pendingHouseholdId;
  if (isMember(me.activeHouseholdId)) return me.activeHouseholdId;
  return me.households[0]?.id ?? null;
}

export interface ActiveHousehold {
  householdId: string | null;
  household: HouseholdSummary | null;
  households: readonly HouseholdSummary[];
  /** Switches the active household (optimistic; persisted server-side). */
  switchHousehold: (householdId: string) => Promise<void>;
  isSwitching: boolean;
  switchError: Error | null;
}

export function useActiveHousehold(): ActiveHousehold {
  const client = useQueryClient();
  const { data: me } = useMe();
  const pendingHouseholdId = useActiveHouseholdUiStore((s) => s.pendingHouseholdId);
  const householdId = resolveActiveHouseholdId(me, pendingHouseholdId);
  const households = me?.households ?? [];

  const mutation = useMutation({
    mutationFn: (id: string) => setActiveHousehold(id),
    onMutate: (id) => {
      useActiveHouseholdUiStore.getState().setPendingHouseholdId(id);
    },
    onSuccess: (_result, id) => {
      client.setQueryData<MeResponse | null>(queryKeys.me, (current) =>
        current ? { ...current, activeHouseholdId: id } : current,
      );
    },
    onSettled: (_result, _error, id) => {
      // Only the latest switch clears the optimistic value (rapid A → B → C).
      const store = useActiveHouseholdUiStore.getState();
      if (store.pendingHouseholdId === id) store.setPendingHouseholdId(null);
    },
  });

  return {
    householdId,
    household: households.find((h) => h.id === householdId) ?? null,
    households,
    switchHousehold: async (id: string) => {
      await mutation.mutateAsync(id);
    },
    isSwitching: mutation.isPending,
    switchError: mutation.error,
  };
}

/**
 * Active household id for screens below the `RequireHousehold` guard, where it always exists.
 * Throws otherwise (programming error: used outside the guard).
 */
export function useRequiredHouseholdId(): string {
  const { data: me } = useMe();
  const pendingHouseholdId = useActiveHouseholdUiStore((s) => s.pendingHouseholdId);
  const householdId = resolveActiveHouseholdId(me, pendingHouseholdId);
  if (!householdId) throw new Error('useRequiredHouseholdId() used outside of <RequireHousehold>.');
  return householdId;
}
