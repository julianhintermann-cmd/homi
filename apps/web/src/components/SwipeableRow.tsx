import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react';
import { Icon, type IconName } from '@/icons/Icon';
import { haptic } from '@/lib/haptics';
import type { ContextMenuItem } from './ContextMenu';
import { velocityFromSamples, type PointerSample } from './sheetGesture';
import {
  classifySwipe,
  isPastFullSwipe,
  resolveSwipeSnap,
  snapOffset,
  swipeDragOffset,
  SWIPE_ACTION_WIDTH,
  type SwipeGeometry,
} from './swipeActions';
import { useRowMenu } from './useRowMenu';
import { cx } from './utils';

export interface SwipeAction {
  key: string;
  /** Short German label, e.g. "Löschen". */
  label: string;
  icon?: IconName;
  tone?: 'destructive' | 'accent' | 'neutral';
  onAction: () => void;
}

export interface SwipeableRowProps {
  /**
   * The row content. Render rows with `wrapper="none"`-style markup (e.g. `ShoppingItemRow
   * wrapper="div"` is fine, but separators work best with plain row elements).
   */
  children: ReactNode;
  /** Trailing actions, outermost (primary) first – e.g. `[{ key: 'delete', label: 'Löschen', … }]`. */
  actions: readonly SwipeAction[];
  /** A long swipe triggers the primary action (first in `actions`). Default `true`. */
  fullSwipe?: boolean;
  /** Extra items for the accessible long-press/right-click menu (the actions are always included). */
  menuItems?: readonly ContextMenuItem[];
  /**
   * Append the swipe actions to the long-press menu. Default `true`; pass `false` when
   * `menuItems` already offers every action (e.g. the inventory menu of design 16).
   */
  actionsInMenu?: boolean;
  /** Accessible name of the fallback menu (e.g. the item name). */
  menuLabel?: string;
  /** Root wrapper: `li` (inside a list card, default) or `div`. */
  wrapper?: 'li' | 'div';
  disabled?: boolean;
  className?: string;
  /**
   * Leading actions revealed by dragging the row to the right, outermost (primary) first – e.g.
   * `[{ key: 'done', label: 'Erledigt', tone: 'accent', … }]`. Same snapping rules, mirrored.
   */
  leadingActions?: readonly SwipeAction[];
  /** A long swipe to the right triggers the primary leading action. Default `true`. */
  leadingFullSwipe?: boolean;
}

const NO_ACTIONS: readonly SwipeAction[] = [];

/** Only one row is open at a time (opening another closes the previous one). */
let closeOpenRow: (() => void) | null = null;

/**
 * iOS-style swipe actions: dragging the row left reveals the actions (snap open/closed by
 * distance and velocity), a long swipe triggers the primary action, overscroll rubber-bands.
 * The gesture is only claimed when it is clearly horizontal, so vertical scrolling and the tab
 * swipe (`data-no-swipe`) never conflict. The same actions are available without gestures via
 * long press, right-click, Shift+F10 or the ContextMenu key, and as buttons when open.
 */
