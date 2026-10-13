import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { Icon, type IconName } from '@/icons/Icon';
import { haptic } from '@/lib/haptics';
import { ConfirmDialog } from './ConfirmDialog';
import { GlassButton } from './GlassButton';
import { Portal } from './Portal';
import { SheetContext, useSheet, type SheetContextValue } from './sheetContext';
import {
  resolveDismissRequest,
  sheetDragOffset,
  shouldDismissSheet,
  SHEET_DRAG_SLOP,
  velocityFromSamples,
  type PointerSample,
} from './sheetGesture';
import { useModalLayer } from './useModalLayer';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

/**
 * - `page`: iOS page sheet (Add/Edit item, design 06/07): black backdrop, receding "presenting
 *   view" strip, sheet from safe-top + 4 with 34 px top radii on the background colour.
 * - `action`: content-height bottom sheet (photo source, design 13): 30 % dim, surface panel with
 *   grabber, centred title, option rows and a cancel pill.
 */
export type BottomSheetVariant = 'page' | 'action';

export interface HomiBottomSheetProps {
  children: ReactNode;
  /** Close the sheet (route sheets: navigate back). Called after the dirty check. */
  onClose: () => void;
  /** Default `page` (route sheets rendered by `SheetLayer`). */
  variant?: BottomSheetVariant;
  /**
   * Controlled visibility for in-screen sheets (handles its own enter/exit animation).
   * Omit for route sheets that are mounted/unmounted inside the parent `<AnimatePresence>`.
   */
  open?: boolean;
  /** `action` variant: centred `headline` title (also the dialog's accessible name). */
  title?: string;
  /** `action` variant: cancel pill label (e.g. "Abbrechen"). */
  cancelLabel?: string;
  /** Unsaved input: dismissing (drag, dim, Escape, close) first asks "Änderungen verwerfen?". */
  dirty?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  /**
   * Render only the sheet panel in place – no portal, backdrop, motion, gestures or focus trap
   * (design gallery / documentation).
   */
  inline?: boolean;
}

/**
 * Modal sheet (Freegma "Bottom Sheet" + the page-sheet chrome of screens 06/07): dim/backdrop,
 * spring-in, drag-to-dismiss from the grabber/header or from the content when it is scrolled to
 * the top (distance or velocity threshold, rubber band upwards), focus trap, Escape, safe areas
 * and the on-screen keyboard inset. Keeps `exit` animations for route-driven closing.
 */
export function HomiBottomSheet({ open, inline = false, ...props }: HomiBottomSheetProps) {
  if (inline) return <StaticSheetPanel {...props} />;
  if (open === undefined) return <SheetFrame {...props} />;
  return <AnimatePresence>{open ? <SheetFrame key="sheet" {...props} /> : null}</AnimatePresence>;
}

type SheetFrameProps = Omit<HomiBottomSheetProps, 'open' | 'inline'>;

