import type { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/icons/Icon';
import type { ContextMenuItem } from './ContextMenu';
import { ProductImage } from './ProductImage';
import { useRowMenu } from './useRowMenu';
import { cx, enableActiveStates } from './utils';

enableActiveStates();

export interface InventoryItemRowProps {
  name: string;
  /** "Küche · 24 Stück" */
  subtitle: string;
  /** Total value, already formatted ("CHF 12.96"); `null` for unknown prices (never "CHF 0.00"). */
  price: string | null;
  /** Unit price ("CHF 0.54 / Stk."); `null` when unknown. */
  unitPrice: string | null;
  /** Thumbnail URL; `null` shows the placeholder glyph. */
  imageUrl?: string | null;
  /** Navigation target (item details). */
  to?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  /** Long-press / right-click context menu (design 16: Bearbeiten, Zur Einkaufsliste, Teilen, Löschen). */
  menuItems?: readonly ContextMenuItem[];
  /** Freshly added row: accent 8 % highlight that fades out (design 14). */
  highlighted?: boolean;
  /** Show the pressed state permanently (gallery only). */
  forcePressed?: boolean;
  /** Root wrapper: `li` (inside a list card, default) or `div`. */
  wrapper?: 'li' | 'div';
  className?: string;
}

/**
 * Freegma "Inventory Row" (353 × 76): 52 px image (r 12) at (14, 12), `headline` name and
 * `footnote` subtitle at x 80, right-aligned price (`subhead-medium`) and unit price to x 315,
 * chevron 18 px label-tertiary. Pressed = surface-muted. Separator inset 80.
 */
export function InventoryItemRow({
  name,
  subtitle,
  price,
  unitPrice,
  imageUrl,
  to,
  onClick,
  menuItems,
  highlighted = false,
  forcePressed = false,
  wrapper = 'li',
  className,
}: InventoryItemRowProps) {
  const content = (
    <InventoryRowContent name={name} subtitle={subtitle} price={price} unitPrice={unitPrice} imageUrl={imageUrl} />
  );
  const { handlers, menu } = useRowMenu<HTMLElement>(
    menuItems,
    () => <div className="homi-inventory-row homi-inventory-row--preview">{content}</div>,
    name,
  );

  // One spoken phrase instead of the run-together column texts.
  const accessibleName = [name, subtitle, price, unitPrice].filter(Boolean).join(', ');
  const rowProps = {
    'aria-label': accessibleName,
    className: cx('homi-inventory-row', className),
    'data-highlighted': highlighted || undefined,
    'data-pressed': forcePressed || undefined,
    'data-interactive': to !== undefined || onClick !== undefined || undefined,
    ...handlers,
  };

  let row: ReactNode;
  if (to !== undefined) {
    row = (
      <Link to={to} onClick={onClick} {...rowProps}>
        {content}
      </Link>
    );
  } else if (onClick) {
    row = (
      <button type="button" onClick={onClick} {...rowProps}>
        {content}
      </button>
    );
  } else {
    row = (
      <div {...rowProps} aria-label={undefined} tabIndex={menuItems?.length ? 0 : undefined}>
        {content}
      </div>
    );
  }

  const Wrapper = wrapper;
  return (
    <Wrapper className="homi-row-item">
      {row}
      {menu}
    </Wrapper>
  );
}

function InventoryRowContent({
  name,
  subtitle,
  price,
  unitPrice,
  imageUrl,
}: Pick<InventoryItemRowProps, 'name' | 'subtitle' | 'price' | 'unitPrice' | 'imageUrl'>) {
  return (
    <>
      <ProductImage src={imageUrl} size="S" className="homi-inventory-row__image" />
      {/* Two independent lines: the name only competes with the price, the subtitle only with the unit price. */}
      <span className="homi-inventory-row__main">
        <span className="homi-inventory-row__line">
          <span className="homi-inventory-row__name">{name}</span>
          {price !== null ? <span className="homi-inventory-row__price">{price}</span> : null}
        </span>
        <span className="homi-inventory-row__line homi-inventory-row__line--secondary">
          <span className="homi-inventory-row__subtitle">{subtitle}</span>
          {unitPrice !== null ? <span className="homi-inventory-row__unit-price">{unitPrice}</span> : null}
        </span>
      </span>
      <Icon name="chevR" size={18} strokeWidth={2.67} className="homi-inventory-row__chevron" />
    </>
  );
}
