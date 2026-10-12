import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ACTIVITY_TYPE_VALUES,
  API_ERRORS,
  ChangePasswordRequestSchema,
  ChatSendPayloadSchema,
  CreateHouseholdRequestSchema,
  CreateInvitationRequestSchema,
  CreateItemRequestSchema,
  CreateShoppingItemRequestSchema,
  ITEM_CATEGORY_LABELS,
  ITEM_CATEGORY_VALUES,
  ItemListQuerySchema,
  LoginRequestSchema,
  MessageListQuerySchema,
  QuantityChangeRequestSchema,
  ReadCursorRequestSchema,
  RegisterRequestSchema,
  SendMessageRequestSchema,
  UNIT_LABELS,
  UNIT_VALUES,
  UpdateItemRequestSchema,
  roleAtLeast,
  toValidationDetails,
} from '../src/index';

function fieldErrors(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return toValidationDetails(result.error).fieldErrors;
}

describe('auth schemas', () => {
  const valid = { displayName: '  Anna  ', email: ' Anna@Example.CH ', password: 'sicheres-pass1' };

  it('normalises registration input', () => {
    expect(RegisterRequestSchema.parse(valid)).toEqual({
      displayName: 'Anna',
      email: 'anna@example.ch',
      password: 'sicheres-pass1',
    });
  });

  it('enforces the password policy with German messages', () => {
    expect(fieldErrors(RegisterRequestSchema, { ...valid, password: 'kurz1' }).password).toBe(
      'Das Passwort muss mindestens 10 Zeichen lang sein.',
    );
    expect(fieldErrors(RegisterRequestSchema, { ...valid, password: '1234567890' }).password).toBe(
      'Das Passwort muss mindestens einen Buchstaben enthalten.',
    );
    expect(fieldErrors(RegisterRequestSchema, { ...valid, password: 'nurbuchstaben' }).password).toBe(
      'Das Passwort muss mindestens eine Ziffer oder ein Sonderzeichen enthalten.',
    );
    expect(fieldErrors(RegisterRequestSchema, { ...valid, password: 'x'.repeat(129) + '1' }).password).toBe(
      'Das Passwort darf höchstens 128 Zeichen lang sein.',
    );
    expect(
      fieldErrors(RegisterRequestSchema, {
        ...valid,
        email: 'anna.muster@example.ch',
        password: 'Anna.Muster@example.ch',
      }).password,
    ).toBe('Das Passwort darf nicht deiner E-Mail-Adresse entsprechen.');
  });

  it('validates e-mail and display name', () => {
    expect(fieldErrors(RegisterRequestSchema, { ...valid, email: 'nope' }).email).toBe(
      'Bitte gib eine gültige E-Mail-Adresse ein.',
    );
    expect(fieldErrors(RegisterRequestSchema, { ...valid, displayName: '   ' }).displayName).toBe(
      'Bitte gib deinen Namen ein.',
    );
  });

  it('login accepts legacy passwords but requires both fields', () => {
    expect(LoginRequestSchema.parse({ email: 'A@B.ch', password: 'x' })).toEqual({ email: 'a@b.ch', password: 'x' });
    expect(fieldErrors(LoginRequestSchema, { email: 'a@b.ch' }).password).toBe('Bitte gib dein Passwort ein.');
  });

  it('password change requires a different password', () => {
    expect(
      fieldErrors(ChangePasswordRequestSchema, { currentPassword: 'gleich-pass1', newPassword: 'gleich-pass1' })
        .newPassword,
    ).toBe('Das neue Passwort muss sich vom aktuellen unterscheiden.');
  });

  it('falls back to German messages for type errors', () => {
    expect(fieldErrors(LoginRequestSchema, { email: 'a@b.ch', password: 42 }).password).toBe(
      'Bitte gib dein Passwort ein.',
    );
    expect(fieldErrors(z.object({ n: z.number() }), {}).n).toBe('Dieses Feld ist erforderlich.');
  });
});

describe('household schemas', () => {
  it('trims and limits names', () => {
    expect(CreateHouseholdRequestSchema.parse({ name: '  WG Zürich ' })).toEqual({ name: 'WG Zürich' });
    expect(fieldErrors(CreateHouseholdRequestSchema, { name: 'x'.repeat(61) }).name).toBe(
      'Der Name darf höchstens 60 Zeichen lang sein.',
    );
  });

  it('applies invitation defaults and never allows OWNER invitations', () => {
    expect(CreateInvitationRequestSchema.parse({})).toEqual({ role: 'MEMBER', expiresInDays: 7 });
    expect(CreateInvitationRequestSchema.safeParse({ role: 'OWNER' }).success).toBe(false);
    expect(CreateInvitationRequestSchema.safeParse({ expiresInDays: 31 }).success).toBe(false);
  });

  it('ranks roles OWNER > ADMIN > MEMBER', () => {
    expect(roleAtLeast('OWNER', 'ADMIN')).toBe(true);
    expect(roleAtLeast('ADMIN', 'ADMIN')).toBe(true);
    expect(roleAtLeast('MEMBER', 'ADMIN')).toBe(false);
  });
});

