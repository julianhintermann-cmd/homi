import { z } from 'zod';

/*
 * Enums mirroring prisma/schema.prisma (§3). Each enum is exported three ways:
 *   - `XXX_VALUES`  readonly tuple (stable order for pickers)
 *   - `XxxSchema`   zod enum
 *   - `Xxx`         value object (`Xxx.OWNER === 'OWNER'`) and string-union type of the same name
 * The server asserts parity with the generated Prisma enums in a unit test.
 */

export const HOUSEHOLD_ROLE_VALUES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export const HouseholdRoleSchema = z.enum(HOUSEHOLD_ROLE_VALUES);
export type HouseholdRole = z.infer<typeof HouseholdRoleSchema>;
export const HouseholdRole = HouseholdRoleSchema.enum;

export const ITEM_CATEGORY_VALUES = ['KUECHE', 'BAD', 'WOHNZIMMER', 'TECHNIK', 'SONSTIGES'] as const;
export const ItemCategorySchema = z.enum(ITEM_CATEGORY_VALUES);
export type ItemCategory = z.infer<typeof ItemCategorySchema>;
export const ItemCategory = ItemCategorySchema.enum;

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
export const UnitSchema = z.enum(UNIT_VALUES);
export type Unit = z.infer<typeof UnitSchema>;
export const Unit = UnitSchema.enum;

export const CONVERSATION_TYPE_VALUES = ['HOUSEHOLD', 'DIRECT'] as const;
export const ConversationTypeSchema = z.enum(CONVERSATION_TYPE_VALUES);
export type ConversationType = z.infer<typeof ConversationTypeSchema>;
export const ConversationType = ConversationTypeSchema.enum;

export const MESSAGE_KIND_VALUES = ['TEXT', 'SHOPPING_ITEM'] as const;
export const MessageKindSchema = z.enum(MESSAGE_KIND_VALUES);
export type MessageKind = z.infer<typeof MessageKindSchema>;
export const MessageKind = MessageKindSchema.enum;

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
export const ActivityTypeSchema = z.enum(ACTIVITY_TYPE_VALUES);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;
export const ActivityType = ActivityTypeSchema.enum;

/** `HouseholdActivity.entityType` values (free VARCHAR(32) in the DB, constrained here). */
export const ACTIVITY_ENTITY_TYPE_VALUES = ['household', 'member', 'item', 'shoppingItem', 'image'] as const;
export const ActivityEntityTypeSchema = z.enum(ACTIVITY_ENTITY_TYPE_VALUES);
export type ActivityEntityType = z.infer<typeof ActivityEntityTypeSchema>;

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** Role hierarchy: OWNER > ADMIN > MEMBER. */
export const ROLE_RANK: Readonly<Record<HouseholdRole, number>> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };

/** True when `role` is at least `minRole` in the hierarchy. */
export function roleAtLeast(role: HouseholdRole, minRole: HouseholdRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export const HOUSEHOLD_ROLE_LABELS: Readonly<Record<HouseholdRole, string>> = {
  OWNER: 'Inhaber',
  ADMIN: 'Admin',
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
