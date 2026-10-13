import { decimalSign } from '@homi/shared/core';
import type { InventoryItemDto, ShoppingItemDto } from '@homi/shared';
import { formatCHFDelta, formatNumber, formatQuantity } from '@/lib/format';

/** Weekly trend pill: "+ CHF 42.80" / "− CHF 5.00" (typographic minus); `null` when unchanged. */
export function trendLabel(weeklyValueDelta: string): string | null {
  const sign = decimalSign(weeklyValueDelta);
  if (sign === 0) return null;
  const label = formatCHFDelta(weeklyValueDelta);
  return sign < 0 ? label.replace(/^- /, '− ') : label;
}

export function trendDirection(weeklyValueDelta: string): 'up' | 'down' {
  return decimalSign(weeklyValueDelta) < 0 ? 'down' : 'up';
}

/** Shopping row quantity: "12 Stück", "250 g", "2" (no unit) or nothing (no quantity). */
export function shoppingQuantityLabel(item: Pick<ShoppingItemDto, 'quantity' | 'unit'>): string | undefined {
  if (item.quantity === null) return undefined;
  return item.unit ? formatQuantity(item.quantity, item.unit) : formatNumber(item.quantity);
}

/** Header link of the shopping section: "Alle 8" (design) or "Liste öffnen" when nothing is open. */
export function shoppingLinkLabel(openCount: number): string {
  return openCount > 0 ? `Alle ${formatNumber(openCount)}` : 'Liste öffnen';
}

/**
 * Tile sources: the 240 px thumb covers the 108 pt tile up to 2× (216 px); 3× iPhones need 324 px
 * and get the full variant (≤ 1600 px) instead of an upscaled thumb.
 */
export function tileSrcSet(item: Pick<InventoryItemDto, 'image'>): string | undefined {
  return item.image ? `${item.image.thumbUrl} 2x, ${item.image.fullUrl} 3x` : undefined;
}
