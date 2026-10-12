import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common';
import { LIMITS } from './constants';
import { HouseholdRoleSchema } from './enums';

/*
 * Auth & account contract (§5 "Auth & account").
 */

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

export const EmailSchema = z
  .string({ error: 'Bitte gib deine E-Mail-Adresse ein.' })
  .trim()
  .toLowerCase()
  .min(1, { error: 'Bitte gib deine E-Mail-Adresse ein.' })
  .max(LIMITS.email.max, { error: 'Die E-Mail-Adresse ist zu lang.' })
  .pipe(z.email({ error: 'Bitte gib eine gültige E-Mail-Adresse ein.' }));

export const DisplayNameSchema = z
  .string({ error: 'Bitte gib deinen Namen ein.' })
  .trim()
  .min(LIMITS.displayName.min, { error: 'Bitte gib deinen Namen ein.' })
  .max(LIMITS.displayName.max, { error: `Der Name darf höchstens ${LIMITS.displayName.max} Zeichen lang sein.` });

/** Letters (any script). */
const LETTER = /\p{L}/u;
/** Anything that is neither a letter nor whitespace: digits, punctuation, symbols. */
const DIGIT_OR_SYMBOL = /[^\p{L}\s]/u;

export const PASSWORD_POLICY_HINT =
  'Mindestens 10 Zeichen, mit mindestens einem Buchstaben und einer Ziffer oder einem Sonderzeichen.';

/** Password policy (§4.2) without the "not equal to email" rule, which needs the email (see below). */
export const PasswordSchema = z
  .string({ error: 'Bitte gib ein Passwort ein.' })
  .min(LIMITS.password.min, { error: `Das Passwort muss mindestens ${LIMITS.password.min} Zeichen lang sein.` })
  .max(LIMITS.password.max, { error: `Das Passwort darf höchstens ${LIMITS.password.max} Zeichen lang sein.` })
  .refine((value) => LETTER.test(value), { error: 'Das Passwort muss mindestens einen Buchstaben enthalten.' })
  .refine((value) => DIGIT_OR_SYMBOL.test(value), {
    error: 'Das Passwort muss mindestens eine Ziffer oder ein Sonderzeichen enthalten.',
  });

export const PASSWORD_EQUALS_EMAIL_MESSAGE = 'Das Passwort darf nicht deiner E-Mail-Adresse entsprechen.';

/** True if the password equals the e-mail address (case-insensitive, trimmed). */
export function passwordEqualsEmail(password: string, email: string): boolean {
  return password.trim().toLowerCase() === email.trim().toLowerCase();
}

/** Login accepts any non-empty password: policy changes must never lock out existing users. */
const LoginPasswordSchema = z
  .string({ error: 'Bitte gib dein Passwort ein.' })
  .min(1, { error: 'Bitte gib dein Passwort ein.' })
  .max(LIMITS.password.max, { error: 'E-Mail oder Passwort ist falsch.' });

/** 32 random bytes, base64url (43 chars). Generous bounds so malformed links fail gracefully. */
export const OpaqueTokenSchema = z
  .string({ error: 'Der Link ist ungültig.' })
  .regex(/^[A-Za-z0-9_-]{20,128}$/, { error: 'Der Link ist ungültig.' });

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const RegisterRequestSchema = z
  .object({
    displayName: DisplayNameSchema,
    email: EmailSchema,
    password: PasswordSchema,
  })
  .superRefine((value, ctx) => {
    if (passwordEqualsEmail(value.password, value.email)) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: PASSWORD_EQUALS_EMAIL_MESSAGE });
    }
  });
export type RegisterRequest = z.input<typeof RegisterRequestSchema>;
export type RegisterInput = z.output<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: LoginPasswordSchema,
});
export type LoginRequest = z.input<typeof LoginRequestSchema>;
export type LoginInput = z.output<typeof LoginRequestSchema>;

export const PasswordResetRequestSchema = z.object({ email: EmailSchema });
export type PasswordResetRequest = z.input<typeof PasswordResetRequestSchema>;

/**
 * Password reset confirmation. The "not equal to email" rule is checked by the server,
 * which knows the account's email.
 */
export const PasswordResetConfirmSchema = z.object({
  token: OpaqueTokenSchema,
  password: PasswordSchema,
});
export type PasswordResetConfirmRequest = z.input<typeof PasswordResetConfirmSchema>;

export const UpdateProfileRequestSchema = z.object({ displayName: DisplayNameSchema });
export type UpdateProfileRequest = z.input<typeof UpdateProfileRequestSchema>;

export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: LoginPasswordSchema,
    newPassword: PasswordSchema,
  })
  .superRefine((value, ctx) => {
    if (value.currentPassword === value.newPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'Das neue Passwort muss sich vom aktuellen unterscheiden.',
      });
    }
  });
export type ChangePasswordRequest = z.input<typeof ChangePasswordRequestSchema>;

export const SetActiveHouseholdRequestSchema = z.object({ householdId: IdSchema });
export type SetActiveHouseholdRequest = z.input<typeof SetActiveHouseholdRequestSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const UserDtoSchema = z.object({
  id: IdSchema,
  displayName: z.string(),
  email: z.string(),
  createdAt: IsoDateTimeSchema,
});
export type UserDto = z.infer<typeof UserDtoSchema>;

/** Household membership as listed in `/auth/me` and `GET /households`. */
export const HouseholdSummarySchema = z.object({
  id: IdSchema,
  name: z.string(),
  role: HouseholdRoleSchema,
  memberCount: z.number().int().nonnegative(),
});
export type HouseholdSummary = z.infer<typeof HouseholdSummarySchema>;

export const MeResponseSchema = z.object({
  user: UserDtoSchema,
  households: z.array(HouseholdSummarySchema),
  activeHouseholdId: IdSchema.nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const AuthConfigResponseSchema = z.object({ passwordResetEnabled: z.boolean() });
export type AuthConfigResponse = z.infer<typeof AuthConfigResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  db: z.enum(['ok', 'down']),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
