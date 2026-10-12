/**
 * Light haptic feedback via the Vibration API. iOS Safari does not implement
 * `navigator.vibrate`, so every call is guarded and silently becomes a no-op there.
 */
export type HapticPattern = 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error';

const PATTERNS: Readonly<Record<HapticPattern, number | readonly number[]>> = {
  selection: 6,
  light: 10,
  medium: 18,
  success: [10, 40, 14],
  warning: [16, 60, 16],
  error: [22, 50, 22, 50, 22],
};

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function haptic(pattern: HapticPattern = 'light'): void {
  if (!canVibrate()) return;
  try {
    const value = PATTERNS[pattern];
    navigator.vibrate(typeof value === 'number' ? value : [...value]);
  } catch {
    // Some browsers throw when vibration is blocked (e.g. no user activation) – ignore.
  }
}
