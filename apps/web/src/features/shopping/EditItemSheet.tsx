import { useState, type FormEvent } from 'react';
import {
  numberToDecimalString,
  ShoppingItemNameSchema,
  UNIT_STEP,
  UNIT_VALUES,
  type ShoppingItemDto,
  type Unit,
} from '@homi/shared';
import {
  Button,
  ConfirmDialog,
  FormCard,
  FormRow,
  GlassButton,
  HomiBottomSheet,
  PriceField,
  QuantityStepper,
  SelectRow,
  SheetHeader,
  TextField,
} from '@/components';
import { formatNumber, UNIT_LABELS } from '@/lib/format';
import { parsePriceDraft } from './draft';
import type { ItemFields } from './listModel';

export interface EditItemSheetProps {
  open: boolean;
  /** The item being edited (kept while the sheet animates out). */
  item: ShoppingItemDto | null;
  onClose: () => void;
  /** Only the changed fields. */
  onSave: (item: ShoppingItemDto, fields: Partial<ItemFields>) => void;
  onDelete: (item: ShoppingItemDto) => void;
}

/**
 * Edit sheet of a shopping item (page sheet like design 07): name, Menge (stepper, "–" = no
 * quantity) + Einheit, Preis pro Einheit, glass delete button with confirmation. Asks before
 * discarding unsaved changes.
 */
export function EditItemSheet({ open, item, onClose, onSave, onDelete }: EditItemSheetProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <HomiBottomSheet open={open && item !== null} onClose={onClose} dirty={dirty} aria-label="Artikel bearbeiten">
      {item ? (
        <EditItemForm
          key={item.id}
          item={item}
          onDirtyChange={setDirty}
          onSave={(fields) => {
            setDirty(false);
            onSave(item, fields);
            onClose();
          }}
          onDelete={() => {
            setDirty(false);
            onDelete(item);
            onClose();
          }}
        />
      ) : null}
    </HomiBottomSheet>
  );
}

const UNIT_OPTIONS = UNIT_VALUES.map((unit) => ({ value: unit, label: UNIT_LABELS[unit].name }));

interface EditItemFormProps {
  item: ShoppingItemDto;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (fields: Partial<ItemFields>) => void;
  onDelete: () => void;
}

function EditItemForm({ item, onDirtyChange, onSave, onDelete }: EditItemFormProps) {
  const initialQuantity = item.quantity === null ? 0 : Number(item.quantity);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [unit, setUnit] = useState<Unit>(item.unit ?? 'STUECK');
  const [price, setPrice] = useState(item.unitPrice ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const markDirty = (): void => onDirtyChange(true);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const parsedName = ShoppingItemNameSchema.safeParse(name);
    const parsedPrice = parsePriceDraft(price);
    setNameError(parsedName.success ? null : (parsedName.error.issues[0]?.message ?? 'Ungültiger Name.'));
    setPriceError(parsedPrice.ok ? null : parsedPrice.error);
    if (!parsedName.success || !parsedPrice.ok) return;

    const nextQuantity = quantity > 0 ? numberToDecimalString(quantity, 3) : null;
    const nextUnit = nextQuantity === null ? null : unit;
    const fields: Partial<ItemFields> = {};
    if (parsedName.data !== item.name) fields.name = parsedName.data;
    if (nextQuantity !== item.quantity) fields.quantity = nextQuantity;
    if (nextUnit !== item.unit) fields.unit = nextUnit;
    if (parsedPrice.value !== item.unitPrice) fields.unitPrice = parsedPrice.value;
    onSave(fields);
  };

  return (
    <form className="shopping-edit" onSubmit={submit} noValidate>
      <SheetHeader
        title="Artikel bearbeiten"
        trailing={
          <GlassButton
            icon="trash"
            size="sheet"
            tone="destructive"
            label="Artikel löschen"
            onClick={() => setConfirmDelete(true)}
          />
        }
      />
      <TextField
        label="Artikelname"
        value={name}
        maxLength={80}
        autoComplete="off"
        enterKeyHint="done"
        error={nameError}
        onChange={(event) => {
          setName(event.target.value);
          setNameError(null);
          markDirty();
        }}
      />
      <FormCard aria-label="Menge">
        <FormRow label="Menge">
          <QuantityStepper
            value={quantity}
            min={0}
            max={99_999}
            step={Number(UNIT_STEP[unit])}
            label="Menge"
            formatValue={(value) => (value > 0 ? formatNumber(value) : '–')}
            valueText={(value) => (value > 0 ? `${formatNumber(value)} ${UNIT_LABELS[unit].plural}` : 'keine Menge')}
            onChange={(value) => {
              setQuantity(value);
              markDirty();
            }}
          />
        </FormRow>
        <SelectRow
          variant="inset"
          label="Einheit"
          value={unit}
          options={UNIT_OPTIONS}
          onValueChange={(value) => {
            setUnit(value);
            markDirty();
          }}
        />
      </FormCard>
      <PriceField
        value={price}
        error={priceError}
        onValueChange={(value) => {
          setPrice(value);
          setPriceError(null);
          markDirty();
        }}
      />
      <div className="shopping-edit__actions">
        <Button type="submit" fullWidth>
          Änderungen sichern
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Artikel löschen?"
        message={`«${item.name}» wird von der Einkaufsliste entfernt.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
      />
    </form>
  );
}
