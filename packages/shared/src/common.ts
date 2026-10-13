import { z } from 'zod';
import { LIMITS } from './constants';
import {
  compareDecimals,
  decimalScale,
  isZeroDecimal,
  normalizeDecimalInput,
  toFixedDecimal,
  trimDecimal,
} from './decimal';
import { INVALID_TEXT_CHARACTERS_MESSAGE, hasControlCharacter } from './text';

/*
 * Primitive schemas reused by the feature contracts.
 */

export const IdSchema = z.uuid({ error: 'Ungültige ID.' });

/** ISO-8601 timestamp as sent by the API (`Date#toISOString()`). */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true, error: 'Ungültiges Datum.' });

/** Minimal user reference embedded in DTOs. */
export const UserRefSchema = z.object({
  id: IdSchema,
  displayName: z.string(),
});
export type UserRef = z.infer<typeof UserRefSchema>;

/** Member reference used in household/conversation member lists. */
export const MemberRefSchema = z.object({
  userId: IdSchema,
  displayName: z.string(),
});
export type MemberRef = z.infer<typeof MemberRefSchema>;

// ---------------------------------------------------------------------------
// Decimal strings in DTOs (server → client)
// ---------------------------------------------------------------------------

/** CHF amount with exactly two decimals, may be negative (`"8.50"`, `"-12.30"`). */
export const MoneyStringSchema = z.string().regex(/^-?\d+\.\d{2}$/, { error: 'Ungültiger Betrag.' });
/** Non-negative quantity without insignificant zeros (`"3"`, `"1.5"`, `"0.25"`). */
export const QuantityStringSchema = z.string().regex(/^\d+(\.\d{0,2}[1-9])?$/, { error: 'Ungültige Menge.' });
/** Message sequence number (Postgres BIGINT) as string. */
export const SeqStringSchema = z.string().regex(/^\d{1,19}$/, { error: 'Ungültige Sequenznummer.' });

// ---------------------------------------------------------------------------
// Decimal inputs (client → server)
// ---------------------------------------------------------------------------

interface DecimalInputOptions {
  scale: number;
  max: string;
  allowNegative: boolean;
  nonZero: boolean;
  output: 'fixed' | 'trimmed';
  messages: {
    invalid: string;
    scale: string;
    negative: string;
    max: string;
    zero?: string;
  };
}

/**
 * Builds a schema that accepts user-friendly decimal input ("8,50", "1’250", " 2 ") and outputs
 * a canonical decimal string. Usable for client-side form validation and on the server.
 */
function decimalInput(options: DecimalInputOptions) {
  return z.string({ error: options.messages.invalid }).transform((raw, ctx) => {
    const normalized = normalizeDecimalInput(raw);
    if (normalized === null) {
      ctx.addIssue({ code: 'custom', message: options.messages.invalid });
      return z.NEVER;
    }
    if (decimalScale(normalized) > options.scale) {
      ctx.addIssue({ code: 'custom', message: options.messages.scale });
      return z.NEVER;
    }
    if (!options.allowNegative && normalized.startsWith('-')) {
      ctx.addIssue({ code: 'custom', message: options.messages.negative });
      return z.NEVER;
    }
    const magnitude = normalized.startsWith('-') ? normalized.slice(1) : normalized;
    if (compareDecimals(magnitude, options.max) > 0) {
      ctx.addIssue({ code: 'custom', message: options.messages.max });
      return z.NEVER;
    }
    if (options.nonZero && isZeroDecimal(normalized)) {
      ctx.addIssue({ code: 'custom', message: options.messages.zero ?? options.messages.invalid });
      return z.NEVER;
    }
    return options.output === 'fixed' ? toFixedDecimal(normalized, options.scale) : trimDecimal(normalized);
  });
}

/** Unit price in CHF: 0 … 99’999.99, max. 2 decimals → `"8.50"`. */
export const MoneyInputSchema = decimalInput({
  scale: LIMITS.unitPrice.scale,
  max: LIMITS.unitPrice.max,
  allowNegative: false,
  nonZero: false,
  output: 'fixed',
  messages: {
    invalid: 'Bitte gib einen gültigen Preis ein.',
    scale: 'Der Preis darf höchstens 2 Nachkommastellen haben.',
    negative: 'Der Preis darf nicht negativ sein.',
    max: 'Der Preis darf höchstens CHF 99’999.99 betragen.',
  },
});

/** Quantity: 0 … 99’999.999, max. 3 decimals → `"1.5"`. */
export const QuantityInputSchema = decimalInput({
  scale: LIMITS.quantity.scale,
  max: LIMITS.quantity.max,
  allowNegative: false,
  nonZero: false,
  output: 'trimmed',
  messages: {
    invalid: 'Bitte gib eine gültige Menge ein.',
    scale: 'Die Menge darf höchstens 3 Nachkommastellen haben.',
    negative: 'Die Menge darf nicht negativ sein.',
    max: 'Die Menge ist zu gross.',
  },
});

/** Signed, non-zero quantity change → `"-1"`, `"0.5"`. */
export const QuantityDeltaSchema = decimalInput({
  scale: LIMITS.quantity.scale,
  max: LIMITS.quantity.max,
  allowNegative: true,
  nonZero: true,
  output: 'trimmed',
  messages: {
    invalid: 'Bitte gib eine gültige Mengenänderung ein.',
    scale: 'Die Mengenänderung darf höchstens 3 Nachkommastellen haben.',
    negative: 'Die Mengenänderung ist ungültig.',
    max: 'Die Mengenänderung ist zu gross.',
    zero: 'Die Mengenänderung darf nicht 0 sein.',
  },
});

/** Optional free-text query parameter: trimmed, no control characters, empty → undefined. */
export function optionalQueryString(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Bitte höchstens ${max} Zeichen eingeben.` })
    .refine((value) => !hasControlCharacter(value), { error: INVALID_TEXT_CHARACTERS_MESSAGE })
    .optional()
    .transform((value) => (value === undefined || value.length === 0 ? undefined : value));
}

/** Page size query parameter (string from the URL → integer). */
export function pageLimitSchema(defaultValue: number, max: number) {
  return z.coerce
    .number({ error: 'Ungültige Seitengrösse.' })
    .int({ error: 'Ungültige Seitengrösse.' })
    .min(1, { error: 'Ungültige Seitengrösse.' })
    .max(max, { error: `Höchstens ${max} Einträge pro Seite.` })
    .default(defaultValue);
}

/** `{ ok: true }`-style empty acknowledgement used by some endpoints/events. */
export const OkResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponseSchema>;
