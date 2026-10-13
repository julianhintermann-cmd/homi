import { toValidationDetails } from '@homi/shared';
import { isApiError } from '@/api/client';

/**
 * Form validation helpers shared by the auth and account forms: client-side checks reuse the
 * zod request schemas of `@homi/shared` (same German messages as the server), server errors are
 * mapped back onto the fields they belong to.
 */

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Structural subset of a zod schema (keeps `zod` itself out of the web imports). */
export interface SafeParseSchema {
  safeParse(
    value: unknown,
  ):
    | { success: true }
    | { success: false; error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> } };
}

/** First message per field (`{}` when valid); `K` names the fields the form displays. */
export function validateFields<K extends string>(
  schema: SafeParseSchema,
  values: Readonly<Record<string, unknown>>,
): FieldErrors<K> {
  const result = schema.safeParse(values);
  if (result.success) return {};
  return toValidationDetails(result.error).fieldErrors as FieldErrors<K>;
}

export function hasErrors<K extends string>(errors: FieldErrors<K>): boolean {
  return Object.values(errors).some(Boolean);
}

/** The first field (in form order) that has an error – it receives the focus after submitting. */
export function firstInvalidField<K extends string>(fields: readonly K[], errors: FieldErrors<K>): K | undefined {
  return fields.find((field) => Boolean(errors[field]));
}

export interface SubmitErrors<K extends string> {
  fieldErrors: FieldErrors<K>;
  /** Message without a field (wrong credentials, rate limit, network …), shown above the button. */
  formError: string | null;
}

/**
 * Maps a failed request onto the form: `VALIDATION` details go to their fields, error codes listed
 * in `fieldForCode` (e.g. `EMAIL_TAKEN → email`) to that field, everything else becomes the form
 * message (the server's German message, or the client's network/fallback message).
 */
export function mapSubmitError<K extends string>(
  error: unknown,
  fields: readonly K[],
  fieldForCode: Readonly<Partial<Record<string, K>>> = {},
): SubmitErrors<K> {
  if (!isApiError(error)) {
    return { fieldErrors: {}, formError: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.' };
  }

  const codeField = fieldForCode[error.code];
  if (codeField) return { fieldErrors: { [codeField]: error.message } as FieldErrors<K>, formError: null };

  if (error.code === 'VALIDATION' && isValidationDetails(error.details)) {
    const fieldErrors: FieldErrors<K> = {};
    const unmatched: string[] = [...error.details.formErrors];
    for (const [path, message] of Object.entries(error.details.fieldErrors)) {
      const field = fields.find((candidate) => candidate === path);
      if (field) fieldErrors[field] = message;
      else unmatched.push(message);
    }
    if (hasErrors(fieldErrors)) return { fieldErrors, formError: unmatched[0] ?? null };
    return { fieldErrors, formError: unmatched[0] ?? error.message };
  }

  return { fieldErrors: {}, formError: error.message };
}

function isValidationDetails(value: unknown): value is { fieldErrors: Record<string, string>; formErrors: string[] } {
  if (typeof value !== 'object' || value === null) return false;
  const { fieldErrors, formErrors } = value as Record<string, unknown>;
  return (
    typeof fieldErrors === 'object' &&
    fieldErrors !== null &&
    Object.values(fieldErrors).every((message) => typeof message === 'string') &&
    Array.isArray(formErrors) &&
    formErrors.every((message) => typeof message === 'string')
  );
}
