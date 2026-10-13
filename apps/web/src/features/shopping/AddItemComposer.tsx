import {
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { UNIT_VALUES } from '@homi/shared/core';
import { finalizePrice, Icon, sanitizePriceInput, type IconName } from '@/components';
import { UNIT_LABELS } from '@/lib/format';
import { afterPointerRelease } from '@/lib/pointerRelease';
import {
  EMPTY_DRAFT,
  parseItemDraft,
  parsePriceDraft,
  parseQuantityDraft,
  priceFieldName,
  pillPriceLabel,
  pricePerUnitDiffers,
  quantityLabel,
  sanitizeQuantityInput,
  type DraftField,
  type ItemDraft,
  type ItemDraftValues,
} from './draft';

export interface AddItemComposerProps {
  /** The add row sits under the progress bar (18 px gap) instead of the subtitle (24 px). */
  afterProgress: boolean;
  /**
   * Adds the item (optimistically). `restore` puts the text back when the request fails and the
   * user has not started typing the next item yet.
   */
  onAdd: (values: ItemDraftValues, restore: () => void) => void;
}

type Pill = 'quantity' | 'price';

function isEmptyDraft(draft: ItemDraft): boolean {
  return draft.name === '' && draft.quantityText === '' && draft.priceText === '';
}

/** Keeps the focus where it is when a pill button is pressed (iOS would blur the input first). */
function keepFocus(event: MouseEvent): void {
  event.preventDefault();
}

/**
 * Reminders-style add row (design 03 → 18): tap focuses the input, Return adds the item and keeps
 * the focus for the next one. While active, two optional pills "Menge" (amount + unit picker) and
 * "Preis" (CHF) appear underneath; a name alone is enough to add an item.
 */
export function AddItemComposer({ afterProgress, onAdd }: AddItemComposerProps) {
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [focusWithin, setFocusWithin] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [editing, setEditing] = useState<Pill | null>(null);
  const [error, setError] = useState<{ field: DraftField; message: string } | null>(null);
  const rootRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const expanded = focusWithin || !isEmptyDraft(draft);

  const update = (patch: Partial<ItemDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const submit = (): void => {
    const parsed = parseItemDraft(draft);
    if (!parsed.ok) {
      if (parsed.field === 'name' && draft.name.trim() === '') {
        // Nothing to add yet – back to the name.
        setEditing(null);
        nameRef.current?.focus();
        return;
      }
      setError({ field: parsed.field, message: parsed.error });
      return;
    }
    const snapshot = draft;
    onAdd(parsed.values, () => setDraft((current) => (isEmptyDraft(current) ? snapshot : current)));
    // Keep the chosen unit for rapid entry; clear the rest and stay in the name field.
    setDraft({ ...EMPTY_DRAFT, unit: draft.unit });
    setEditing(null);
    setError(null);
    nameRef.current?.focus();
  };

  const onEnter = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  const onBlur = (event: FocusEvent<HTMLFormElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    // iOS does not focus tapped buttons (relatedTarget = null): decide after the tap settled. The row below the field
    // collapses with the focus, so wait for the pointer release – otherwise the tapped control moves away between
    // pointerdown and pointerup and its click is lost.
    afterPointerRelease(() => {
      if (rootRef.current?.contains(document.activeElement)) return;
      setFocusWithin(false);
      setEditing(null);
    });
  };

  const finishPill = (): void => {
    setDraft((current) => ({ ...current, priceText: current.priceText ? finalizePrice(current.priceText) : '' }));
    setEditing(null);
  };

  const quantity = parseQuantityDraft(draft.quantityText);
  const price = parsePriceDraft(draft.priceText);
  const quantityValue = quantity.ok ? quantityLabel(quantity.value, draft.unit) : draft.quantityText;
  // The price is stored per unit (`unitPrice`): with a quantity it is the price per that unit,
  // which the editing pill shows as "CHF 2.40 / kg", the closed pill as soon as the quantity is
  // not 1 ("CHF 3.20 / g" for 250 g) and the accessible names always spell out.
  const quantityValueOrNull = quantity.ok ? quantity.value : null;
  const priceValue = price.ok ? pillPriceLabel(price.value, quantityValueOrNull, draft.unit) : draft.priceText;
  // "CHF 3.20 / g" needs the room of the word "Preis" (the tag icon and the accessible name stay).
  const priceShowsUnit = price.ok && price.value !== null && pricePerUnitDiffers(quantityValueOrNull, draft.unit);
  const hasQuantity = draft.quantityText !== '' && !(quantity.ok && quantity.value === null);
  const priceName = priceFieldName(hasQuantity, draft.unit);

  return (
    <form
      ref={rootRef}
      className="shopping-composer"
      data-after-progress={afterProgress || undefined}
      aria-label="Neuer Artikel"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onFocus={() => setFocusWithin(true)}
      onBlur={onBlur}
    >
      <label
        className="shopping-add-row"
        data-focused={nameFocused || undefined}
        data-invalid={error?.field === 'name' || undefined}
      >
        <span className="shopping-add-row__plus" aria-hidden="true">
          <Icon name="plus" size={18} strokeWidth={3.2} />
        </span>
        <input
          ref={nameRef}
          className="shopping-add-row__input"
          type="text"
          name="name"
          value={draft.name}
          placeholder="Artikel hinzufügen"
          aria-label="Artikel hinzufügen"
          aria-invalid={error?.field === 'name' || undefined}
          aria-describedby={error ? 'shopping-composer-error' : undefined}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="enter"
          maxLength={80}
          onChange={(event) => update({ name: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setDraft(EMPTY_DRAFT);
              setError(null);
              event.currentTarget.blur();
              return;
            }
            onEnter(event);
          }}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setNameFocused(false)}
        />
      </label>

      {expanded ? (
        <div className="shopping-pills" role="group" aria-label="Optionale Angaben">
          {editing === 'quantity' ? (
            <EditingPill icon="stack" label="Menge" invalid={error?.field === 'quantity'} onDone={finishPill}>
              <input
                className="shopping-pill__input"
                type="text"
                inputMode="decimal"
                enterKeyHint="enter"
                autoComplete="off"
                placeholder="Menge"
                aria-label="Menge"
                value={draft.quantityText}
                onChange={(event) =>
                  update({ quantityText: sanitizeQuantityInput(event.target.value, draft.quantityText) })
                }
                onKeyDown={onEnter}
              />
              <span className="shopping-pill__unit">
                {UNIT_LABELS[draft.unit].short}
                <Icon name="chevD" size={12} weight={2} className="shopping-pill__unit-chevron" />
                <select
                  className="shopping-pill__select"
                  aria-label="Einheit"
                  value={draft.unit}
                  onChange={(event) => {
                    const unit = UNIT_VALUES.find((value) => value === event.target.value);
                    if (unit) update({ unit });
                  }}
                >
                  {UNIT_VALUES.map((unit) => (
                    <option key={unit} value={unit}>
                      {UNIT_LABELS[unit].name}
                    </option>
                  ))}
                </select>
              </span>
            </EditingPill>
          ) : (
            <button
              type="button"
              className="shopping-pill"
              data-invalid={error?.field === 'quantity' || undefined}
              aria-label={quantityValue ? `Menge: ${quantityValue}` : 'Menge angeben'}
              onMouseDown={keepFocus}
              onClick={() => setEditing('quantity')}
            >
              <PillContent icon="stack" label="Menge" value={quantityValue} />
            </button>
          )}

          {editing === 'price' ? (
            <EditingPill icon="tag" label="Preis" invalid={error?.field === 'unitPrice'} onDone={finishPill}>
              <span className="shopping-pill__prefix">CHF</span>
              <input
                className="shopping-pill__input"
                type="text"
                inputMode="decimal"
                enterKeyHint="enter"
                autoComplete="off"
                placeholder="0.00"
                aria-label={`${priceName} in CHF`}
                value={draft.priceText}
                onChange={(event) => update({ priceText: sanitizePriceInput(event.target.value, draft.priceText) })}
                onKeyDown={onEnter}
              />
              {hasQuantity ? (
                <span className="shopping-pill__suffix" aria-hidden="true">
                  / {UNIT_LABELS[draft.unit].short}
                </span>
              ) : null}
            </EditingPill>
          ) : (
            <button
              type="button"
              className="shopping-pill"
              data-invalid={error?.field === 'unitPrice' || undefined}
              aria-label={priceValue ? `${priceName}: ${priceValue}` : `${priceName} angeben`}
              onMouseDown={keepFocus}
              onClick={() => setEditing('price')}
            >
              <PillContent icon="tag" label={priceShowsUnit ? null : 'Preis'} value={priceValue} />
            </button>
          )}
        </div>
      ) : null}

      {error ? (
        <p id="shopping-composer-error" className="shopping-composer__error" role="alert">
          {error.message}
        </p>
      ) : null}
    </form>
  );
}

function PillContent({ icon, label, value }: { icon: IconName; label: string | null; value: string }) {
  return (
    <>
      <Icon name={icon} size={20} strokeWidth={2.16} className="shopping-pill__icon" />
      {label === null ? null : <span className="shopping-pill__label">{label}</span>}
      <span className="shopping-pill__value">{value}</span>
    </>
  );
}

interface EditingPillProps {
  icon: IconName;
  label: string;
  invalid: boolean;
  onDone: () => void;
  children: ReactNode;
}

/** A pill in edit mode: focuses its first input on mount and ends editing when focus leaves it. */
function EditingPill({ icon, label, invalid, onDone, children }: EditingPillProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.querySelector('input')?.focus();
  }, []);
  return (
    <div
      ref={ref}
      className="shopping-pill"
      data-editing
      data-invalid={invalid || undefined}
      role="group"
      aria-label={label}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && ref.current?.contains(next)) return;
        onDone();
      }}
    >
      <Icon name={icon} size={20} strokeWidth={2.16} className="shopping-pill__icon" />
      {children}
    </div>
  );
}
