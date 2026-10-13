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
import { isZeroDecimal } from './decimal';
import { UNIT_VALUES, UnitSchema } from './enums';
import { hasForbiddenNameCharacters, hasVisibleNameCharacter } from './text';

/*
 * Shopping list (§5 "Shopping"). Completing an item never changes inventory quantities.
 */

export const SHOPPING_LIMITS = {
  /**
   * Soft cap of listed items (open + visible completed) per list – keeps the unpaginated list
   * response small. Completed items hidden by the 24-hour rule do not count (they are purged).
   */
  maxItems: 500,
  /**
   * Completed items stay visible this long after being ticked off (design 03b: "Abgehakte Artikel
   * werden nach 24 Stunden automatisch ausgeblendet."); older ones are left out of the list response
   * and purged by the next write (new item, "Erledigte löschen").
   */
  completedVisibleHours: 24,
} as const;

export const ShoppingItemNameSchema = z
  .string({ error: 'Bitte gib einen Namen ein.' })
  .trim()
  .min(LIMITS.shoppingItemName.min, { error: 'Bitte gib einen Namen ein.' })
  .max(LIMITS.shoppingItemName.max, {
    error: `Der Name darf höchstens ${LIMITS.shoppingItemName.max} Zeichen lang sein.`,
  })
  .refine((value) => !hasForbiddenNameCharacters(value), { error: 'Der Name enthält ungültige Zeichen.' })
  .refine(hasVisibleNameCharacter, { error: 'Bitte gib einen Namen ein.' });

// ---------------------------------------------------------------------------
// Household-scoped item ids
// ---------------------------------------------------------------------------

/** UUIDv5 namespace of shopping item ids derived from a client id (see {@link shoppingItemIdFor}). */
export const SHOPPING_ITEM_ID_NAMESPACE = '406a6151-86dd-4ecd-8ed1-6bf99ac11f00';

function utf8Bytes(value: string): number[] {
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

const rotl = (value: number, bits: number): number => (value << bits) | (value >>> (32 - bits));

/** SHA-1 (FIPS 180-4) – only used to derive UUIDv5 ids, synchronously and identically everywhere. */
function sha1(message: Uint8Array): Uint8Array {
  const blocks = Math.ceil((message.length + 9) / 64);
  const padded = new Uint8Array(blocks * 64);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = message.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Array<number>(80).fill(0);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i += 1) {
      w[i] = rotl((w[i - 3] ?? 0) ^ (w[i - 8] ?? 0) ^ (w[i - 14] ?? 0) ^ (w[i - 16] ?? 0), 1);
    }
    let [a = 0, b = 0, c = 0, d = 0, e = 0] = h;
    for (let i = 0; i < 80; i += 1) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const next = (rotl(a, 5) + f + e + k + (w[i] ?? 0)) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = next;
    }
    h[0] = ((h[0] ?? 0) + a) >>> 0;
    h[1] = ((h[1] ?? 0) + b) >>> 0;
    h[2] = ((h[2] ?? 0) + c) >>> 0;
    h[3] = ((h[3] ?? 0) + d) >>> 0;
    h[4] = ((h[4] ?? 0) + e) >>> 0;
  }
  const digest = new Uint8Array(20);
  const out = new DataView(digest.buffer);
  h.forEach((word, index) => out.setUint32(index * 4, word));
  return digest;
}

/** Name-based UUID version 5 (RFC 9562 §5.5): SHA-1 of namespace + UTF-8 name. */
export function uuidV5(namespace: string, name: string): string {
  const hex = namespace.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('uuidV5: invalid namespace');
  const namespaceBytes = Array.from({ length: 16 }, (_, index) => parseInt(hex.slice(index * 2, index * 2 + 2), 16));
  const hash = sha1(Uint8Array.from([...namespaceBytes, ...utf8Bytes(name)]));
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const out = Array.from(hash.subarray(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

/**
 * The id of a shopping item created with `clientId` in `householdId`. Client and server derive it
 * identically, so an optimistic row renders under its final id, and a retry of the same client id
 * finds the same item. Scoping by household means a client id can never collide with – or reveal
 * anything about – an item of another household (the stored id is never the raw client value).
 */
export function shoppingItemIdFor(householdId: string, clientId: string): string {
  return uuidV5(SHOPPING_ITEM_ID_NAMESPACE, `${householdId.toLowerCase()}:${clientId.toLowerCase()}`);
}

const UnitInputSchema = z.enum(UNIT_VALUES, { error: 'Bitte wähle eine Einheit.' });

/** Like the inventory quantity, but "0" makes no sense on a shopping list (use `null` = no quantity). */
export const ShoppingQuantityInputSchema = QuantityInputSchema.refine((value) => !isZeroDecimal(value), {
  error: 'Die Menge muss grösser als 0 sein.',
});

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const CreateShoppingItemRequestSchema = z
  .object({
    /**
     * Optional client-generated UUID (idempotency key). The item is stored under
     * `shoppingItemIdFor(householdId, clientId)`, which the client computes too: the optimistic row
     * renders under its final id (no flicker when the realtime refetch arrives first) and a retry
     * with the same `clientId` returns the existing item of this household (200 instead of 201).
     */
    clientId: IdSchema.optional(),
    /** Required unless `sourceItemId` is given (then it defaults to the inventory item's name). */
    name: ShoppingItemNameSchema.optional(),
    quantity: ShoppingQuantityInputSchema.nullable().optional(),
    /** Defaults to the inventory item's unit when `sourceItemId` is given and `unit` is omitted. */
    unit: UnitInputSchema.nullable().optional(),
    unitPrice: MoneyInputSchema.nullable().optional(),
    /** Inventory item this entry was created from ("Nachkaufen"); must belong to the same household. */
    sourceItemId: IdSchema.nullable().optional(),
  })
  .refine((value) => value.name !== undefined || Boolean(value.sourceItemId), {
    path: ['name'],
    error: 'Bitte gib einen Namen ein.',
  });
export type CreateShoppingItemRequest = z.input<typeof CreateShoppingItemRequestSchema>;
export type CreateShoppingItemInput = z.output<typeof CreateShoppingItemRequestSchema>;

export const UpdateShoppingItemRequestSchema = z.object({
  name: ShoppingItemNameSchema.optional(),
  quantity: ShoppingQuantityInputSchema.nullable().optional(),
  unit: UnitInputSchema.nullable().optional(),
  unitPrice: MoneyInputSchema.nullable().optional(),
  completed: z.boolean({ error: 'Ungültiger Status.' }).optional(),
});
export type UpdateShoppingItemRequest = z.input<typeof UpdateShoppingItemRequestSchema>;
export type UpdateShoppingItemInput = z.output<typeof UpdateShoppingItemRequestSchema>;

/**
 * `POST …/shopping/clear-completed`. `itemIds` are the completed items the user confirmed (the
 * visible "Erledigt" rows): only those are deleted – an item another member ticks off while the
 * confirmation is open stays. Completed items already hidden by the 24-hour rule are removed too
 * (they are gone from every member's view). Without `itemIds` every completed item is deleted.
 */
export const ClearCompletedRequestSchema = z.object({
  itemIds: z.array(IdSchema).max(SHOPPING_LIMITS.maxItems).optional(),
});
export type ClearCompletedRequest = z.input<typeof ClearCompletedRequestSchema>;

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
