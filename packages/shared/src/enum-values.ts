/*
 * Enum values and German labels mirroring prisma/schema.prisma (§3) – **zod-free and side-effect
 * free**, so the web app can import labels and pickers via `@homi/shared/core` without loading zod.
 * The zod schemas (`XxxSchema`) live in `enums.ts`. Each enum is exported as
 *   - `XXX_VALUES`  readonly tuple (stable order for pickers)
 *   - `Xxx`         value object (`Xxx.OWNER === 'OWNER'`) and string-union type of the same name
 * The server asserts parity with the generated Prisma enums in a unit test.
 */

/** `{ A: 'A', B: 'B' }` for a tuple of string literals (same shape as zod's `schema.enum`). */
function enumObject<const T extends readonly string[]>(values: T): { readonly [K in T[number]]: K } {
  return Object.fromEntries(values.map((value) => [value, value])) as { readonly [K in T[number]]: K };
}

export const HOUSEHOLD_ROLE_VALUES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLE_VALUES)[number];
export const HouseholdRole = /* @__PURE__ */ enumObject(HOUSEHOLD_ROLE_VALUES);

export const ITEM_CATEGORY_VALUES = ['KUECHE', 'BAD', 'WOHNZIMMER', 'TECHNIK', 'SONSTIGES'] as const;
export type ItemCategory = (typeof ITEM_CATEGORY_VALUES)[number];
export const ItemCategory = /* @__PURE__ */ enumObject(ITEM_CATEGORY_VALUES);

export const UNIT_VALUES = [
  'STUECK',
  'PACKUNG',
  'FLASCHE',
  'KILOGRAMM',
  'GRAMM',
  'LITER',
  'MILLILITER',
  'ROLLE',
  'BECHER',
  'TUBE',
  'DOSE',
] as const;
export type Unit = (typeof UNIT_VALUES)[number];
export const Unit = /* @__PURE__ */ enumObject(UNIT_VALUES);

export const CONVERSATION_TYPE_VALUES = ['HOUSEHOLD', 'DIRECT'] as const;
export type ConversationType = (typeof CONVERSATION_TYPE_VALUES)[number];
export const ConversationType = /* @__PURE__ */ enumObject(CONVERSATION_TYPE_VALUES);

export const MESSAGE_KIND_VALUES = ['TEXT', 'SHOPPING_ITEM'] as const;
export type MessageKind = (typeof MESSAGE_KIND_VALUES)[number];
export const MessageKind = /* @__PURE__ */ enumObject(MESSAGE_KIND_VALUES);

export const ACTIVITY_TYPE_VALUES = [
  'HOUSEHOLD_CREATED',
  'MEMBER_JOINED',
  'MEMBER_LEFT',
  'MEMBER_REMOVED',
  'ITEM_CREATED',
  'ITEM_UPDATED',
  'ITEM_DELETED',
  'ITEM_QUANTITY_CHANGED',
  'SHOPPING_ITEM_ADDED',
  'SHOPPING_ITEM_COMPLETED',
  'SHOPPING_ITEM_REOPENED',
  'SHOPPING_ITEM_DELETED',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPE_VALUES)[number];
export const ActivityType = /* @__PURE__ */ enumObject(ACTIVITY_TYPE_VALUES);

/** `HouseholdActivity.entityType` values (free VARCHAR(32) in the DB, constrained here). */
export const ACTIVITY_ENTITY_TYPE_VALUES = ['household', 'member', 'item', 'shoppingItem', 'image'] as const;
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPE_VALUES)[number];

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** Role hierarchy: OWNER > ADMIN > MEMBER. */
export const ROLE_RANK: Readonly<Record<HouseholdRole, number>> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };

