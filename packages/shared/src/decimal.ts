/**
 * Exact decimal-string arithmetic (money, quantities) without JavaScript floats.
 *
 * Values travel through the API as plain decimal strings (`"8.50"`, `"1.5"`, `"-12.30"`).
 * Arithmetic converts them to scaled `bigint`s ("units" of 10^-scale), computes exactly and
 * rounds half away from zero (commercial rounding) only when a result scale is requested.
 */

export class DecimalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecimalError';
  }
}

/** Canonical decimal syntax accepted by all helpers: optional sign, digits, optional fraction. */
const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

/** Guard against absurdly long inputs that would create huge bigints. */
const MAX_INPUT_LENGTH = 64;

interface Parsed {
  /** value × 10^scale */
  readonly units: bigint;
  readonly scale: number;
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function parse(value: string): Parsed | null {
  if (value.length === 0 || value.length > MAX_INPUT_LENGTH) return null;
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) return null;
  const sign = match[1] === '-' ? -1n : 1n;
  const integerPart = match[2] ?? '0';
  const fractionPart = match[3] ?? '';
  return { units: sign * BigInt(integerPart + fractionPart), scale: fractionPart.length };
}

function parseOrThrow(value: string): Parsed {
  const parsed = parse(value);
  if (!parsed) throw new DecimalError(`Invalid decimal string: "${value}"`);
  return parsed;
}

/** Re-scales `units` from one scale to another, rounding half away from zero when reducing. */
function rescale(units: bigint, from: number, to: number): bigint {
  if (to === from) return units;
  if (to > from) return units * pow10(to - from);
  const divisor = pow10(from - to);
  const quotient = units / divisor; // truncates toward zero
  const remainder = units % divisor;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  if (absRemainder * 2n >= divisor) {
    return quotient + (units < 0n ? -1n : 1n);
  }
  return quotient;
}

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 20) {
    throw new DecimalError(`Invalid scale: ${scale}`);
  }
}

// ---------------------------------------------------------------------------
// Validation & normalisation
// ---------------------------------------------------------------------------

export interface DecimalRules {
  /** Maximum number of fraction digits (default: unlimited). */
  maxScale?: number;
  /** Allow a leading minus sign (default: false). */
  allowNegative?: boolean;
  /** Inclusive lower bound as decimal string. */
  min?: string;
  /** Inclusive upper bound as decimal string. */
  max?: string;
}

/** True when `value` is a canonical decimal string that satisfies `rules`. */
export function isDecimalString(value: unknown, rules: DecimalRules = {}): value is string {
  if (typeof value !== 'string') return false;
  const parsed = parse(value);
  if (!parsed) return false;
  if (rules.maxScale !== undefined && parsed.scale > rules.maxScale) return false;
  if (!rules.allowNegative && value.startsWith('-')) return false;
  if (rules.min !== undefined && compareDecimals(value, rules.min) < 0) return false;
  if (rules.max !== undefined && compareDecimals(value, rules.max) > 0) return false;
  return true;
}

/** Number of fraction digits of a canonical decimal string. */
export function decimalScale(value: string): number {
  return parseOrThrow(value).scale;
}

/**
 * Normalises user input (e.g. from a price field) into canonical decimal syntax.
 * Accepts `,` as decimal separator, Swiss group separators (’ ' and spaces), a leading `+`,
 * `.5` and `5.`. Returns `null` when the input is not a number.
 *
 *   "8,50" → "8.50", "1’250.5" → "1250.5", " .5 " → "0.5", "abc" → null
 */
export function normalizeDecimalInput(input: string): string | null {
  let text = input.trim().replace(/[\s\u00A0\u202F\u2009\u0027\u2018\u2019\u0060\u00B4]/g, '');
  if (text.length === 0 || text.length > MAX_INPUT_LENGTH) return null;
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) return null;
  if (hasComma) text = text.replace(',', '.');
  if (text.includes(',')) return null;

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) return null;
  const sign = match[1] === '-' ? '-' : '';
  const integerDigits = match[2] ?? '';
  const fractionDigits = match[3] ?? '';
  if (integerDigits.length === 0 && fractionDigits.length === 0) return null;

  const integerPart = integerDigits.replace(/^0+(?=\d)/, '') || '0';
  const result = fractionDigits.length > 0 ? `${integerPart}.${fractionDigits}` : integerPart;
  return sign && !/^0(\.0*)?$/.test(result) ? `-${result}` : result;
}

/**
 * Converts a finite JS number into a decimal string with at most `maxScale` fraction digits.
 * Intended only for values that originate as numbers in the UI (e.g. a stepper), never for money.
 */
export function numberToDecimalString(value: number, maxScale = 3): string {
  if (!Number.isFinite(value)) throw new DecimalError(`Not a finite number: ${value}`);
  assertScale(maxScale);
  return trimDecimal(value.toFixed(maxScale));
}

// ---------------------------------------------------------------------------
// Scaled bigint conversion
// ---------------------------------------------------------------------------

