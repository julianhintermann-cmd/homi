import type { Transition, Variants } from 'motion/react';

/** Token mirrors (styles/tokens.css): --ease-out, --dur-push, --dur-base. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const PUSH_DURATION_S = 0.35;
const TAB_DURATION_S = 0.22;
const REDUCED_DURATION_S = 0.12;

/** +1: forward (push / next tab), -1: backward (pop / previous tab). */
export type NavDirection = 1 | -1;

export interface TransitionCustom {
  direction: NavDirection;
  reducedMotion: boolean;
}

/**
 * iOS-like push: the new screen slides in from the right over the old one, which parallaxes
 * 25 % to the left. Popping reverses it. Reduced motion: short crossfade only.
 */
export const pushVariants: Variants = {
  enter: ({ direction, reducedMotion }: TransitionCustom) =>
    reducedMotion
      ? { opacity: 0, x: 0, zIndex: 2 }
      : { x: direction > 0 ? '100%' : '-25%', opacity: 1, zIndex: direction > 0 ? 2 : 1 },
  center: ({ direction, reducedMotion }: TransitionCustom) => ({
    x: 0,
    opacity: 1,
    zIndex: direction > 0 || reducedMotion ? 2 : 1,
    transition: pushTransition(reducedMotion),
  }),
  exit: ({ direction, reducedMotion }: TransitionCustom) =>
    reducedMotion
      ? { opacity: 0, zIndex: 1, transition: pushTransition(true) }
      : {
          x: direction > 0 ? '-25%' : '100%',
          zIndex: direction > 0 ? 1 : 2,
          transition: pushTransition(false),
        },
};

function pushTransition(reducedMotion: boolean): Transition {
  return reducedMotion
    ? { duration: REDUCED_DURATION_S, ease: 'linear' }
    : { duration: PUSH_DURATION_S, ease: EASE_OUT };
}

/** Restrained tab change: crossfade with a 24 px slide in the swipe direction. */
export const tabVariants: Variants = {
  enter: ({ direction, reducedMotion }: TransitionCustom) => ({
    opacity: 0,
    x: reducedMotion ? 0 : direction * 24,
  }),
  center: ({ reducedMotion }: TransitionCustom) => ({
    opacity: 1,
    x: 0,
    transition: { duration: reducedMotion ? REDUCED_DURATION_S : TAB_DURATION_S, ease: EASE_OUT },
  }),
  exit: ({ direction, reducedMotion }: TransitionCustom) => ({
    opacity: 0,
    x: reducedMotion ? 0 : direction * -24,
    transition: { duration: reducedMotion ? REDUCED_DURATION_S : TAB_DURATION_S * 0.8, ease: EASE_OUT },
  }),
};

/** Depth of a pathname for push/pop direction (`/` and tab roots = 0). */
export function routeDepth(pathname: string, isTabRoot: boolean): number {
  if (isTabRoot) return 0;
  return pathname.split('/').filter(Boolean).length;
}