/** True when `role` is at least `minRole` in the hierarchy. */
export function roleAtLeast(role: HouseholdRole, minRole: HouseholdRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/**
 * Role names shown in the UI (screen 09 leaves the wording open; decided by the households team):
 * OWNER → "Inhaber:in", ADMIN → "Verwaltung", MEMBER → "Mitglied".
 */
export const HOUSEHOLD_ROLE_LABELS: Readonly<Record<HouseholdRole, string>> = {
  OWNER: 'Inhaber:in',
  ADMIN: 'Verwaltung',
  MEMBER: 'Mitglied',
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const ITEM_CATEGORY_LABELS: Readonly<Record<ItemCategory, string>> = {
  KUECHE: 'Küche',
  BAD: 'Bad',
  WOHNZIMMER: 'Wohnzimmer',
  TECHNIK: 'Technik',
  SONSTIGES: 'Sonstiges',
};

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export interface UnitLabel {
  /** Name shown in the unit picker, e.g. "Kilogramm". */
  readonly name: string;
  /** Used after a quantity of exactly 1, e.g. "1 Flasche". */
  readonly singular: string;
  /** Used after any other quantity, e.g. "2 Flaschen", "1.5 kg". */
  readonly plural: string;
  /** Suffix for unit prices, e.g. "CHF 8.50 / Fl.". */
  readonly short: string;
}

export const UNIT_LABELS: Readonly<Record<Unit, UnitLabel>> = {
  STUECK: { name: 'Stück', singular: 'Stück', plural: 'Stück', short: 'Stk.' },
  PACKUNG: { name: 'Packung', singular: 'Packung', plural: 'Packungen', short: 'Pkg.' },
  FLASCHE: { name: 'Flasche', singular: 'Flasche', plural: 'Flaschen', short: 'Fl.' },
  KILOGRAMM: { name: 'Kilogramm', singular: 'kg', plural: 'kg', short: 'kg' },
  GRAMM: { name: 'Gramm', singular: 'g', plural: 'g', short: 'g' },
  LITER: { name: 'Liter', singular: 'Liter', plural: 'Liter', short: 'l' },
  MILLILITER: { name: 'Milliliter', singular: 'ml', plural: 'ml', short: 'ml' },
  ROLLE: { name: 'Rolle', singular: 'Rolle', plural: 'Rollen', short: 'Rolle' },
  BECHER: { name: 'Becher', singular: 'Becher', plural: 'Becher', short: 'Becher' },
  TUBE: { name: 'Tube', singular: 'Tube', plural: 'Tuben', short: 'Tube' },
  DOSE: { name: 'Dose', singular: 'Dose', plural: 'Dosen', short: 'Dose' },
};

/** Step used by the quantity stepper per unit (decimal string). */
export const UNIT_STEP: Readonly<Record<Unit, string>> = {
  STUECK: '1',
  PACKUNG: '1',
  FLASCHE: '1',
  KILOGRAMM: '0.5',
  GRAMM: '50',
  LITER: '0.5',
  MILLILITER: '50',
  ROLLE: '1',
  BECHER: '1',
  TUBE: '1',
  DOSE: '1',
};

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export const ACTIVITY_TYPE_LABELS: Readonly<Record<ActivityType, string>> = {
  HOUSEHOLD_CREATED: 'Haushalt erstellt',
  MEMBER_JOINED: 'Mitglied beigetreten',
  MEMBER_LEFT: 'Mitglied ausgetreten',
  MEMBER_REMOVED: 'Mitglied entfernt',
  ITEM_CREATED: 'Artikel hinzugefügt',
  ITEM_UPDATED: 'Artikel bearbeitet',
  ITEM_DELETED: 'Artikel gelöscht',
  ITEM_QUANTITY_CHANGED: 'Menge geändert',
  SHOPPING_ITEM_ADDED: 'Zur Einkaufsliste hinzugefügt',
  SHOPPING_ITEM_COMPLETED: 'Eingekauft',
  SHOPPING_ITEM_REOPENED: 'Wieder offen',
  SHOPPING_ITEM_DELETED: 'Von der Einkaufsliste entfernt',
};
