import { z } from 'zod';
import { HouseholdSummarySchema, OpaqueTokenSchema } from './auth';
import { IdSchema, IsoDateTimeSchema, UserRefSchema } from './common';
import { LIMITS } from './constants';
import { HOUSEHOLD_ROLE_LABELS, HOUSEHOLD_ROLE_VALUES, HouseholdRoleSchema, type HouseholdRole } from './enums';
import { hasForbiddenNameCharacters, hasVisibleNameCharacter } from './text';

/*
 * Households, members and invitations (§5 "Households, members, invitations").
 */

export const HouseholdNameSchema = z
  .string({ error: 'Bitte gib einen Namen für den Haushalt ein.' })
  .trim()
  .min(LIMITS.householdName.min, { error: 'Bitte gib einen Namen für den Haushalt ein.' })
  .max(LIMITS.householdName.max, {
    error: `Der Name darf höchstens ${LIMITS.householdName.max} Zeichen lang sein.`,
  })
  // Shown to every member and in the public invitation preview: no control/bidi characters, not blank.
  .refine((value) => !hasForbiddenNameCharacters(value), { error: 'Der Name enthält ungültige Zeichen.' })
  .refine(hasVisibleNameCharacter, { error: 'Bitte gib einen Namen für den Haushalt ein.' });

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const CreateHouseholdRequestSchema = z.object({ name: HouseholdNameSchema });
export type CreateHouseholdRequest = z.input<typeof CreateHouseholdRequestSchema>;

export const RenameHouseholdRequestSchema = z.object({ name: HouseholdNameSchema });
export type RenameHouseholdRequest = z.input<typeof RenameHouseholdRequestSchema>;

export const ChangeMemberRoleRequestSchema = z.object({
  role: z.enum(HOUSEHOLD_ROLE_VALUES, { error: 'Bitte wähle eine gültige Rolle.' }),
});
export type ChangeMemberRoleRequest = z.input<typeof ChangeMemberRoleRequestSchema>;

/** Roles that can be granted through an invitation (never OWNER). */
export const InvitationRoleSchema = z.enum(['MEMBER', 'ADMIN'], { error: 'Bitte wähle eine gültige Rolle.' });
export type InvitationRole = z.infer<typeof InvitationRoleSchema>;

export const CreateInvitationRequestSchema = z.object({
  role: InvitationRoleSchema.default('MEMBER'),
  expiresInDays: z
    .number({ error: 'Bitte gib eine gültige Gültigkeitsdauer an.' })
    .int({ error: 'Bitte gib eine ganze Zahl von Tagen an.' })
    .min(LIMITS.invitationExpiresInDays.min, {
      error: `Die Einladung muss mindestens ${LIMITS.invitationExpiresInDays.min} Tag gültig sein.`,
    })
    .max(LIMITS.invitationExpiresInDays.max, {
      error: `Die Einladung darf höchstens ${LIMITS.invitationExpiresInDays.max} Tage gültig sein.`,
    })
    .default(LIMITS.invitationExpiresInDays.default),
});
export type CreateInvitationRequest = z.input<typeof CreateInvitationRequestSchema>;

/** Route params `/households/:householdId/...` */
export const HouseholdParamsSchema = z.object({ householdId: IdSchema });
export const MemberParamsSchema = z.object({ householdId: IdSchema, userId: IdSchema });
export const InvitationIdParamsSchema = z.object({ householdId: IdSchema, invitationId: IdSchema });
/** Route params of the public `/invitations/:token` endpoints (raw token from the link). */
export const InvitationTokenParamsSchema = z.object({ token: OpaqueTokenSchema });

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const MemberDtoSchema = z.object({
  userId: IdSchema,
  displayName: z.string(),
  role: HouseholdRoleSchema,
  joinedAt: IsoDateTimeSchema,
});
export type MemberDto = z.infer<typeof MemberDtoSchema>;

export const HouseholdDetailSchema = z.object({
  id: IdSchema,
  name: z.string(),
  createdAt: IsoDateTimeSchema,
  myRole: HouseholdRoleSchema,
  members: z.array(MemberDtoSchema),
  stats: z.object({ itemCount: z.number().int().nonnegative() }),
});
export type HouseholdDetail = z.infer<typeof HouseholdDetailSchema>;

/** Active invitation as listed for admins. The raw token is never returned again. */
export const InvitationDtoSchema = z.object({
  id: IdSchema,
  role: InvitationRoleSchema,
  createdAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  createdBy: UserRefSchema.nullable(),
});
export type InvitationDto = z.infer<typeof InvitationDtoSchema>;

