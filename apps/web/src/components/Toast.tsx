import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Icon } from '@/icons/Icon';
import { toastDuration, useToastStore, type ToastTone } from './toastStore';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export type { ToastTone } from './toastStore';

export interface ToastProps {
  message: string;
  /** `success`: accent check badge (design). `error`: destructive badge. `neutral`: no badge. */
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  /** Shows a close button when provided. */
  onDismiss?: () => void;
  /**
   * Auto-dismiss after this many ms (calls `onDismiss`); paused while hovered or focused.
   * Omit for a persistent toast.
   */
  autoDismissMs?: number;
  /** Set `false` when the toast sits inside an existing live region (e.g. `ToastHost`). */
  live?: boolean;
  className?: string;
}

/**
 * Freegma "Toast": glass capsule 300 × 44 (r 22) – 24 px accent disc with a white check at
 * (10, 10), `subhead-medium` message at x 44 and an optional accent action ("Rückgängig")
 * right-aligned 14 px from the edge.
 */
export function Toast({
  message,
  tone = 'neutral',
  actionLabel,
  onAction,
  onDismiss,
  autoDismissMs,
  live = true,
  className,
}: ToastProps) {
  const [paused, setPaused] = useState(false);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!autoDismissMs || paused) return undefined;
    const timer = window.setTimeout(() => onDismissRef.current?.(), autoDismissMs);
    return () => window.clearTimeout(timer);
  }, [autoDismissMs, paused]);

  const role = tone === 'error' ? 'alert' : 'status';
  return (
    <div
      className={cx('glass homi-toast', className)}
      data-tone={tone}
      role={live ? role : undefined}
      aria-live={live ? (tone === 'error' ? 'assertive' : 'polite') : undefined}
      aria-atomic={live ? true : undefined}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {tone !== 'neutral' ? (
        <span className="homi-toast__badge" aria-hidden="true">
          <Icon name={tone === 'error' ? 'xmark' : 'check'} size={16} strokeWidth={3.9} />
        </span>
      ) : null}
      <span className="homi-toast__message">{message}</span>
      {actionLabel && onAction ? (
        <button type="button" className="homi-toast__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      {onDismiss && !autoDismissMs ? (
        <button
          type="button"
          className="homi-toast__close"
          aria-label="Schliessen"
          title="Schliessen"
          onClick={onDismiss}
        >
          <Icon name="xmark" size={16} strokeWidth={2.6} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Renders the toast from `showToast()` in the toolbar row (safe-top + 4, centred) with a 200 ms
 * dissolve, auto-dismisses it and hides the screen's trailing toolbar meanwhile (design 14).
 * Mount once at the app root.
 */
export function ToastHost() {
  const current = useToastStore((state) => state.current);
  const dismiss = useToastStore((state) => state.dismiss);
  const reducedMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const root = document.documentElement;
    if (current) root.setAttribute('data-toast-visible', '');
    else root.removeAttribute('data-toast-visible');
    return () => root.removeAttribute('data-toast-visible');
  }, [current]);

  return (
    <div className="homi-toast-host" role="status" aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {current ? (
          <motion.div
            key={current.id}
            className="homi-toast-host__item"
            initial={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
            transition={{ duration: reducedMotion ? 0.01 : 0.2, ease: 'easeOut' }}
          >
            <Toast
              live={false}
              message={current.message}
              tone={current.tone}
              actionLabel={current.actionLabel}
              onAction={
                current.onAction
                  ? () => {
                      current.onAction?.();
                      dismiss(current.id);
                    }
                  : undefined
              }
              autoDismissMs={toastDuration(current) || undefined}
              onDismiss={() => dismiss(current.id)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
