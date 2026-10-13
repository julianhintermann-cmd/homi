import { Link } from 'react-router';
import type { DashboardDto, InventoryItemDto, ShoppingItemDto } from '@homi/shared';
import {
  Button,
  Card,
  EmptyState,
  ListRow,
  ProductImage,
  SectionHeader,
  ShoppingItemRow,
  Skeleton,
  SkeletonList,
  Stat,
} from '@/components';
import { formatCHF, formatNumber, formatOptionalCHF, formatQuantity } from '@/lib/format';
import { paths } from '@/routes/paths';
import { shoppingLinkLabel, shoppingQuantityLabel, tileSrcSet, trendDirection, trendLabel } from './labels';
import './home.css';

/* ────────────────────────── Summary card ────────────────────────── */

export interface HomeSummaryCardProps {
  dashboard: Pick<
    DashboardDto,
    'inventoryValue' | 'weeklyValueDelta' | 'itemCount' | 'openShoppingCount' | 'unpricedItemCount'
  >;
}

/**
 * "Inventarwert" card: value, weekly trend pill (only when ≠ 0), item and shopping counts.
 * Items without a price are not part of the value: a visible "· n ohne Preis" note says so, and
 * when no item has a price the value is "–" instead of a misleading "CHF 0.00".
 */
export function HomeSummaryCard({ dashboard }: HomeSummaryCardProps) {
  const unpriced = dashboard.unpricedItemCount;
  const noPriceAtAll = dashboard.itemCount > 0 && unpriced >= dashboard.itemCount;
  const value = noPriceAtAll ? formatOptionalCHF(null) : formatCHF(dashboard.inventoryValue);
  const trend = trendLabel(dashboard.weeklyValueDelta);
  return (
    <Card className="home-summary" role="group" aria-labelledby="home-summary-label">
      <span className="home-summary__label" data-with-trend={trend ? '' : undefined}>
        <span id="home-summary-label">Inventarwert</span>
        {unpriced > 0 ? (
          <span className="home-summary__note">
            <span aria-hidden="true">{'· '}</span>
            <span className="visually-hidden">, </span>
            {formatNumber(unpriced)}
            <span className="visually-hidden"> Artikel</span> ohne Preis
            <span className="visually-hidden"> nicht eingerechnet</span>
          </span>
        ) : null}
      </span>
      <span className="home-summary__value" data-long={value.length > 14 || undefined}>
        {noPriceAtAll ? (
          <>
            <span aria-hidden="true">{value}</span>
            <span className="visually-hidden">Noch kein Preis erfasst</span>
          </>
        ) : (
          value
        )}
      </span>
      {trend ? (
        <span
          className="home-summary__trend"
          data-direction={trendDirection(dashboard.weeklyValueDelta)}
          title="Veränderung in den letzten 7 Tagen"
        >
          {trend}
          <span className="visually-hidden"> in den letzten 7 Tagen</span>
        </span>
      ) : null}
      <div className="home-summary__separator" aria-hidden="true" />
      <div className="home-summary__stats">
        <Stat className="home-summary__stat" value={formatNumber(dashboard.itemCount)} label="Artikel im Haushalt" />
        <Stat
          className="home-summary__stat"
          value={`${formatNumber(dashboard.openShoppingCount)} Artikel`}
          label="Auf der Einkaufsliste"
        />
      </div>
    </Card>
  );
}

/* ────────────────────────── Inventory tiles ────────────────────────── */

export interface HomeInventorySectionProps {
  items: readonly InventoryItemDto[];
  onAddItem: () => void;
}

