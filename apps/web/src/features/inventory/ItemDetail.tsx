import type { InventoryItemDto } from '@homi/shared';
import { UNIT_STEP, numberToDecimalString } from '@homi/shared/core';
import { Button, Icon, ProductImage, QuantityStepper } from '@/components';
import { ITEM_CATEGORY_LABELS, formatCHF, formatNumber, formatQuantity, unitLabelFor } from '@/lib/format';
import { useQuantityQueue } from './hooks';

export interface ItemDetailProps {
  item: InventoryItemDto;
  onEdit: () => void;
  onAddToShopping: () => void;
  addingToShopping: boolean;
  /** "Bearbeiten" waits for outstanding quantity changes to be saved. */
  editPending?: boolean;
}

/**
 * Body of the item details screen (design 05): hero image, name, category tag, large quantity
 * stepper (optimistic, serialised atomic deltas), value card and the two actions.
 */
export function ItemDetail({ item, onEdit, onAddToShopping, addingToShopping, editPending = false }: ItemDetailProps) {
  const quantity = useQuantityQueue(item);
  const step = Number(UNIT_STEP[item.unit]);
  const value = Number(quantity.quantity);

  return (
    <article className="item-detail" aria-labelledby="item-detail-title">
      <ProductImage
        src={item.image?.fullUrl ?? null}
        size="L"
        elevated
        priority
        alt={item.image ? `Foto von ${item.name}` : ''}
        className="item-detail__image"
      />
      <h1 id="item-detail-title" className="item-detail__title">
        {item.name}
      </h1>
      <p className="item-detail__tag">
        <Icon name="tag" size={16} strokeWidth={2.7} />
        <span>{ITEM_CATEGORY_LABELS[item.category]}</span>
      </p>

      <p className="item-detail__label" id="item-detail-quantity">
        Menge
      </p>
      <QuantityStepper
        size="large"
        className="item-detail__stepper"
        label="Menge"
        value={value}
        min={0}
        step={step}
        max={99_999.999}
        formatValue={(next) => formatNumber(numberToDecimalString(next, 3))}
        valueText={(next) => formatQuantity(numberToDecimalString(next, 3), item.unit)}
        onChange={(next) => quantity.setTo(numberToDecimalString(next, 3))}
      />
      <p className="item-detail__unit">{unitLabelFor(quantity.quantity, item.unit)}</p>

      <dl className="homi-card item-detail__values">
        <div className="item-detail__value-row">
          <dt>Preis pro Einheit</dt>
          <dd data-placeholder={item.unitPrice === null || undefined}>
            {item.unitPrice === null ? 'Preis unbekannt' : formatCHF(item.unitPrice)}
          </dd>
        </div>
        <div className="item-detail__value-row item-detail__value-row--total">
          <dt>Gesamtwert</dt>
          <dd data-placeholder={quantity.totalValue === null || undefined} aria-live="polite">
            {quantity.totalValue === null ? '–' : formatCHF(quantity.totalValue)}
          </dd>
        </div>
      </dl>

      <Button fullWidth className="item-detail__edit" loading={editPending} onClick={onEdit}>
        Bearbeiten
      </Button>
      <Button
        variant="plain"
        icon="cart"
        fullWidth
        className="item-detail__shopping"
        loading={addingToShopping}
        onClick={onAddToShopping}
      >
        Zur Einkaufsliste hinzufügen
      </Button>
    </article>
  );
}
