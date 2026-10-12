import { z } from 'zod';
import {
  IdSchema,
  IsoDateTimeSchema,
  MoneyInputSchema,
  MoneyStringSchema,
  QuantityInputSchema,
  QuantityStringSchema,
  UserRefSchema,
} from './common';
import { LIMITS } from './constants';
import { UNIT_VALUES, UnitSchema } from './enums';

/*
 * Shopping list (§5 "Shopping"). Completing an item never changes inventory quantities.
 */

export const ShoppingItemNameSchema = z
  .string({ error: 'Bitte gib einen Namen ein.' })
  .trim()
  .min(LIMITS.shoppingItemName.min, { error: 'Bitte gib einen Namen ein.' })
  .max(LIMITS.shoppingItemName.max, {
    error: `Der Name darf höchstens ${LIMITS.shoppingItemName.max} Zeichen lang sein.`,
  });

const UnitInputSchema = z.enum(UNIT_VALUES, { error: 'Bitte wähle eine Einheit.' });

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const CreateShoppingItemRequestSchema = z.object({
  name: ShoppingItemNameSchema,
  quantity: QuantityInputSchema.nullable().optional(),
  unit: UnitInputSchema.nullable().optional(),
  unitPrice: MoneyInputSchema.nullable().optional(),
  /** Inventory item this entry was created from ("Nachkaufen"). */
  sourceItemId: IdSchema.nullable().optional(),
});
export type CreateShoppingItemRequest = z.input<typeof CreateShoppingItemRequestSchema>;
export type CreateShoppingItemInput = z.output<typeof CreateShoppingItemRequestSchema>;

export const UpdateShoppingItemRequestSchema = z.object({
  name: ShoppingItemNameSchema.optional(),
  quantity: QuantityInputSchema.nullable().optional(),
  unit: UnitInputSchema.nullable().optional(),
  unitPrice: MoneyInputSchema.nullable().optional(),
  completed: z.boolean({ error: 'Ungültiger Status.' }).optional(),
});
export type UpdateShoppingItemRequest = z.input<typeof UpdateShoppingItemRequestSchema>;
export type UpdateShoppingItemInput = z.output<typeof UpdateShoppingItemRequestSchema>;

export const ShoppingItemParamsSchema = z.object({ householdId: IdSchema, shoppingItemId: IdSchema });

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const ShoppingItemDtoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  quantity: QuantityStringSchema.nullable(),
  unit: UnitSchema.nullable(),
  unitPrice: MoneyStringSchema.nullable(),
  completed: z.boolean(),
  completedAt: IsoDateTimeSchema.nullable(),
  completedBy: UserRefSchema.nullable(),
  sourceItemId: IdSchema.nullable(),
  createdBy: UserRefSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ShoppingItemDto = z.infer<typeof ShoppingItemDtoSchema>;

export const ShoppingListResponseSchema = z.object({
  list: z.object({ id: IdSchema, name: z.string() }),
  open: z.array(ShoppingItemDtoSchema),
  completed: z.array(ShoppingItemDtoSchema),
  stats: z.object({
    done: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});
export type ShoppingListResponse = z.infer<typeof ShoppingListResponseSchema>;

export const ClearCompletedResponseSchema = z.object({ deleted: z.number().int().nonnegative() });
export type ClearCompletedResponse = z.infer<typeof ClearCompletedResponseSchema>;