/** "Dein Inventar": the 3 most recently changed items as 108 px tiles, or a compact empty state. */
export function HomeInventorySection({ items, onAddItem }: HomeInventorySectionProps) {
  return (
    <section className="home-section" aria-labelledby="home-inventory-title">
      <SectionHeader
        id="home-inventory-title"
        title="Dein Inventar"
        action={
          items.length > 0 ? (
            <Link to={paths.inventory} className="home-section-link">
              Alle ansehen
            </Link>
          ) : undefined
        }
      />
      {items.length > 0 ? (
        <ul className="home-tiles" role="list">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={paths.inventoryItem(item.id)} className="home-tile">
                <ProductImage size="M" src={item.image?.thumbUrl ?? null} srcSet={tileSrcSet(item)} />
                <span className="home-tile__name">{item.name}</span>
                <span className="home-tile__quantity">{formatQuantity(item.quantity, item.unit)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        // Compact (≈ 140 px, the height of the tile row) so the shopping card stays where it is in
        // the populated layout – above the tab bar on first paint.
        <Card className="home-block">
          <EmptyState
            className="home-empty"
            icon="tray"
            title="Noch keine Artikel"
            message="Erfasse, was ihr zu Hause habt."
            action={
              <Button size="medium" onClick={onAddItem}>
                Artikel hinzufügen
              </Button>
            }
          />
        </Card>
      )}
    </section>
  );
}

/* ────────────────────────── Shopping preview ────────────────────────── */

export interface HomeShoppingSectionProps {
  items: readonly ShoppingItemDto[];
  openCount: number;
  onComplete: (shoppingItemId: string) => void;
  /** Tap on a row (outside its checkbox): opens the shopping list (design: card → 03 Einkaufsliste). */
  onOpenList: () => void;
}

/**
 * "Für den nächsten Einkauf": up to 3 open items. Only the checkbox completes an item; the rest of
 * the row opens the shopping list (a tap while scrolling must not tick anything off).
 */
export function HomeShoppingSection({ items, openCount, onComplete, onOpenList }: HomeShoppingSectionProps) {
  return (
    <section className="home-section" aria-labelledby="home-shopping-title">
      <SectionHeader
        id="home-shopping-title"
        title="Für den nächsten Einkauf"
        action={
          <Link
            to={paths.shopping}
            className="home-section-link"
            aria-label={openCount > 0 ? `Alle ${openCount} offenen Artikel ansehen` : 'Einkaufsliste öffnen'}
          >
            {shoppingLinkLabel(openCount)}
          </Link>
        }
      />
      <ul className="homi-card home-shopping" role="list">
        {items.length > 0 ? (
          items.map((item) => (
            <ShoppingItemRow
              key={item.id}
              name={item.name}
              quantity={shoppingQuantityLabel(item)}
              completed={item.completed}
              disabled={item.completed}
              onCompletedChange={(completed) => {
                if (completed) onComplete(item.id);
              }}
              onPress={onOpenList}
              pressLabel={`${item.name} in der Einkaufsliste öffnen`}
            />
          ))
        ) : (
          // A status line, not an action: neutral tile + secondary text (the accent "action" style
          // looked tappable). The header link opens the list.
          <ListRow variant="settings" icon="checkCircle" title="Alles erledigt!" className="home-shopping__done" />
        )}
      </ul>
    </section>
  );
}

/* ────────────────────────── Loading state ────────────────────────── */

/** Placeholders with the real geometry (no layout jump when the dashboard arrives). */
export function HomeSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Übersicht wird geladen …">
      <Card padded className="home-skeleton-summary">
        <Skeleton shape="text" width={80} height={13} />
        <Skeleton shape="text" width={180} height={28} />
        <div className="home-skeleton-summary__row">
          <Skeleton shape="text" width="60%" height={18} />
          <Skeleton shape="text" width="60%" height={18} />
        </div>
      </Card>
      <div className="home-section">
        <div className="home-skeleton-header">
          <Skeleton shape="text" width={140} height={20} />
        </div>
        <div className="home-tiles">
          {[0, 1, 2].map((index) => (
            <div key={index} className="home-skeleton-tile">
              <Skeleton width={108} height={108} radius="var(--radius-lg)" />
              <Skeleton shape="text" width={64} height={13} />
              <Skeleton shape="text" width={52} height={11} />
            </div>
          ))}
        </div>
      </div>
      <div className="home-section">
        <div className="home-skeleton-header">
          <Skeleton shape="text" width={220} height={20} />
        </div>
        <SkeletonList variant="shopping" rows={3} className="home-shopping" label="Einkaufsliste wird geladen …" />
      </div>
    </div>
  );
}
