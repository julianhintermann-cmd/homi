/*
 * "After the press": layout changes triggered by a blur (a collapsing row, a closing hint) must not happen between
 * the `pointerdown` and the `pointerup` of the same tap. The press that blurred a field would otherwise end on
 * whatever moved under the finger and the `click` of the tapped control is lost (the control "does nothing"
 * the first time; seen with WebKit on a slow machine in e2e/two-users.spec.ts).
 */

/** Longest a layout change is held back for a press that never reports its release. */
const MAX_HOLD_MS = 1_000;

let pressed = false;
let listening = false;
const waiting = new Set<() => void>();

function release(): void {
  pressed = false;
  const callbacks = [...waiting];
  waiting.clear();
  // One task later: pointerup, mouseup and the click that follows have all been dispatched by then.
  for (const callback of callbacks) window.setTimeout(callback, 0);
}

function press(): void {
  pressed = true;
}

function ensureListeners(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  // Capture phase on the document: runs before the blur that the press itself causes.
  document.addEventListener('pointerdown', press, true);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
}

ensureListeners();

/** Whether a pointer (mouse button, finger, pen) is currently held down on the page. */
export function isPointerPressed(): boolean {
  return pressed;
}

/**
 * Runs `callback` asynchronously: in the next task, or – while a pointer is held down – in the task after its
 * release. Returns a function that cancels a callback that has not run yet.
 */
export function afterPointerRelease(callback: () => void): () => void {
  ensureListeners();
  if (!pressed) {
    const timer = window.setTimeout(callback, 0);
    return () => window.clearTimeout(timer);
  }
  const run = (): void => {
    window.clearTimeout(fallback);
    callback();
  };
  const fallback = window.setTimeout(() => {
    waiting.delete(run);
    callback();
  }, MAX_HOLD_MS);
  waiting.add(run);
  return () => {
    window.clearTimeout(fallback);
    waiting.delete(run);
  };
}
