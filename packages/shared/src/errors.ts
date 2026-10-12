import { z } from 'zod';

/**
 * Machine-readable error codes of the `{ error: { code, message, details? } }` envelope (§4.6),
 * with their HTTP status and the default German user message.
 */
export const API_ERRORS = {
  VALIDATION: { status: 400, message: 'Bitte überprüfe deine Eingaben.' },
  BAD_REQUEST: { status: 400, message: 'Die Anfrage ist ungültig.' },
  UNAUTHORIZED: { status: 401, message: 'Bitte melde dich an.' },
  INVALID_CREDENTIALS: { status: 401, message: 'E-Mail oder Passwort ist falsch.' },
  WRONG_PASSWORD: { status: 400, message: 'Das aktuelle Passwort ist falsch.' },
  FORBIDDEN: { status: 403, message: 'Dafür fehlt dir die Berechtigung.' },
  CSRF: { status: 403, message: 'Die Anfrage wurde aus Sicherheitsgründen abgelehnt.' },
  NOT_FOUND: { status: 404, message: 'Nicht gefunden.' },
  CONFLICT: { status: 409, message: 'Das ist bereits vorhanden.' },
  EMAIL_TAKEN: { status: 409, message: 'Für diese E-Mail-Adresse existiert bereits ein Konto.' },
  VERSION_CONFLICT: {
    status: 409,
    message: 'Der Eintrag wurde inzwischen von jemand anderem geändert. Bitte lade ihn neu.',
  },
  LAST_OWNER: {
    status: 409,
    message: 'Der letzte Inhaber kann den Haushalt nicht verlassen und nicht herabgestuft werden.',
  },
  ALREADY_MEMBER: { status: 409, message: 'Du bist bereits Mitglied dieses Haushalts.' },
  IMAGE_IN_USE: { status: 409, message: 'Das Bild wird noch verwendet.' },
  INVALID_TOKEN: { status: 400, message: 'Der Link ist ungültig oder abgelaufen.' },
  INVITATION_INVALID: { status: 410, message: 'Diese Einladung ist nicht mehr gültig.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Die Datei ist zu gross.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'Dieses Dateiformat wird nicht unterstützt.' },
  IMAGE_INVALID: { status: 422, message: 'Das Bild konnte nicht verarbeitet werden.' },
  RATE_LIMITED: { status: 429, message: 'Zu viele Anfragen. Bitte versuche es gleich nochmals.' },
  MAIL_DISABLED: { status: 503, message: 'Das Zurücksetzen per E-Mail ist auf diesem Server nicht eingerichtet.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'Der Dienst ist vorübergehend nicht erreichbar.' },
  INTERNAL: { status: 500, message: 'Ein unerwarteter Fehler ist aufgetreten.' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ApiErrorCode = keyof typeof API_ERRORS;
export const API_ERROR_CODES = Object.keys(API_ERRORS) as ApiErrorCode[];
export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES as [ApiErrorCode, ...ApiErrorCode[]]);

/** `details` of a `VALIDATION` error: first message per field path (dot-joined) plus form-level messages. */
export const ValidationErrorDetailsSchema = z.object({
  fieldErrors: z.record(z.string(), z.string()),
  formErrors: z.array(z.string()),
});
export type ValidationErrorDetails = z.infer<typeof ValidationErrorDetailsSchema>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return ApiErrorBodySchema.safeParse(value).success;
}

/**
 * Converts zod issues into {@link ValidationErrorDetails}. Works with any object exposing
 * `issues` (zod 4 `ZodError`), so client-side form validation can reuse it.
 */
export function toValidationDetails(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): ValidationErrorDetails {
  const fieldErrors: Record<string, string> = {};
  const formErrors: string[] = [];
  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      formErrors.push(issue.message);
      continue;
    }
    const key = issue.path.map((segment) => String(segment)).join('.');
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return { fieldErrors, formErrors };
}
