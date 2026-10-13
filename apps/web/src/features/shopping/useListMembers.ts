import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHousehold } from '@/api/households';
import { queryKeys } from '@/api/queryKeys';
import type { AvatarStackPerson } from '@/components';

/**
 * Members sharing the list, for the avatar stack (signed-in user first, then in join order).
 * Reads the household detail (`['household', hid]`, shared with the household screens); while it
 * is unavailable the meta row simply shows no avatars.
 */
export function useListMembers(householdId: string, selfId: string | undefined): AvatarStackPerson[] {
  const { data } = useQuery({
    queryKey: queryKeys.household(householdId),
    queryFn: ({ signal }) => fetchHousehold(householdId, signal),
    staleTime: 60_000,
  });
  return useMemo(() => {
    const members = data?.members ?? [];
    const people = members.map((member) => ({
      id: member.userId,
      name: member.displayName,
      self: member.userId === selfId,
    }));
    return [...people.filter((person) => person.self), ...people.filter((person) => !person.self)];
  }, [data, selfId]);
}
