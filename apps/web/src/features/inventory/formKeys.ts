import type { KeyboardEvent } from 'react';

/** Text-like controls that take part in the keyboard's "Weiter" order. */
const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), select, textarea';

/** Focuses the first enabled field after `current` (DOM order) inside `form`. */
export function focusNextField(form: HTMLFormElement, current: Element): boolean {
  const fields = Array.from(form.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(
    (field) => !(field as HTMLInputElement).disabled,
  );
  const next = fields.find((field) => current.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING);
  next?.focus();
  return next !== undefined;
}

/**
 * Enter in a text field never submits the form implicitly – only the primary button saves. The
 * keyboard's "Weiter" key (`enterkeyhint="next"`) moves to the next field, "Fertig" closes the
 * keyboard (iPhone: the name field's return key must not create a half-filled item).
 */
export function handleFormEnter(event: KeyboardEvent<HTMLFormElement>): void {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type === 'file') return;
  event.preventDefault();
  if (target.getAttribute('enterkeyhint') === 'next' && focusNextField(event.currentTarget, target)) return;
  target.blur();
}