/** The sheet panel without any overlay behaviour (`inline`). */
function StaticSheetPanel({
  children,
  onClose,
  variant = 'page',
  title,
  cancelLabel,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SheetFrameProps) {
  const titleId = useId();
  const context = useMemo<SheetContextValue>(() => ({ requestClose: onClose, titleId }), [onClose, titleId]);
  const labelledBy = ariaLabelledBy ?? (title ? titleId : undefined);
  return (
    <SheetContext.Provider value={context}>
      <div
        role="dialog"
        aria-label={labelledBy ? undefined : ariaLabel}
        aria-labelledby={labelledBy}
        className={cx('homi-sheet', className)}
        data-variant={variant}
        data-inline
      >
        {variant === 'action' ? (
          <div className="homi-sheet__grabber-zone">
            <span className="homi-sheet__grabber" aria-hidden="true" />
            {title ? (
              <h2 id={titleId} className="homi-sheet__action-title">
                {title}
              </h2>
            ) : null}
          </div>
        ) : null}
        <div className="homi-sheet__content" data-variant={variant}>
          {children}
          {variant === 'action' && cancelLabel ? (
            <button type="button" className="homi-sheet__cancel" onClick={onClose}>
              {cancelLabel}
            </button>
          ) : null}
        </div>
      </div>
    </SheetContext.Provider>
  );
}

function SheetFrame({
  children,
  onClose,
  variant = 'page',
  title,
  cancelLabel,
  dirty = false,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SheetFrameProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reducedMotion = useReducedMotion() ?? false;
  const [confirming, setConfirming] = useState(false);
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [0, 480], [1, 0.25], { clamp: true });

  const onCloseRef = useRef(onClose);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    onCloseRef.current = onClose;
    dirtyRef.current = dirty;
  }, [onClose, dirty]);

  const settle = useCallback(() => {
    animate(dragY, 0, reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 44 });
  }, [dragY, reducedMotion]);

  // Guards against double closes (e.g. a flick and a backdrop tap in the same frame).
  const closedRef = useRef(false);
  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onCloseRef.current();
  }, []);

  const requestClose = useCallback(() => {
    if (closedRef.current) return;
    const outcome = resolveDismissRequest({ dismiss: true, dirty: dirtyRef.current });
    if (outcome === 'confirm') {
      settle();
      haptic('warning');
      setConfirming(true);
    } else if (outcome === 'close') {
      close();
    }
  }, [close, settle]);

  // While the discard dialog is open it is the top-most modal layer (Escape/focus go there).
  useModalLayer({ container: panelRef, initialFocus: panelRef, onEscape: requestClose });

  // ── Drag from the grabber / header (pointer events, `touch-action: none` on handles) ──
  const drag = useRef<{ pointerId: number; startY: number; active: boolean; samples: PointerSample[] } | null>(null);

  const finishDrag = useCallback(
    (velocity: number) => {
      const height = panelRef.current?.offsetHeight ?? 1;
      if (shouldDismissSheet({ offset: dragY.get(), velocity, height })) requestClose();
      else settle();
    },
    [dragY, requestClose, settle],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !(event.target instanceof Element) || !event.target.closest('[data-sheet-handle]'))
      return;
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      active: false,
      samples: [{ t: event.timeStamp, y: event.clientY }],
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const delta = event.clientY - state.startY;
    if (!state.active) {
      if (Math.abs(delta) < SHEET_DRAG_SLOP) return;
      state.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    state.samples.push({ t: event.timeStamp, y: event.clientY });
    if (state.samples.length > 20) state.samples.shift();
    dragY.set(sheetDragOffset(delta, panelRef.current?.offsetHeight ?? 1));
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!state.active) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    finishDrag(event.type === 'pointercancel' ? 0 : velocityFromSamples(state.samples));
  };

  // ── Drag from the content while it is scrolled to the top (touch events, non-passive) ──
  useEffect(() => {
    const scroller = contentRef.current;
    if (!scroller) return undefined;
    let startY = 0;
    let startX = 0;
    let dragging = false;
    let undecided = true;
    let samples: PointerSample[] = [];

    const onTouchStart = (event: TouchEvent): void => {
      const touch = event.touches[0];
      undecided = false;
      dragging = false;
      if (!touch || event.touches.length > 1) return;
      // Handles (sticky sheet header) are dragged by the pointer handlers.
      if (event.target instanceof Element && event.target.closest('[data-sheet-handle]')) return;
      startY = touch.clientY;
      startX = touch.clientX;
      dragging = false;
      undecided = true;
      samples = [{ t: event.timeStamp, y: touch.clientY }];
    };

    const onTouchMove = (event: TouchEvent): void => {
      const touch = event.touches[0];
      if (!touch) return;
      const deltaY = touch.clientY - startY;
      if (!undecided && !dragging) return;
      if (undecided) {
        if (Math.abs(deltaY) < SHEET_DRAG_SLOP && Math.abs(touch.clientX - startX) < SHEET_DRAG_SLOP) return;
        undecided = false;
        const vertical = Math.abs(deltaY) > Math.abs(touch.clientX - startX);
        const fromField =
          event.target instanceof Element && event.target.closest('input, textarea, select, [data-no-sheet-drag]');
        dragging = vertical && deltaY > 0 && scroller.scrollTop <= 0 && !fromField;
        if (dragging) startY = touch.clientY;
      }
      if (!dragging) return;
      event.preventDefault(); // stop the native overscroll bounce – the sheet follows instead
      samples.push({ t: event.timeStamp, y: touch.clientY });
      if (samples.length > 20) samples.shift();
      dragY.set(sheetDragOffset(touch.clientY - startY, panelRef.current?.offsetHeight ?? 1));
    };

    const onTouchEnd = (event: TouchEvent): void => {
      if (!dragging) return;
      dragging = false;
      finishDrag(event.type === 'touchcancel' ? 0 : velocityFromSamples(samples));
    };

    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', onTouchEnd);
    scroller.addEventListener('touchcancel', onTouchEnd);
    return () => {
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [dragY, finishDrag]);

  const context = useMemo<SheetContextValue>(() => ({ requestClose, titleId }), [requestClose, titleId]);

  const enter = reducedMotion
    ? { opacity: 1, transition: { duration: 0.15 } }
    : { y: 0, transition: { type: 'spring' as const, duration: 0.4, bounce: 0.08 } };
  const exit = reducedMotion
    ? { opacity: 0, transition: { duration: 0.15 } }
    : { y: '100%', transition: { duration: 0.3, ease: 'easeIn' as const } };
  const initial = reducedMotion ? { opacity: 0 } : { y: '100%' };
  const fade = { duration: reducedMotion ? 0.15 : 0.3, ease: 'easeOut' } as const;
  const labelledBy = ariaLabelledBy ?? (title ? titleId : undefined);

  return (
    <Portal>
      <SheetContext.Provider value={context}>
        <div className={cx('homi-sheet-layer', className)} data-variant={variant}>
          <motion.div
            className="homi-sheet-backdrop"
            data-variant={variant}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: fade }}
            exit={{ opacity: 0, transition: fade }}
            onClick={requestClose}
          >
            <motion.div className="homi-sheet-backdrop__fill" style={{ opacity: backdropOpacity }} />
          </motion.div>
          {variant === 'page' ? (
            <motion.div
              className="homi-sheet-presenting"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: fade }}
              exit={{ opacity: 0, transition: fade }}
            />
          ) : null}
          <motion.div className="homi-sheet-position" data-variant={variant} style={{ y: dragY }}>
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={labelledBy ? undefined : ariaLabel}
              aria-labelledby={labelledBy}
              tabIndex={-1}
              className="homi-sheet"
              data-variant={variant}
              initial={initial}
              animate={enter}
              exit={exit}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
            >
              {variant === 'action' ? (
                <div className="homi-sheet__grabber-zone" data-sheet-handle>
                  <span className="homi-sheet__grabber" aria-hidden="true" />
                  {title ? (
                    <h2 id={titleId} className="homi-sheet__action-title">
                      {title}
                    </h2>
                  ) : null}
                </div>
              ) : (
                <div className="homi-sheet__handle-zone" data-sheet-handle aria-hidden="true" />
              )}
              <div ref={contentRef} className="homi-sheet__content" data-variant={variant}>
                {children}
                {variant === 'action' && cancelLabel ? (
                  <button type="button" className="homi-sheet__cancel" onClick={requestClose}>
                    {cancelLabel}
                  </button>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        </div>
        <ConfirmDialog
          open={confirming}
          title="Änderungen verwerfen?"
          message="Deine Eingaben gehen verloren."
          confirmLabel="Verwerfen"
          cancelLabel="Weiter bearbeiten"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            close();
          }}
        />
      </SheetContext.Provider>
    </Portal>
  );
}

