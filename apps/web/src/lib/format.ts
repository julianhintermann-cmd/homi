/**
 * Display formatting for the Swiss German UI. The implementations live in `@homi/shared`
 * (deterministic decimal-string formatting – no float math, "CHF 2’485.50" like the design);
 * this module is the single import point for web code. It imports the zod-free subpath
 * `@homi/shared/core`, so formatting never loads zod.
 */
export {
  GROUP_SEPARATOR,
  MONTH_NAMES,
  WEEKDAY_NAMES,
  calendarDaysBetween,
  formatCHF,
  formatCHFDelta,
  formatChatDayLabel,
  formatChatTimestamp,
  formatDate,
  formatNumber,
  formatOptionalCHF,
  formatQuantity,
  formatRelativeTime,
  formatShortDate,
  formatTime,
  formatUnitPrice,
  unitLabelFor,
  ACTIVITY_TYPE_LABELS,
  HOUSEHOLD_ROLE_LABELS,
  ITEM_CATEGORY_LABELS,
  UNIT_LABELS,
} from '@homi/shared/core';
export type { DateFormatOptions, DateInput } from '@homi/shared/core';
