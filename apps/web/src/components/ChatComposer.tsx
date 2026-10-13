import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '@/icons/Icon';
import { haptic } from '@/lib/haptics';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

/** Rendered composer height, mirrored for screens that pad their content above it. */
export const COMPOSER_HEIGHT_VAR = '--composer-height';
/** Up to ~5 lines of `body` text (22.1 px) plus the 21 px vertical padding. */
const MAX_FIELD_HEIGHT = 132;

export interface ChatComposerProps {
  /** Controlled value (omit for an uncontrolled composer that clears itself after sending). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Called with the trimmed text. */
  onSend: (text: string) => void;
  /** Glass "+" button (attachments / share an item). Hidden when omitted. */
  onAttach?: () => void;
  /** Mic button; without a handler the mic is a decorative glyph like in the design. */
  onMic?: () => void;
  /** Hide the mic entirely (e.g. dictation is not supported by the browser). */
  hideMic?: boolean;
  /** Dictation is running: accent mic, `aria-pressed`. */
  micActive?: boolean;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  /** Accessible label of the text field. Default "Nachricht". */
  label?: string;
  /** Render in normal flow instead of fixed above the keyboard/home indicator (gallery). */
  inline?: boolean;
  className?: string;
}

/**
 * Message composer (design 08 / 08c): glass attachment button + glass capsule field (309 × 44,
 * r 22) with a mic that turns into a 34 px accent send button once there is text. The field
 * grows up to ~5 lines. Fixed 4 px above the home indicator, or above the on-screen keyboard
 * via `--keyboard-inset`.
 */
export function ChatComposer({
  value,
  defaultValue = '',
  onValueChange,
  onSend,
  onAttach,
  onMic,
  hideMic = false,
  micActive = false,
  placeholder = 'Nachricht',
  disabled = false,
  maxLength = 4000,
  label = 'Nachricht',
  inline = false,
  className,
}: ChatComposerProps) {
  const controlled = value !== undefined;
  const [innerValue, setInnerValue] = useState(defaultValue);
  const text = controlled ? value : innerValue;
  const hasText = text.trim().length > 0;
  const rootRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow: measure once per value change (no animation, no read/write loop).
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, MAX_FIELD_HEIGHT)}px`;
    field.style.overflowY = field.scrollHeight > MAX_FIELD_HEIGHT ? 'auto' : 'hidden';
  }, [text]);

  // Expose the composer height so the message list can keep its last message visible.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || inline || typeof ResizeObserver === 'undefined') return undefined;
    const html = document.documentElement;
    const observer = new ResizeObserver(() => html.style.setProperty(COMPOSER_HEIGHT_VAR, `${root.offsetHeight}px`));
    observer.observe(root);
    return () => {
      observer.disconnect();
      html.style.removeProperty(COMPOSER_HEIGHT_VAR);
    };
  }, [inline]);

  const update = (next: string): void => {
    if (!controlled) setInnerValue(next);
    onValueChange?.(next);
  };

  const send = (): void => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    haptic('light');
    onSend(trimmed);
    if (!controlled) setInnerValue('');
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Desktop: Enter sends, Shift+Enter breaks the line. Touch keyboards keep Return = newline.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(pointer: fine)').matches) return;
    event.preventDefault();
    send();
  };

  return (
    <form
      ref={rootRef}
      className={cx('homi-composer', className)}
      data-inline={inline || undefined}
      data-has-text={hasText || undefined}
      onSubmit={onSubmit}
      data-no-swipe
    >
      {onAttach ? (
        <button
          type="button"
          className="glass glass--pressable homi-glass-button homi-composer__attach"
          aria-label="Anhang hinzufügen"
          title="Anhang hinzufügen"
          onClick={onAttach}
          disabled={disabled}
        >
          <Icon name="plus" size={22} strokeWidth={2.18} />
        </button>
      ) : null}
      <div className="glass homi-composer__field">
        <textarea
          ref={fieldRef}
          className="homi-composer__input"
          rows={1}
          value={text}
          placeholder={placeholder}
          aria-label={label}
          maxLength={maxLength}
          disabled={disabled}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(event) => update(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {hasText ? (
          <button
            type="submit"
            className="homi-composer__send"
            aria-label="Senden"
            title="Senden"
            disabled={disabled}
            // Keep the keyboard open: do not move focus away from the field.
            onPointerDown={(event) => event.preventDefault()}
          >
            <Icon name="arrowUp" size={20} strokeWidth={2.76} />
          </button>
        ) : hideMic ? null : onMic ? (
          <button
            type="button"
            className="homi-composer__mic"
            aria-label={micActive ? 'Diktat beenden' : 'Diktieren'}
            title={micActive ? 'Diktat beenden' : 'Diktieren'}
            aria-pressed={micActive}
            data-active={micActive || undefined}
            onClick={onMic}
            disabled={disabled}
          >
            <Icon name="mic" size={24} strokeWidth={1.8} />
          </button>
        ) : (
          <span className="homi-composer__mic" aria-hidden="true">
            <Icon name="mic" size={24} strokeWidth={1.8} />
          </span>
        )}
      </div>
    </form>
  );
}
