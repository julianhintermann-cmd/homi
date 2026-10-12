import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { haptic } from '@/lib/haptics';

/** Hold duration before a long press fires (iOS context menus open after ~0.5 s). */
export const LONG_PRESS_DELAY_MS = 450;
/** Finger travel that cancels a pending long press (the user is scrolling). */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export type LongPressSource = 'touch' | 'mouse' | 'keyboard';

export interface LongPressDetail {
  /** The element the handlers are attached to. */
  target: HTMLElement;
  /** Bounding box of `target` when the press fired (anchor for menus/previews). */
  rect: DOMRect;
  source: LongPressSource;
}

export interface LongPressOptions {
  delay?: number;
  disabled?: boolean;
  /** Also open on right-click (`contextmenu`) for mouse users. Default `true`. */
  contextMenu?: boolean;
}

export interface LongPressHandlers<T extends HTMLElement> {
  onPointerDown: (event: PointerEvent<T>) => void;
  onPointerMove: (event: PointerEvent<T>) => void;
  onPointerUp: (event: PointerEvent<T>) => void;
  onPointerCancel: (event: PointerEvent<T>) => void;
  onPointerLeave: (event: PointerEvent<T>) => void;
  onContextMenu: (event: MouseEvent<T>) => void;
  onClickCapture: (event: MouseEvent<T>) => void;
  onKeyDown: (event: KeyboardEvent<T>) => void;
}

/**
 * Long press (touch/pen hold, mouse right-click, keyboard Shift+F10 / ContextMenu key).
 * The click that follows a fired long press is swallowed so the row does not also navigate.
 */
export function useLongPress<T extends HTMLElement = HTMLElement>(
  onLongPress: (detail: LongPressDetail) => void,
  { delay = LONG_PRESS_DELAY_MS, disabled = false, contextMenu = true }: LongPressOptions = {},
): LongPressHandlers<T> {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  useEffect(() => {
    callback.current = onLongPress;
  }, [onLongPress]);

  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const fire = useCallback((target: T, source: LongPressSource) => {
    fired.current = true;
    haptic('medium');
    callback.current({ target, rect: target.getBoundingClientRect(), source });
  }, []);

  const onPointerDown = useCallback(
    (event: PointerEvent<T>) => {
      fired.current = false;
      if (disabled || event.pointerType === 'mouse' || !event.isPrimary) return;
      const target = event.currentTarget;
      start.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        start.current = null;
        fire(target, 'touch');
      }, delay);
    },
    [delay, disabled, fire],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<T>) => {
      const origin = start.current;
      if (!origin || origin.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > LONG_PRESS_MOVE_TOLERANCE_PX) clear();
    },
    [clear],
  );

  const onContextMenu = useCallback(
    (event: MouseEvent<T>) => {
      if (disabled) return;
      // Touch long-press also raises `contextmenu` on Android – never show the browser menu.
      event.preventDefault();
      if (!contextMenu || fired.current || timer.current !== undefined) return;
      clear();
      fire(event.currentTarget, 'mouse');
    },
    [clear, contextMenu, disabled, fire],
  );

  const onClickCapture = useCallback((event: MouseEvent<T>) => {
    if (!fired.current) return;
    fired.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<T>) => {
      if (disabled) return;
      if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
        event.preventDefault();
        fire(event.currentTarget, 'keyboard');
        fired.current = false; // keyboard activation is not followed by a click
      }
    },
    [disabled, fire],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu,
    onClickCapture,
    onKeyDown,
  };
}
