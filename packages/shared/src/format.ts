import {
  compareDecimals,
  decimalSign,
  absDecimal,
  toFixedDecimal,
  trimDecimal,
  numberToDecimalString,
} from './decimal';
import { UNIT_LABELS, type Unit } from './enums';

/*
 * Display formatters for the Swiss German UI.
 *
 * Numbers are formatted deterministically from decimal strings instead of `Intl.NumberFormat`:
 * ICU versions disagree on the de-CH group separator (Node 24 / CLDR 48 emits an ASCII
 * apostrophe and a no-break space, older WebKit emits U+2019). The design uses "CHF 2’485.50",
 * so we always render a regular space after "CHF" and U+2019 as thousands separator.
 */

/** Thousands separator used by the design (RIGHT SINGLE QUOTATION MARK). */
export const GROUP_SEPARATOR = '’';

type NumericInput = string | number;

function toDecimalString(value: NumericInput, maxScale: number): string {
  return typeof value === 'number' ? numberToDecimalString(value, maxScale) : value;
}

function groupThousands(integerDigits: string): string {
  return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}

/** Formats an unsigned canonical decimal string with Swiss grouping (`"2485.50"` → `"2’485.50"`). */
function formatUnsigned(value: string): string {
  const [integerPart = '0', fractionPart] = value.split('.');
  const grouped = groupThousands(integerPart);
  return fractionPart !== undefined ? `${grouped}.${fractionPart}` : grouped;
}

/**
 * Formats a decimal number for display: Swiss grouping, `.` as decimal separator,
 * trailing zeros removed (`"1250.500"` → `"1’250.5"`).
 */
export function formatNumber(value: NumericInput, maxScale = 3): string {
  const text = trimDecimal(toFixedDecimal(toDecimalString(value, maxScale), maxScale));
  const sign = decimalSign(text) < 0 ? '-' : '';
  return `${sign}${formatUnsigned(absDecimal(text))}`;
}

/** `"2485.5"` → `"CHF 2’485.50"`, `"-12.3"` → `"CHF -12.30"`. Rounds half away from zero. */
export function formatCHF(value: NumericInput): string {
  const fixed = toFixedDecimal(toDecimalString(value, 2), 2);
  const sign = decimalSign(fixed) < 0 ? '-' : '';
  return `CHF ${sign}${formatUnsigned(absDecimal(fixed))}`;
}

/**
 * Like {@link formatCHF} but for values that may be unknown (`null`): unknown prices are never
 * shown as "CHF 0.00" (§3); the placeholder is returned instead.
 */
export function formatOptionalCHF(value: NumericInput | null | undefined, placeholder = '–'): string {
  return value === null || value === undefined || value === '' ? placeholder : formatCHF(value);
}

/** Signed change of value, e.g. the weekly trend: `"42.8"` → `"+ CHF 42.80"`, `"-5"` → `"- CHF 5.00"`. */
export function formatCHFDelta(value: NumericInput): string {
  const fixed = toFixedDecimal(toDecimalString(value, 2), 2);
  const sign = decimalSign(fixed);
  const amount = `CHF ${formatUnsigned(absDecimal(fixed))}`;
  if (sign > 0) return `+ ${amount}`;
  if (sign < 0) return `- ${amount}`;
  return amount;
}

/** Unit word for a quantity (singular only for exactly 1). */
export function unitLabelFor(quantity: NumericInput, unit: Unit): string {
  const label = UNIT_LABELS[unit];
  const text = toDecimalString(quantity, 3);
  return compareDecimals(text, '1') === 0 ? label.singular : label.plural;
}

/** `("3", STUECK)` → "3 Stück", `("1", FLASCHE)` → "1 Flasche", `("1.500", KILOGRAMM)` → "1.5 kg". */
export function formatQuantity(quantity: NumericInput, unit: Unit): string {
  return `${formatNumber(quantity, 3)} ${unitLabelFor(quantity, unit)}`;
}

/** `("8.5", FLASCHE)` → "CHF 8.50 / Fl." */
export function formatUnitPrice(unitPrice: NumericInput, unit: Unit): string {
  return `${formatCHF(unitPrice)} / ${UNIT_LABELS[unit].short}`;
}

// ---------------------------------------------------------------------------
// Dates & times
// ---------------------------------------------------------------------------