export interface SheetHeaderProps {
  /** Centred `headline` title ("Neuer Artikel"). */
  title: string;
  /** Trailing glass control at (333, 14), e.g. the destructive trash button in design 07. */
  trailing?: ReactNode;
  /** Close button label. Default "Schliessen". */
  closeLabel?: string;
  /** Hide the close button (rare – sheets must stay dismissible otherwise). */
  hideClose?: boolean;
  className?: string;
}

/**
 * Page-sheet header (design 06/07): glass close button (xmark 20 px) at (16, 14), title centred at
 * y 25, optional trailing button; sticky at the top of the sheet and a drag handle.
 */
export function SheetHeader({
  title,
  trailing,
  closeLabel = 'Schliessen',
  hideClose = false,
  className,
}: SheetHeaderProps) {
  const sheet = useSheet();
  return (
    <div className={cx('homi-sheet-header', className)} data-sheet-handle>
      <div className="homi-sheet-header__side">
        {hideClose ? null : (
          <GlassButton icon="xmark" size="sheet" label={closeLabel} onClick={() => sheet?.requestClose()} />
        )}
      </div>
      <h2 id={sheet?.titleId} className="homi-sheet-header__title">
        {title}
      </h2>
      <div className="homi-sheet-header__side homi-sheet-header__side--trailing">{trailing}</div>
    </div>
  );
}

export interface BottomSheetOptionProps {
  label: string;
  icon?: IconName;
  /** Custom leading visual instead of `icon` (e.g. a 28 px `Avatar` in a member picker). */
  leading?: ReactNode;
  onClick?: () => void;
  /** Render as a `<label>` for a hidden file input (camera / library pickers). */
  htmlFor?: string;
  destructive?: boolean;
}

/** Option row of an action sheet: 353 × 52, r 16, surface-muted, 24 px icon at 16, `body` label at 54. */
export function BottomSheetOption({
  label,
  icon,
  leading,
  onClick,
  htmlFor,
  destructive = false,
}: BottomSheetOptionProps) {
  const content = (
    <>
      {leading ? (
        <span className="homi-sheet-option__icon" aria-hidden="true">
          {leading}
        </span>
      ) : icon ? (
        <span className="homi-sheet-option__icon" aria-hidden="true">
          <Icon name={icon} size={24} strokeWidth={1.8} />
        </span>
      ) : null}
      <span className="homi-sheet-option__label">{label}</span>
    </>
  );
  if (htmlFor) {
    return (
      <label
        htmlFor={htmlFor}
        className="homi-sheet-option"
        data-tone={destructive ? 'destructive' : undefined}
        tabIndex={0}
        role="button"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            document.getElementById(htmlFor)?.click();
          }
        }}
      >
        {content}
      </label>
    );
  }
  return (
    <button
      type="button"
      className="homi-sheet-option"
      data-tone={destructive ? 'destructive' : undefined}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
