/** Pure helpers for `QuantityStepper` (kept free of React for unit tests). */

/** Number of decimals of a step (0.25 → 2) so repeated stepping never accumulates float noise. */
export function stepPrecision(step: number): number {
  if (!Number.isFinite(step)) return 0;
  const text = String(step);
  const exponent = /e-(\d+)$/.exec(text);
  if (exponent?.[1]) return Number(exponent[1]);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** `value + delta`, rounded to the step precision and clamped into `[min, max]`. */
export function stepValue(
  value: number,
  delta: number,
  { min, max, step }: { min: number; max: number; step: number },
): number {
  const precision = Math.max(stepPrecision(step), stepPrecision(value));
  const factor = 10 ** precision;
  const next = Math.round((value + delta) * factor) / factor;
  return Math.min(max, Math.max(min, next));
}

/**
 * Auto-repeat schedule while a stepper button is held: first repeat after `initialDelay`,
 * then faster and faster down to `minInterval` (iOS-like acceleration).
 */
export function repeatInterval(
  repeatIndex: number,
  { initialDelay = 400, interval = 120, minInterval = 45 } = {},
): number {
  if (repeatIndex <= 0) return initialDelay;
  return Math.max(minInterval, Math.round(interval * 0.88 ** (repeatIndex - 1)));
}
