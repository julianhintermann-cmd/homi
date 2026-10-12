import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, UserRefSchema } from './common';
import { LIMITS } from './constants';
import { HOUSEHOLD_ROLE_VALUES, HouseholdRoleSchema } from './enums';

/*
 * Households, members and invitations (§5 "Households, members, invitations").
 */

export const HouseholdNameSchema = z
  .string({ error: 'Bitte gib einen Namen für den Haushalt ein.' })
  .trim()
  .min(LIMITS.householdName.min, { error: 'Bitte gib einen Namen für den Haushalt ein.' })
  .max(LIMITS.householdName.max, {
    error: `Der Name darf höchstens ${LIMITS.householdName.max} Zeichen lang sein.`,
  });

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

/** Public preview `GET /invitations/:token` (no member data). */
export const InvitationPreviewSchema = z.object({
  householdName: z.string(),
  inviterName: z.string().nullable(),
  role: InvitationRoleSchema,
  expiresAt: IsoDateTimeSchema,
  status: InvitationStatusSchema,
});
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>;

export const AcceptInvitationResponseSchema = z.object({ householdId: IdSchema });
export type AcceptInvitationResponse = z.infer<typeof AcceptInvitationResponseSchema>;