export type DateInput = Date | string | number;

export interface DateFormatOptions {
  /** Reference "now" (defaults to the current time). */
  now?: DateInput;
  /** IANA time zone (defaults to the runtime's local zone). */
  timeZone?: string;
}

export const WEEKDAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'] as const;
export const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** Days since 1970-01-01 of the calendar date in the target zone. */
  dayNumber: number;
  /** 0 = Sunday */
  weekday: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? '';
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

function toDate(input: DateInput): Date {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(input)}`);
  return date;
}

function calendarParts(input: DateInput, timeZone: string | undefined): CalendarParts {
  const values: Record<string, number> = {};
  for (const part of getFormatter(timeZone).formatToParts(toDate(input))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  const year = values.year ?? 1970;
  const month = values.month ?? 1;
  const day = values.day ?? 1;
  const dayNumber = Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
  return {
    year,
    month,
    day,
    hour: (values.hour ?? 0) % 24,
    minute: values.minute ?? 0,
    dayNumber,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

/** "14:32" */
export function formatTime(date: DateInput, options: DateFormatOptions = {}): string {
  const parts = calendarParts(date, options.timeZone);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/** "12.10.2026" */
export function formatDate(date: DateInput, options: DateFormatOptions = {}): string {
  const parts = calendarParts(date, options.timeZone);
  return `${pad2(parts.day)}.${pad2(parts.month)}.${parts.year}`;
}

/** "12.10.26" */
export function formatShortDate(date: DateInput, options: DateFormatOptions = {}): string {
  const parts = calendarParts(date, options.timeZone);
  return `${pad2(parts.day)}.${pad2(parts.month)}.${pad2(parts.year % 100)}`;
}

/** Calendar-day difference `now - date` in the target time zone (0 = same day, 1 = yesterday). */
export function calendarDaysBetween(date: DateInput, options: DateFormatOptions = {}): number {
  const target = calendarParts(date, options.timeZone);
  const now = calendarParts(options.now ?? new Date(), options.timeZone);
  return now.dayNumber - target.dayNumber;
}

/**
 * Timestamp for conversation lists (iOS style):
 * today → "14:32", yesterday → "Gestern", within the last week → weekday ("Montag"),
 * older → "12.10.26".
 */
export function formatChatTimestamp(date: DateInput, options: DateFormatOptions = {}): string {
  const days = calendarDaysBetween(date, options);
  if (days <= 0) return formatTime(date, options);
  if (days === 1) return 'Gestern';
  if (days < 7) return WEEKDAY_NAMES[calendarParts(date, options.timeZone).weekday] ?? formatShortDate(date, options);
  return formatShortDate(date, options);
}

/** Day separator inside a chat: "Heute", "Gestern", "Montag, 12. Oktober", "12. Oktober 2025". */
export function formatChatDayLabel(date: DateInput, options: DateFormatOptions = {}): string {
  const days = calendarDaysBetween(date, options);
  if (days <= 0) return 'Heute';
  if (days === 1) return 'Gestern';
  const parts = calendarParts(date, options.timeZone);
  const nowParts = calendarParts(options.now ?? new Date(), options.timeZone);
  const month = MONTH_NAMES[parts.month - 1] ?? '';
  if (parts.year !== nowParts.year) return `${parts.day}. ${month} ${parts.year}`;
  return `${WEEKDAY_NAMES[parts.weekday] ?? ''}, ${parts.day}. ${month}`;
}

/**
 * Relative time for activity feeds: "Gerade eben", "vor 5 Min.", "vor 2 Std.", "Gestern",
 * "vor 3 Tagen", older than a week → "12.10.26".
 */
export function formatRelativeTime(date: DateInput, options: DateFormatOptions = {}): string {
  const target = toDate(date);
  const now = toDate(options.now ?? new Date());
  const diffMinutes = Math.floor((now.getTime() - target.getTime()) / 60_000);
  if (diffMinutes < 1) return 'Gerade eben';
  if (diffMinutes < 60) return `vor ${diffMinutes} Min.`;
  const days = calendarDaysBetween(target, { ...options, now });
  if (days <= 0) return `vor ${Math.floor(diffMinutes / 60)} Std.`;
  if (days === 1) return 'Gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return formatShortDate(target, options);
}
