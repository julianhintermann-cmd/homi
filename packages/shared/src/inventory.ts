import { z } from 'zod';
import {
  IdSchema,
  IsoDateTimeSchema,
  MoneyInputSchema,
  MoneyStringSchema,
  QuantityDeltaSchema,
  QuantityInputSchema,
  QuantityStringSchema,
  UserRefSchema,
  optionalQueryString,
  pageLimitSchema,
} from './common';
import { LIMITS } from './constants';
import { ITEM_CATEGORY_VALUES, ItemCategorySchema, UNIT_VALUES, UnitSchema } from './enums';

/*
 * Inventory items and images (§5 "Inventory").
 */

export const ItemNameSchema = z
  .string({ error: 'Bitte gib einen Namen ein.' })
  .trim()
  .min(LIMITS.itemName.min, { error: 'Bitte gib einen Namen ein.' })
  .max(LIMITS.itemName.max, { error: `Der Name darf höchstens ${LIMITS.itemName.max} Zeichen lang sein.` });

const CategoryInputSchema = z.enum(ITEM_CATEGORY_VALUES, { error: 'Bitte wähle eine Kategorie.' });
const UnitInputSchema = z.enum(UNIT_VALUES, { error: 'Bitte wähle eine Einheit.' });

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const CreateItemRequestSchema = z.object({
  name: ItemNameSchema,
  category: CategoryInputSchema.default('SONSTIGES'),
  quantity: QuantityInputSchema.default('1'),
  unit: UnitInputSchema.default('STUECK'),
  /** CHF per unit; `null` = unknown price. */
  unitPrice: MoneyInputSchema.nullable().default(null),
  imageId: IdSchema.nullable().default(null),
});
export type CreateItemRequest = z.input<typeof CreateItemRequestSchema>;
export type CreateItemInput = z.output<typeof CreateItemRequestSchema>;

/** Partial update with optimistic concurrency: a stale `version` yields `409 VERSION_CONFLICT`. */
export const UpdateItemRequestSchema = z.object({
  name: ItemNameSchema.optional(),
  category: CategoryInputSchema.optional(),
  quantity: QuantityInputSchema.optional(),
  unit: UnitInputSchema.optional(),
  unitPrice: MoneyInputSchema.nullable().optional(),
  imageId: IdSchema.nullable().optional(),
  version: z
    .number({ error: 'Die Version fehlt.' })
    .int({ error: 'Ungültige Version.' })
    .min(1, { error: 'Ungültige Version.' }),
});
export type UpdateItemRequest = z.input<typeof UpdateItemRequestSchema>;
export type UpdateItemInput = z.output<typeof UpdateItemRequestSchema>;

/** Atomic `GREATEST(quantity + delta, 0)`. */
export const QuantityChangeRequestSchema = z.object({ delta: QuantityDeltaSchema });
export type QuantityChangeRequest = z.input<typeof QuantityChangeRequestSchema>;

export const ITEM_SORT_VALUES = ['name', 'recent', 'value'] as const;
export const ItemSortSchema = z.enum(ITEM_SORT_VALUES, { error: 'Ungültige Sortierung.' });
export type ItemSort = z.infer<typeof ItemSortSchema>;

/** Query string of `GET /households/:hid/items`. */
export const ItemListQuerySchema = z.object({
  search: optionalQueryString(LIMITS.searchQuery.max),
  category: ItemCategorySchema.optional(),
  sort: ItemSortSchema.default('name'),
  /** Opaque cursor returned as `nextCursor` by the previous page. */
  cursor: z.string().max(512).optional(),
  limit: pageLimitSchema(LIMITS.itemsPage.default, LIMITS.itemsPage.max),
});
export type ItemListQuery = z.input<typeof ItemListQuerySchema>;
export type ItemListParams = z.output<typeof ItemListQuerySchema>;

export const ItemParamsSchema = z.object({ householdId: IdSchema, itemId: IdSchema });

export const IMAGE_VARIANT_VALUES = ['thumb', 'full'] as const;
export const ImageVariantSchema = z.enum(IMAGE_VARIANT_VALUES);
export type ImageVariant = z.infer<typeof ImageVariantSchema>;

export const ImageParamsSchema = z.object({ householdId: IdSchema, imageId: IdSchema });
export const ImageQuerySchema = z.object({ variant: ImageVariantSchema.default('thumb') });

/** Accepted upload MIME types (detected from content, not from the client). */
export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const ItemImageDtoSchema = z.object({
  id: IdSchema,
  thumbUrl: z.string(),
  fullUrl: z.string(),
});
export type ItemImageDto = z.infer<typeof ItemImageDtoSchema>;

export const InventoryItemDtoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  category: ItemCategorySchema,
  quantity: QuantityStringSchema,
  unit: UnitSchema,
  unitPrice: MoneyStringSchema.nullable(),
  /** quantity × unitPrice (2 decimals), `null` when the price is unknown. */
  totalValue: MoneyStringSchema.nullable(),
  image: ItemImageDtoSchema.nullable(),
  createdBy: UserRefSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  version: z.number().int().positive(),
});
export type InventoryItemDto = z.infer<typeof InventoryItemDtoSchema>;

export const ItemListResponseSchema = z.object({
  items: z.array(InventoryItemDtoSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
});
export type ItemListResponse = z.infer<typeof ItemListResponseSchema>;

export const ImageUploadResponseSchema = z.object({
  id: IdSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ImageUploadResponse = z.infer<typeof ImageUploadResponseSchema>;

/** Relative URL of an image variant (served after a membership check). */
export function imageUrl(householdId: string, imageId: string, variant: ImageVariant): string {
  return `/api/households/${householdId}/images/${imageId}?variant=${variant}`;
}
