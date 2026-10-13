import type {
  HouseholdDetail,
  HouseholdRole,
  HouseholdSummary,
  InvitationDto,
  InvitationRole,
  InvitationStatus,
  MemberDto,
} from '@homi/shared';
import type { Prisma } from '../../db';

/*
 * Row → DTO mappers for households, members and invitations (shapes in @homi/shared/households).
 */

export const memberDtoSelect = {
  userId: true,
  role: true,
  joinedAt: true,
  user: { select: { displayName: true } },
} as const satisfies Prisma.HouseholdMemberSelect;

export type MemberRow = Prisma.HouseholdMemberGetPayload<{ select: typeof memberDtoSelect }>;

/** Stable member order: join date (the creator first), then id. */
export const memberOrderBy: Prisma.HouseholdMemberOrderByWithRelationInput[] = [{ joinedAt: 'asc' }, { id: 'asc' }];

export function toMemberDto(row: MemberRow): MemberDto {
  return {
    userId: row.userId,
    displayName: row.user.displayName,
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
  };
}

export interface HouseholdDetailInput {
  household: { id: string; name: string; createdAt: Date };
  myRole: HouseholdRole;
  members: MemberRow[];
  itemCount: number;
}

export function toHouseholdDetail({ household, myRole, members, itemCount }: HouseholdDetailInput): HouseholdDetail {
  return {
    id: household.id,
    name: household.name,
    createdAt: household.createdAt.toISOString(),
    myRole,
    members: members.map(toMemberDto),
    stats: { itemCount },
  };
}

export const householdSummarySelect = {
  role: true,
  household: { select: { id: true, name: true, _count: { select: { members: true } } } },
} as const satisfies Prisma.HouseholdMemberSelect;

export type HouseholdSummaryRow = Prisma.HouseholdMemberGetPayload<{ select: typeof householdSummarySelect }>;

export function toHouseholdSummary(row: HouseholdSummaryRow): HouseholdSummary {
  return {
    id: row.household.id,
    name: row.household.name,
    role: row.role,
    memberCount: row.household._count.members,
  };
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export interface InvitationStateRow {
  expiresAt: Date;
  revokedAt: Date | null;
  acceptedAt: Date | null;
}

/** Precedence: revoked → used → expired → valid. */
export function invitationStatus(row: InvitationStateRow, now: Date = new Date()): InvitationStatus {
  if (row.revokedAt) return 'revoked';
  if (row.acceptedAt) return 'used';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}

/** Invitations can only carry MEMBER or ADMIN (enforced on creation); anything else degrades to MEMBER. */
export function toInvitationRole(role: HouseholdRole): InvitationRole {
  return role === 'ADMIN' ? 'ADMIN' : 'MEMBER';
}

export const invitationDtoSelect = {
  id: true,
  role: true,
  createdAt: true,
  expiresAt: true,
  createdBy: { select: { id: true, displayName: true } },
} as const satisfies Prisma.HouseholdInvitationSelect;

export type InvitationRow = Prisma.HouseholdInvitationGetPayload<{ select: typeof invitationDtoSelect }>;

export function toInvitationDto(row: InvitationRow): InvitationDto {
  return {
    id: row.id,
    role: toInvitationRole(row.role),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    createdBy: row.createdBy ? { id: row.createdBy.id, displayName: row.createdBy.displayName } : null,
  };
}