export function SwipeableRow({
  children,
  actions,
  fullSwipe = true,
  menuItems,
  actionsInMenu = true,
  menuLabel,
  wrapper = 'li',
  disabled = false,
  className,
  leadingActions = NO_ACTIONS,
  leadingFullSwipe = true,
}: SwipeableRowProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const reducedMotion = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const actionsWidth = actions.length * SWIPE_ACTION_WIDTH;
  const primary = actions[0];
  // Leading side (drag right): the trailing helpers are reused with mirrored (negated) offsets.
  const leadingWidth = leadingActions.length * SWIPE_ACTION_WIDTH;
  const leadingPrimary = leadingActions[0];
  const [side, setSide] = useState<'leading' | 'trailing'>('trailing');
  const sideRef = useRef<'leading' | 'trailing'>('trailing');
  const showSide = useCallback((next: 'leading' | 'trailing') => {
    if (sideRef.current === next) return;
    sideRef.current = next;
    setSide(next);
  }, []);
  // The action panels are only painted while the row is moved: at rest their colour would bleed
  // through the anti-aliased rounded corners of the list card.
  const [revealed, setRevealed] = useState(false);
  useMotionValueEvent(x, 'change', (value) => setRevealed(value !== 0));

  const gesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: number;
    axis: 'horizontal' | 'vertical' | null;
    samples: PointerSample[];
    pastFull: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  const geometry = useCallback(
    (): SwipeGeometry => ({
      actionsWidth,
      rowWidth: contentRef.current?.offsetWidth ?? 353,
      fullSwipe: fullSwipe && Boolean(primary),
    }),
    [actionsWidth, fullSwipe, primary],
  );

  const leadingGeometry = useCallback(
    (): SwipeGeometry => ({
      actionsWidth: leadingWidth,
      rowWidth: contentRef.current?.offsetWidth ?? 353,
      fullSwipe: leadingFullSwipe && Boolean(leadingPrimary),
    }),
    [leadingWidth, leadingFullSwipe, leadingPrimary],
  );

  const settleTo = useCallback(
    (target: number) =>
      animate(x, target, reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 600, damping: 48 }),
    [reducedMotion, x],
  );

  const close = useCallback(() => {
    setOpen(false);
    settleTo(0);
  }, [settleTo]);

  // Register as the open row; close when tapping anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
    const onOutside = (event: PointerEvent): void => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', onOutside, true);
    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      if (closeOpenRow === close) closeOpenRow = null;
    };
  }, [close, open]);

  const runAction = useCallback(
    (action: SwipeAction) => {
      haptic(action.tone === 'destructive' ? 'warning' : 'light');
      action.onAction();
      close();
    },
    [close],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (
      disabled ||
      (actions.length === 0 && leadingActions.length === 0) ||
      !event.isPrimary ||
      (event.pointerType === 'mouse' && event.button !== 0)
    )
      return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: x.get(),
      axis: null,
      samples: [{ t: event.timeStamp, y: event.clientX }],
      pastFull: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = gesture.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    if (state.axis === null) {
      state.axis = classifySwipe(dx, event.clientY - state.startY);
      if (state.axis === null) return;
      if (state.axis === 'vertical') {
        gesture.current = null; // let the list scroll
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    state.samples.push({ t: event.timeStamp, y: event.clientX });
    if (state.samples.length > 20) state.samples.shift();
    const raw = state.startOffset + dx;
    const leading = raw > 0 && leadingWidth > 0;
    const geo = leading ? leadingGeometry() : geometry();
    // The helpers work with offsets ≤ 0 – the leading side mirrors them.
    const offset = leading ? -swipeDragOffset(-raw, geo) : swipeDragOffset(raw, geo);
    showSide(leading ? 'leading' : 'trailing');
    x.set(offset);
    const pastFull = isPastFullSwipe(leading ? -offset : offset, geo);
    if (pastFull !== state.pastFull) {
      state.pastFull = pastFull;
      haptic('light');
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = gesture.current;
    gesture.current = null;
    if (!state || state.pointerId !== event.pointerId || state.axis !== 'horizontal') return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const velocity = event.type === 'pointercancel' ? 0 : velocityFromSamples(state.samples);
    const leading = x.get() > 0 && leadingWidth > 0;
    const geo = leading ? leadingGeometry() : geometry();
    const sign = leading ? -1 : 1;
    const snap = resolveSwipeSnap({ offset: sign * x.get(), velocity: sign * velocity, ...geo });
    const fullAction = leading ? leadingPrimary : primary;
    if (snap === 'full' && fullAction) {
      void settleTo(sign * snapOffset('full', geo)).then(() => runAction(fullAction));
      return;
    }
    setOpen(snap === 'open');
    settleTo(sign * snapOffset(snap, geo));
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (suppressClick.current) {
      // The click that ends a drag must neither toggle/navigate the row nor close it again.
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (open) {
      // A tap on an open row closes it instead of activating the row.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const allMenuItems: ContextMenuItem[] = [
    ...(menuItems ?? []),
    ...(actionsInMenu ? [...leadingActions, ...actions] : []).map((action) => ({
      key: `swipe-${action.key}`,
      label: action.label,
      icon: action.icon,
      destructive: action.tone === 'destructive',
      onSelect: () => runAction(action),
    })),
  ];
  const { handlers, menu } = useRowMenu<HTMLDivElement>(disabled ? undefined : allMenuItems, () => children, menuLabel);

  const Wrapper = wrapper;
  const primaryTone = primary?.tone ?? 'neutral';
  return (
    <Wrapper
      ref={(element: HTMLElement | null) => {
        rootRef.current = element;
      }}
      className={cx('homi-row-item homi-swipe', className)}
      data-no-swipe
      data-open={open || undefined}
    >
      <div
        className="homi-swipe__actions"
        data-tone={primaryTone}
        style={
          {
            '--swipe-actions-width': `${actionsWidth}px`,
            ...(side === 'leading' || !revealed ? { visibility: 'hidden' } : null),
          } as CSSProperties
        }
        aria-hidden={!open || side === 'leading'}
        inert={!open || side === 'leading'}
      >
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="homi-swipe__action"
            data-tone={action.tone ?? 'neutral'}
            onClick={() => runAction(action)}
          >
            {action.icon ? <Icon name={action.icon} size={22} weight={2} /> : null}
            <span className="homi-swipe__action-label">{action.label}</span>
          </button>
        ))}
      </div>
      {leadingActions.length > 0 ? (
        <div
          className="homi-swipe__actions"
          data-side="leading"
          data-tone={leadingPrimary?.tone ?? 'neutral'}
          style={
            {
              '--swipe-actions-width': `${leadingWidth}px`,
              visibility: side === 'leading' && revealed ? 'visible' : 'hidden',
            } as CSSProperties
          }
          aria-hidden={!open || side !== 'leading'}
          inert={!open || side !== 'leading'}
        >
          {leadingActions.map((action) => (
            <button
              key={action.key}
              type="button"
              className="homi-swipe__action"
              data-tone={action.tone ?? 'neutral'}
              onClick={() => runAction(action)}
            >
              {action.icon ? <Icon name={action.icon} size={22} weight={2} /> : null}
              <span className="homi-swipe__action-label">{action.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <motion.div
        ref={contentRef}
        className="homi-swipe__content"
        style={{ x }}
        onPointerDown={(event) => {
          onPointerDown(event);
          handlers?.onPointerDown(event);
        }}
        onPointerMove={(event) => {
          onPointerMove(event);
          handlers?.onPointerMove(event);
        }}
        onPointerUp={(event) => {
          onPointerEnd(event);
          handlers?.onPointerUp(event);
        }}
        onPointerCancel={(event) => {
          onPointerEnd(event);
          handlers?.onPointerCancel(event);
        }}
        onPointerLeave={handlers?.onPointerLeave}
        onContextMenu={handlers?.onContextMenu}
        onKeyDown={handlers?.onKeyDown}
        onClickCapture={(event) => {
          handlers?.onClickCapture(event);
          if (!event.isPropagationStopped()) onClickCapture(event);
        }}
      >
        {children}
      </motion.div>
      {menu}
    </Wrapper>
  );
}
