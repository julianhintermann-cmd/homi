/**
 * Small helpers shared by the design-system components (no React, no DOM side effects
 * at import time except where noted).
 */

type ClassValue = string | false | null | undefined;

/** Joins truthy class names. */
export function cx(...values: ClassValue[]): string {
  let out = '';
  for (const value of values) {
    if (value) out = out ? `${out} ${value}` : value;
  }
  return out;
}

/** Clamps `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

let activeStatesEnabled = false;

/**
 * iOS Safari only applies `:active` to elements while a touch listener exists somewhere in the
 * document. Registering one passive no-op listener makes every `:active` pressed state in
 * components.css/glass.css appear on touch-down (well within 100 ms).
 */
export function enableActiveStates(): void {
  if (activeStatesEnabled || typeof document === 'undefined') return;
  activeStatesEnabled = true;
  document.addEventListener('touchstart', () => undefined, { passive: true });
}

/** `true` when the user asked the OS for reduced motion (non-reactive, for imperative code). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** 32-bit FNV-1a hash – stable across sessions/devices (used for avatar tints). */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

let idCounter = 0;
/** Non-hook unique id (for imperative portals). Prefer `useId()` inside components. */
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}
