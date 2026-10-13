import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  QuantityInputSchema,
  ShoppingItemNameSchema,
  UNIT_VALUES,
  shoppingItemMessageTitle,
  type ShoppingItemMessageMeta,
  type Unit,
} from '@homi/shared';
import { createShoppingItem } from '@/api/chat';
import { queryKeys } from '@/api/queryKeys';
import { Button, HomiBottomSheet, SelectRow, TextField, type SelectOption } from '@/components';
import { UNIT_LABELS } from '@/lib/format';
import { sendChatMessage } from './delivery';

export interface ShoppingItemSheetProps {
  open: boolean;
  onClose: () => void;
  householdId: string;
  conversationId: string;
}

const UNIT_OPTIONS: readonly SelectOption<Unit>[] = UNIT_VALUES.map((unit) => ({
  value: unit,
  label: UNIT_LABELS[unit].name,
}));

interface FieldErrors {
  name?: string;
  quantity?: string;
  form?: string;
}

/**
 * Composer "+" → "Zur Einkaufsliste hinzufügen": creates the shopping item
 * (`POST /households/:hid/shopping/items`) and then shares it in the chat as a `SHOPPING_ITEM`
 * message (card "Milch · 2 Liter / Zur Einkaufsliste hinzugefügt").
 */
export function ShoppingItemSheet({ open, onClose, householdId, conversationId }: ShoppingItemSheetProps) {
  const client = useQueryClient();
  const formId = useId();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<Unit | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const dirty = name.trim() !== '' || quantity.trim() !== '' || unit !== null;

  // The keyboard opening (or resizing) after a field got focus: scroll that field clear of it
  // once --keyboard-inset is applied (next frame) – matters when the sheet content has to scroll.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return undefined;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const active = document.activeElement;
          if (active instanceof HTMLElement && active.closest('.chat-item-sheet') && active.matches('input, select')) {
            active.scrollIntoView({ block: 'nearest' });
          }
        });
      });
    };
    viewport.addEventListener('resize', reveal);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', reveal);
    };
  }, [open]);

  const reset = () => {
    setName('');
    setQuantity('');
    setUnit(null);
    setErrors({});
  };

  const create = useMutation({
    mutationFn: (input: { name: string; quantity: string | null; unit: Unit | null }) =>
      createShoppingItem(householdId, input),
    onSuccess: (item) => {
      void client.invalidateQueries({ queryKey: queryKeys.shopping(householdId) });
      void client.invalidateQueries({ queryKey: queryKeys.dashboard(householdId) });
      const meta: ShoppingItemMessageMeta = {
        shoppingItemId: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
      };
      sendChatMessage(client, {
        householdId,
        conversationId,
        kind: 'SHOPPING_ITEM',
        content: shoppingItemMessageTitle(meta),
        shoppingItem: meta,
      });
      reset();
      onClose();
    },
    onError: (error) => {
      setErrors({ form: error.message || 'Der Artikel konnte nicht hinzugefügt werden.' });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (create.isPending) return;
    const parsedName = ShoppingItemNameSchema.safeParse(name);
    const parsedQuantity = quantity.trim() ? QuantityInputSchema.safeParse(quantity) : null;
    const next: FieldErrors = {};
    if (!parsedName.success) next.name = parsedName.error.issues[0]?.message ?? 'Bitte gib einen Namen ein.';
    if (parsedQuantity && !parsedQuantity.success) {
      next.quantity = parsedQuantity.error.issues[0]?.message ?? 'Bitte gib eine gültige Menge ein.';
    }
    setErrors(next);
    if (!parsedName.success || (parsedQuantity && !parsedQuantity.success)) return;
    const amount = parsedQuantity?.success ? parsedQuantity.data : null;
    create.mutate({ name: parsedName.data, quantity: amount, unit: amount ? unit : null });
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <HomiBottomSheet
      open={open}
      onClose={close}
      variant="action"
      className="chat-item-sheet"
      title="Zur Einkaufsliste hinzufügen"
      cancelLabel="Abbrechen"
      dirty={dirty && !create.isPending}
    >
      <form id={formId} className="chat-item-form" onSubmit={submit} noValidate>
        <TextField
          label="Artikel"
          placeholder="z. B. Milch"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          maxLength={80}
          autoComplete="off"
          enterKeyHint="next"
        />
        <TextField
          label="Menge (optional)"
          placeholder="z. B. 2"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          error={errors.quantity}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
        />
        <SelectRow
          label="Einheit"
          value={unit}
          options={UNIT_OPTIONS}
          onValueChange={(value) => setUnit(value)}
          placeholder="Keine"
          disabled={!quantity.trim()}
        />
        {errors.form ? (
          <p className="homi-field__message" data-tone="error" role="alert">
            {errors.form}
          </p>
        ) : null}
        <Button type="submit" fullWidth loading={create.isPending}>
          Hinzufügen
        </Button>
      </form>
    </HomiBottomSheet>
  );
}
