import { useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Spinner } from './Button';
import { Portal } from './Portal';
import { useModalLayer } from './useModalLayer';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export interface ConfirmDialogProps {
  open: boolean;
  /** `headline` title, e.g. "Artikel löschen?". */
  title: string;
  /** `footnote` label-secondary message, e.g. "«Olivenöl» wird aus dem Inventar … entfernt." */
  message?: ReactNode;
  /** Default "Löschen" for destructive, "OK" otherwise. */
  confirmLabel?: string;
  /** Default "Abbrechen". */
  cancelLabel?: string;
  /** `destructive` (default): destructive-soft confirm button; `default`: primary. */
  tone?: 'destructive' | 'default';
  onConfirm: () => void;
  /** Cancel button, dim tap and Escape. */
  onCancel: () => void;
  /** Confirm in progress: spinner, buttons disabled. */
  busy?: boolean;
  /** Render only the alert panel in place – no portal, dim or focus trap (design gallery). */
  inline?: boolean;
}

/**
 * Freegma "Confirmation Dialog": 300 px alert (r 34, surface, shadow 0/20/60 22 %) centred over a
 * 35 % dim; title, message (244 px column) and two 128 × 50 capsule buttons. `alertdialog`
 * semantics, focus starts on the safe choice (cancel), Escape cancels.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  if (props.inline) return <DialogPanelContent {...props} />;
  return (
    <AnimatePresence>{props.open ? <ConfirmDialogPanel key="confirm-dialog" {...props} /> : null}</AnimatePresence>
  );
}

function ConfirmDialogPanel({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Abbrechen',
  tone = 'destructive',
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const reducedMotion = useReducedMotion() ?? false;
  useModalLayer({ container: panelRef, initialFocus: cancelRef, onEscape: () => (busy ? undefined : onCancel()) });

  const fade = { duration: reducedMotion ? 0.01 : 0.2, ease: 'easeOut' } as const;
  return (
    <Portal>
      <div className="homi-dialog-layer">
        <motion.div
          className="homi-overlay-dim"
          data-dim="dialog"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
          onClick={() => (busy ? undefined : onCancel())}
        />
        <motion.div
          ref={panelRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={message ? messageId : undefined}
          tabIndex={-1}
          className="homi-dialog"
          initial={{ opacity: 0, scale: reducedMotion ? 1 : 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.98 }}
          transition={fade}
        >
          <h2 id={titleId} className="homi-dialog__title">
            {title}
          </h2>
          {message ? (
            <p id={messageId} className="homi-dialog__message">
              {message}
            </p>
          ) : null}
          <div className="homi-dialog__actions">
            <button
              ref={cancelRef}
              type="button"
              className="homi-dialog__button"
              data-role="cancel"
              onClick={onCancel}
              disabled={busy}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={cx('homi-dialog__button', busy && 'homi-dialog__button--busy')}
              data-role="confirm"
              data-tone={tone}
              onClick={onConfirm}
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {busy ? <Spinner size={18} /> : (confirmLabel ?? (tone === 'destructive' ? 'Löschen' : 'OK'))}
            </button>
          </div>
        </motion.div>
      </div>
    </Portal>
  );
}

/** Static alert panel (no portal, dim, motion or focus trap) – used by `inline`. */
function DialogPanelContent({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Abbrechen',
  tone = 'destructive',
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
      className="homi-dialog"
      data-inline
    >
      <h2 id={titleId} className="homi-dialog__title">
        {title}
      </h2>
      {message ? (
        <p id={messageId} className="homi-dialog__message">
          {message}
        </p>
      ) : null}
      <div className="homi-dialog__actions">
        <button type="button" className="homi-dialog__button" data-role="cancel" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className="homi-dialog__button"
          data-role="confirm"
          data-tone={tone}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? <Spinner size={18} /> : (confirmLabel ?? (tone === 'destructive' ? 'Löschen' : 'OK'))}
        </button>
      </div>
    </div>
  );
}
