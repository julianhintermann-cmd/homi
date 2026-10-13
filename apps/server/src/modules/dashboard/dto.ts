import type { MemberRef } from '@homi/shared';

/*
 * Mappers for the Home dashboard. Inventory items and shopping items reuse the feature modules'
 * mappers (`inventory/dto.ts`, `shopping/dto.ts`), so the dashboard always returns exactly the DTOs
 * the inventory and shopping screens get; the integration tests parse every dashboard response with
 * `DashboardDtoSchema`. Decimals stay strings throughout.
 */

export function toMemberRef(row: { userId: string; user: { displayName: string } }): MemberRef {
  return { userId: row.userId, displayName: row.user.displayName };
}
