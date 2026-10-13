import {
  MEMBER_ROLE_DESCRIPTIONS,
  MEMBER_ROLE_LABELS,
  canChangeMemberRole,
  canRemoveMember,
  roleAtLeast,
  type HouseholdDetail,
  type HouseholdRole,
  type MemberDto,
  type MemberPermissionContext,
} from '@homi/shared';

/*
 * Role wording and permission rules for the household screens. The rules mirror the server
 * (ARCHITECTURE §4.4); the server stays authoritative – the UI only hides what would be refused.
 *
 * Wording decision (design 09 shows "Verwaltung" for the creator): OWNER → "Inhaber:in",
 * ADMIN → "Verwaltung", MEMBER → "Mitglied" (see MEMBER_ROLE_LABELS in @homi/shared).
 */

export function roleLabel(role: HouseholdRole): string {
  return MEMBER_ROLE_LABELS[role];
}

export function roleDescription(role: HouseholdRole): string {
  return MEMBER_ROLE_DESCRIPTIONS[role];
}

/** Roles that can be offered when changing a member's role (owner view), highest first. */
export const ROLE_CHOICES: readonly HouseholdRole[] = ['OWNER', 'ADMIN', 'MEMBER'];

export function countOwners(members: readonly Pick<MemberDto, 'role'>[]): number {
  return members.filter((member) => member.role === 'OWNER').length;
}

export interface HouseholdPermissions {
  canRename: boolean;
  canInvite: boolean;
  canDelete: boolean;
  canChangeRoles: boolean;
  /** The current user is the only OWNER – leaving is blocked (409 LAST_OWNER). */
  isLastOwner: boolean;
  canLeave: boolean;
}

export function householdPermissions(detail: Pick<HouseholdDetail, 'myRole' | 'members'>): HouseholdPermissions {
  const isLastOwner = detail.myRole === 'OWNER' && countOwners(detail.members) <= 1;
  return {
    canRename: roleAtLeast(detail.myRole, 'ADMIN'),
    canInvite: roleAtLeast(detail.myRole, 'ADMIN'),
    canDelete: detail.myRole === 'OWNER',
    canChangeRoles: detail.myRole === 'OWNER',
    isLastOwner,
    canLeave: !isLastOwner,
  };
}

export interface MemberActions {
  isSelf: boolean;
  canRemove: boolean;
  /** Roles the current user may switch this member to (empty → no role change offered). */
  roleOptions: HouseholdRole[];
  /** The current user is the last OWNER: leaving is blocked (explain instead of offering it). */
  blockedByLastOwner: boolean;
}

export function memberActions(
  detail: Pick<HouseholdDetail, 'myRole' | 'members'>,
  meId: string,
  target: Pick<MemberDto, 'userId' | 'role'>,
): MemberActions {
  const ctx: MemberPermissionContext = {
    actorRole: detail.myRole,
    actorId: meId,
    ownerCount: countOwners(detail.members),
  };
  const isSelf = target.userId === meId;
  const canRemove = canRemoveMember(ctx, target);
  const roleOptions = ROLE_CHOICES.filter((role) => canChangeMemberRole(ctx, target, role));
  const blockedByLastOwner = isSelf && target.role === 'OWNER' && ctx.ownerCount <= 1;
  return { isSelf, canRemove, roleOptions, blockedByLastOwner };
}

/** Members for the list: the current user first ("Du", like design 09), then join order. */
export function sortMembersSelfFirst<T extends Pick<MemberDto, 'userId'>>(members: readonly T[], meId: string): T[] {
  const self = members.filter((member) => member.userId === meId);
  return [...self, ...members.filter((member) => member.userId !== meId)];
}

/** "1 Mitglied" / "3 Mitglieder". */
export function memberCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'Mitglied' : 'Mitglieder'}`;
}

/** "1 Artikel" / "128 Artikel" (same word in singular and plural). */
export function itemCountLabel(count: number, format: (value: number) => string = String): string {
  return `${format(count)} Artikel`;
}