/** Response of `POST /households/:hid/invitations` – `url` contains the raw token, returned only once. */
export const CreatedInvitationSchema = z.object({
  id: IdSchema,
  url: z.string(),
  expiresAt: IsoDateTimeSchema,
  role: InvitationRoleSchema,
});
export type CreatedInvitation = z.infer<typeof CreatedInvitationSchema>;

export const INVITATION_STATUS_VALUES = ['valid', 'expired', 'revoked', 'used'] as const;
export const InvitationStatusSchema = z.enum(INVITATION_STATUS_VALUES);
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;

/**
 * Public preview `GET /invitations/:token` (no member data). `householdName` and `inviterName` are
 * only disclosed while the link is `valid` (null otherwise): a used, revoked or expired link must
 * not keep revealing the household's current name to whoever once saw it. `inviterName` is also
 * null when the inviter's account was deleted.
 */
export const InvitationPreviewSchema = z.object({
  householdName: z.string().nullable(),
  inviterName: z.string().nullable(),
  role: InvitationRoleSchema,
  expiresAt: IsoDateTimeSchema,
  status: InvitationStatusSchema,
});
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>;

export const AcceptInvitationResponseSchema = z.object({ householdId: IdSchema });
export type AcceptInvitationResponse = z.infer<typeof AcceptInvitationResponseSchema>;

/** `GET /households` – memberships of the current user (same shape as in `/auth/me`). */
export const HouseholdListResponseSchema = z.array(HouseholdSummarySchema);
export type HouseholdListResponse = z.infer<typeof HouseholdListResponseSchema>;

/** `GET /households/:hid/invitations` – active invitations, newest first. */
export const InvitationListResponseSchema = z.array(InvitationDtoSchema);
export type InvitationListResponse = z.infer<typeof InvitationListResponseSchema>;

// ---------------------------------------------------------------------------
// Role wording & permission rules (§4.4) – shared so server and UI agree
// ---------------------------------------------------------------------------

/**
 * Role labels shown in the UI (member rows, member detail, invitations).
 *
 * Decision (FIDELITY 09 open point): the design labels the household creator "Verwaltung" and
 * everybody else "Mitglied", but the contract has three roles. The creator is OWNER, so:
 * OWNER → "Inhaber:in" (gender-neutral, Swiss usage), ADMIN → "Verwaltung" (the design's word for
 * members who manage the household), MEMBER → "Mitglied".
 */
export const MEMBER_ROLE_LABELS: Readonly<Record<HouseholdRole, string>> = HOUSEHOLD_ROLE_LABELS;

/** Short explanation of what a role may do (role picker, invitation sheet). */
export const MEMBER_ROLE_DESCRIPTIONS: Readonly<Record<HouseholdRole, string>> = {
  OWNER: 'Kann alles, auch Rollen ändern und den Haushalt löschen.',
  ADMIN: 'Kann den Haushalt umbenennen, Mitglieder einladen und Mitglieder entfernen.',
  MEMBER: 'Kann Inventar, Einkaufsliste und Chats nutzen.',
};

export interface MemberPermissionContext {
  /** Role of the acting user. */
  actorRole: HouseholdRole;
  actorId: string;
  /** Number of OWNERs in the household (last-owner rule). */
  ownerCount: number;
}

export interface MemberRoleRef {
  userId: string;
  role: HouseholdRole;
}

/**
 * May the actor remove `target` from the household (or leave, when `target` is the actor)?
 * Mirrors the server rules: everybody may leave except the last OWNER; ADMIN removes MEMBERs;
 * OWNER removes anyone but the last OWNER.
 */
export function canRemoveMember(ctx: MemberPermissionContext, target: MemberRoleRef): boolean {
  if (target.role === 'OWNER' && ctx.ownerCount <= 1) return false;
  if (target.userId === ctx.actorId) return true;
  if (ctx.actorRole === 'OWNER') return true;
  if (ctx.actorRole === 'ADMIN') return target.role === 'MEMBER';
  return false;
}

/** Only OWNERs change roles; the last OWNER cannot be demoted. */
export function canChangeMemberRole(
  ctx: MemberPermissionContext,
  target: MemberRoleRef,
  nextRole: HouseholdRole,
): boolean {
  if (ctx.actorRole !== 'OWNER') return false;
  if (target.role === nextRole) return false;
  return !(target.role === 'OWNER' && nextRole !== 'OWNER' && ctx.ownerCount <= 1);
}
