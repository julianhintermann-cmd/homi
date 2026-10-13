import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Stack of open modal layers (sheets, dialogs, menus). Only the top-most layer reacts to
 * Escape and traps focus, so a confirmation dialog opened from a sheet behaves correctly.
 */
interface ModalLayer {
  container: RefObject<HTMLElement | null>;
  onEscape: () => void;
}

const layers: ModalLayer[] = [];

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Visible, keyboard-focusable descendants in DOM order. */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.closest('[inert]') && element.getClientRects().length > 0,
  );
}

function isTop(layer: ModalLayer): boolean {
  return layers[layers.length - 1] === layer;
}

export interface ModalLayerOptions {
  /** The modal's root element (focus is kept inside it). */
  container: RefObject<HTMLElement | null>;
  /** Escape pressed while this is the top-most layer. */
  onEscape: () => void;
  /** Element to focus first; defaults to the first focusable element, then the container. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Restore focus to the previously focused element on close. Default `true`. */
  restoreFocus?: boolean;
  /** Set `false` to keep the layer registered but inactive. Default `true`. */
  enabled?: boolean;
}

/**
 * Registers a modal layer while mounted: moves focus into it, traps Tab/Shift+Tab, closes on
 * Escape and restores focus to the opener on unmount.
 */
export function useModalLayer({
  container,
  onEscape,
  initialFocus,
  restoreFocus = true,
  enabled = true,
}: ModalLayerOptions): void {
  const onEscapeRef = useRef(onEscape);
  useLayoutEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  // Layout effect, not a passive one: the layer must handle Escape from the moment it is in the DOM.
  // Passive effects of a navigation (transition) render can run tens of milliseconds after the
  // commit on a busy main thread – an Escape pressed while a sheet slides in was dropped (WebKit).
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const layer: ModalLayer = { container, onEscape: () => onEscapeRef.current() };
    const rootAtStart = container.current;
    layers.push(layer);
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusInitial = (): void => {
      const root = container.current;
      if (!root) return;
      const target = initialFocus?.current ?? getFocusable(root)[0] ?? root;
      target.focus({ preventScroll: true });
    };
    // After paint so enter animations have attached the element.
    const frame = requestAnimationFrame(focusInitial);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isTop(layer)) return;
      const root = container.current;
      if (!root) return;
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        layer.onEscape();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable(root);
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === root)) {
        event.preventDefault();
        last?.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus({ preventScroll: true });
      }
    };

    const onFocusIn = (event: FocusEvent): void => {
      if (!isTop(layer)) return;
      const root = container.current;
      if (!root || !(event.target instanceof Node) || root.contains(event.target)) return;
      // Focus escaped (e.g. programmatic focus on the background) – pull it back.
      (getFocusable(root)[0] ?? root).focus({ preventScroll: true });
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      const wasTop = isTop(layer);
      const index = layers.indexOf(layer);
      if (index !== -1) layers.splice(index, 1);
      // Only take focus back from inside the layer (or from nowhere): a layer that is deactivated
      // while it animates out must not steal the focus the user has meanwhile put elsewhere.
      const active = document.activeElement;
      const focusInLayer = !active || active === document.body || Boolean(rootAtStart?.contains(active));
      if (restoreFocus && wasTop && focusInLayer && previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
    // `container`/`initialFocus` are stable refs; re-running would steal focus mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

/** Number of open modal layers (used by tests and to avoid stacking haptics). */
export function openModalLayerCount(): number {
  return layers.length;
}