describe('inventory schemas', () => {
  it('applies defaults and normalises decimals', () => {
    expect(CreateItemRequestSchema.parse({ name: 'Olivenöl', unitPrice: '8,5', quantity: '2.000' })).toEqual({
      name: 'Olivenöl',
      category: 'SONSTIGES',
      quantity: '2',
      unit: 'STUECK',
      unitPrice: '8.50',
      imageId: null,
    });
  });

  it('rejects invalid prices and quantities', () => {
    expect(fieldErrors(CreateItemRequestSchema, { name: 'A', unitPrice: '8.505' }).unitPrice).toBe(
      'Der Preis darf höchstens 2 Nachkommastellen haben.',
    );
    expect(fieldErrors(CreateItemRequestSchema, { name: 'A', unitPrice: '-1' }).unitPrice).toBe(
      'Der Preis darf nicht negativ sein.',
    );
    expect(fieldErrors(CreateItemRequestSchema, { name: 'A', unitPrice: '100000' }).unitPrice).toBe(
      'Der Preis darf höchstens CHF 99’999.99 betragen.',
    );
    expect(fieldErrors(CreateItemRequestSchema, { name: 'A', quantity: 'viel' }).quantity).toBe(
      'Bitte gib eine gültige Menge ein.',
    );
    expect(fieldErrors(CreateItemRequestSchema, { name: 'A', category: 'GARTEN' }).category).toBe(
      'Bitte wähle eine Kategorie.',
    );
  });

  it('requires a version for updates', () => {
    expect(UpdateItemRequestSchema.parse({ unitPrice: null, version: 3 })).toEqual({ unitPrice: null, version: 3 });
    expect(fieldErrors(UpdateItemRequestSchema, { name: 'B' }).version).toBe('Die Version fehlt.');
  });

  it('accepts signed non-zero quantity deltas', () => {
    expect(QuantityChangeRequestSchema.parse({ delta: '-1' })).toEqual({ delta: '-1' });
    expect(QuantityChangeRequestSchema.parse({ delta: '0,5' })).toEqual({ delta: '0.5' });
    expect(fieldErrors(QuantityChangeRequestSchema, { delta: '0' }).delta).toBe(
      'Die Mengenänderung darf nicht 0 sein.',
    );
  });

  it('parses list query strings', () => {
    expect(ItemListQuerySchema.parse({ search: '  ', limit: '20' })).toEqual({
      sort: 'name',
      limit: 20,
      search: undefined,
    });
    expect(ItemListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
    expect(ItemListQuerySchema.safeParse({ sort: 'price' }).success).toBe(false);
  });
});

describe('shopping schemas', () => {
  it('allows optional quantity, unit and price', () => {
    expect(CreateShoppingItemRequestSchema.parse({ name: 'Milch' })).toEqual({ name: 'Milch' });
    expect(
      CreateShoppingItemRequestSchema.parse({ name: 'Milch', quantity: '2', unit: 'PACKUNG', unitPrice: null }),
    ).toEqual({ name: 'Milch', quantity: '2', unit: 'PACKUNG', unitPrice: null });
  });
});

describe('chat schemas', () => {
  const base = { clientId: 'c-12345678', content: '  Hallo  ' };

  it('trims content and defaults kind', () => {
    expect(SendMessageRequestSchema.parse(base)).toEqual({ clientId: 'c-12345678', content: 'Hallo', kind: 'TEXT' });
  });

  it('validates clientId and content length', () => {
    expect(fieldErrors(SendMessageRequestSchema, { ...base, clientId: 'short' }).clientId).toBe(
      'Ungültige Nachrichten-ID.',
    );
    expect(fieldErrors(SendMessageRequestSchema, { ...base, clientId: 'x'.repeat(65) }).clientId).toBe(
      'Ungültige Nachrichten-ID.',
    );
    expect(fieldErrors(SendMessageRequestSchema, { ...base, content: '   ' }).content).toBe(
      'Bitte gib eine Nachricht ein.',
    );
    expect(fieldErrors(SendMessageRequestSchema, { ...base, content: 'x'.repeat(4001) }).content).toBe(
      'Die Nachricht darf höchstens 4000 Zeichen lang sein.',
    );
  });

  it('requires meta exactly for shopping item messages', () => {
    const meta = { shoppingItemId: '0f8fad5b-d9cb-469f-a165-70867728950e', name: 'Milch' };
    expect(SendMessageRequestSchema.safeParse({ ...base, kind: 'SHOPPING_ITEM', meta }).success).toBe(true);
    expect(fieldErrors(SendMessageRequestSchema, { ...base, kind: 'SHOPPING_ITEM' }).meta).toBe(
      'Angaben zum Einkaufsartikel fehlen.',
    );
    expect(SendMessageRequestSchema.safeParse({ ...base, meta }).success).toBe(false);
  });

  it('validates socket payloads and cursors', () => {
    const conversationId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    expect(ChatSendPayloadSchema.parse({ ...base, conversationId })).toMatchObject({ conversationId, kind: 'TEXT' });
    expect(ReadCursorRequestSchema.safeParse({ seq: '42' }).success).toBe(true);
    expect(ReadCursorRequestSchema.safeParse({ seq: 42 }).success).toBe(false);
    expect(MessageListQuerySchema.parse({})).toEqual({ limit: 50 });
  });
});

describe('labels & errors', () => {
  it('has a German label for every category and unit', () => {
    expect(ITEM_CATEGORY_VALUES.map((value) => ITEM_CATEGORY_LABELS[value])).toEqual([
      'Küche',
      'Bad',
      'Wohnzimmer',
      'Technik',
      'Sonstiges',
    ]);
    for (const unit of UNIT_VALUES) {
      expect(UNIT_LABELS[unit].short.length).toBeGreaterThan(0);
    }
    expect(ACTIVITY_TYPE_VALUES).toHaveLength(12);
  });

  it('uses Swiss spelling (no ß) in all default error messages', () => {
    for (const { message } of Object.values(API_ERRORS)) {
      expect(message).not.toMatch(/ß/);
    }
  });

  it('builds validation details keyed by field path', () => {
    const result = z.object({ a: z.object({ b: z.string() }) }).safeParse({ a: { b: 1 } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toValidationDetails(result.error)).toEqual({ fieldErrors: { 'a.b': 'Ungültiger Wert.' }, formErrors: [] });
    }
  });
});
