import type { HouseholdSummary, MeResponse } from '@homi/shared';
import type { Db } from '../../db';
import { AppError } from '../../lib/http-errors';

/**
 * `MeResponse` (§5 "Auth & account"): the user, all memberships (oldest first) with member counts,
 * and the active household = `User.lastHouseholdId` while still a member, else the first
 * membership, else `null`.
 */
export async function loadMe(db: Db, userId: string): Promise<MeResponse> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      email: true,
      createdAt: true,
      lastHouseholdId: true,
      memberships: {
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        select: {
          role: true,
          household: { select: { id: true, name: true, _count: { select: { members: true } } } },
        },
      },
    },
  });
  // The session outlived its user (deleted concurrently): treat as logged out.
  if (!user) throw new AppError('UNAUTHORIZED');

  const households: HouseholdSummary[] = user.memberships.map((membership) => ({
    id: membership.household.id,
    name: membership.household.name,
    role: membership.role,
    memberCount: membership.household._count.members,
  }));

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    },
    households,
    activeHouseholdId: resolveActiveHouseholdId(user.lastHouseholdId, households),
  };
}

/** `lastHouseholdId` if it is still a membership, otherwise the first membership, otherwise `null`. */
export function resolveActiveHouseholdId(
  lastHouseholdId: string | null,
  households: ReadonlyArray<Pick<HouseholdSummary, 'id'>>,
): string | null {
  if (lastHouseholdId && households.some((household) => household.id === lastHouseholdId)) return lastHouseholdId;
  return households[0]?.id ?? null;
}
