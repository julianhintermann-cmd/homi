import { useEffect, useState } from 'react';

/** CSS custom property updated on `<html>` with the on-screen keyboard height. */
export const KEYBOARD_INSET_VAR = '--keyboard-inset';

/** Below this the difference is browser chrome (URL bar), not a keyboard. */
const KEYBOARD_THRESHOLD_PX = 80;

/**
 * Height of the part of the layout viewport covered by the on-screen keyboard, derived from
 * `window.visualViewport` (iOS Safari does not resize the layout viewport for the keyboard).
 */
export function computeKeyboardInset(
  layoutHeight: number,
  viewport: Pick<VisualViewport, 'height' | 'offsetTop'>,
): number {
  const covered = Math.round(layoutHeight - viewport.height - viewport.offsetTop);
  return covered > KEYBOARD_THRESHOLD_PX ? covered : 0;
}

/**
 * Tracks the keyboard inset and mirrors it to `--keyboard-inset` on `<html>` so composers
 * and sheets can stay above the keyboard. Mount once (App root); read the CSS variable
 * anywhere or use the returned value.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    if (!viewport) return undefined;

    let frame = 0;
    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = computeKeyboardInset(window.innerHeight, viewport);
        root.style.setProperty(KEYBOARD_INSET_VAR, `${next}px`);
        if (next > 0) root.setAttribute('data-keyboard', 'open');
        else root.removeAttribute('data-keyboard');
        setInset(next);
      });
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      root.style.setProperty(KEYBOARD_INSET_VAR, '0px');
      root.removeAttribute('data-keyboard');
    };
  }, []);

  return inset;
}