/**
 * Converts a decimal string into scaled units (`"8.50"`, 2 → `850n`).
 * `mode: "exact"` throws if the value has more fraction digits than `scale`;
 * `mode: "round"` (default) rounds half away from zero.
 */
export function toScaled(value: string, scale: number, mode: 'exact' | 'round' = 'round'): bigint {
  assertScale(scale);
  const parsed = parseOrThrow(value);
  if (mode === 'exact' && parsed.scale > scale) {
    throw new DecimalError(`"${value}" has more than ${scale} fraction digits`);
  }
  return rescale(parsed.units, parsed.scale, scale);
}

/** Converts scaled units back into a fixed-scale decimal string (`850n`, 2 → `"8.50"`). */
export function fromScaled(units: bigint, scale: number): string {
  assertScale(scale);
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const integerPart = scale === 0 ? digits : digits.slice(0, -scale);
  const fractionPart = scale === 0 ? '' : digits.slice(-scale);
  const body = fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
  return negative && units !== 0n ? `-${body}` : body;
}

// ---------------------------------------------------------------------------
// Formatting helpers on canonical strings
// ---------------------------------------------------------------------------

/** Rounds (half away from zero) and pads to exactly `scale` fraction digits: `("8.5", 2)` → `"8.50"`. */
export function toFixedDecimal(value: string, scale: number): string {
  return fromScaled(toScaled(value, scale), scale);
}

/** Removes insignificant zeros: `"3.000"` → `"3"`, `"1.500"` → `"1.5"`, `"-0.00"` → `"0"`. */
export function trimDecimal(value: string): string {
  const parsed = parseOrThrow(value);
  let { units, scale } = parsed;
  while (scale > 0 && units % 10n === 0n) {
    units /= 10n;
    scale -= 1;
  }
  return fromScaled(units, scale);
}

/** Canonical CHF amount with exactly two decimals. */
export function toMoneyString(value: string): string {
  return toFixedDecimal(value, 2);
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

function commonScale(parsed: readonly Parsed[], resultScale: number): number {
  return parsed.reduce((max, p) => Math.max(max, p.scale), resultScale);
}

/** Exact sum of all values, rounded to `scale` fraction digits (default 2). */
export function sumDecimals(values: readonly string[], scale = 2): string {
  assertScale(scale);
  const parsed = values.map(parseOrThrow);
  const working = commonScale(parsed, scale);
  const total = parsed.reduce((acc, p) => acc + rescale(p.units, p.scale, working), 0n);
  return fromScaled(rescale(total, working, scale), scale);
}

/** `a + b`, rounded to `scale` fraction digits (default 2). */
export function addDecimals(a: string, b: string, scale = 2): string {
  return sumDecimals([a, b], scale);
}

/** `a - b`, rounded to `scale` fraction digits (default 2). */
export function subtractDecimals(a: string, b: string, scale = 2): string {
  return sumDecimals([a, negateDecimal(b)], scale);
}

/** Exact product `a × b`, rounded to `scale` fraction digits (default 2). */
export function multiplyDecimals(a: string, b: string, scale = 2): string {
  assertScale(scale);
  const left = parseOrThrow(a);
  const right = parseOrThrow(b);
  const product = left.units * right.units;
  return fromScaled(rescale(product, left.scale + right.scale, scale), scale);
}

/** Total value of an inventory line: `quantity × unitPrice` in CHF (2 decimals), `null` if the price is unknown. */
export function lineTotal(quantity: string, unitPrice: string | null | undefined): string | null {
  if (unitPrice === null || unitPrice === undefined) return null;
  return multiplyDecimals(quantity, unitPrice, 2);
}

/** Compares two decimal strings numerically. */
export function compareDecimals(a: string, b: string): -1 | 0 | 1 {
  const left = parseOrThrow(a);
  const right = parseOrThrow(b);
  const scale = Math.max(left.scale, right.scale);
  const l = rescale(left.units, left.scale, scale);
  const r = rescale(right.units, right.scale, scale);
  return l === r ? 0 : l < r ? -1 : 1;
}

export function decimalSign(value: string): -1 | 0 | 1 {
  const { units } = parseOrThrow(value);
  return units === 0n ? 0 : units < 0n ? -1 : 1;
}

export function isZeroDecimal(value: string): boolean {
  return decimalSign(value) === 0;
}

/** Negates a decimal string, keeping its scale: `"8.50"` → `"-8.50"`, `"0"` → `"0"`. */
export function negateDecimal(value: string): string {
  const { units, scale } = parseOrThrow(value);
  return fromScaled(-units, scale);
}

/** Absolute value, keeping the scale. */
export function absDecimal(value: string): string {
  const { units, scale } = parseOrThrow(value);
  return fromScaled(units < 0n ? -units : units, scale);
}

/** Larger of two decimal strings (returned unchanged). */
export function maxDecimal(a: string, b: string): string {
  return compareDecimals(a, b) >= 0 ? a : b;
}
