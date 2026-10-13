import { describe, expect, it } from 'vitest';
import {
  CreateHouseholdRequestSchema,
  CreateItemRequestSchema,
  CreateShoppingItemRequestSchema,
  DisplayNameSchema,
  ItemListQuerySchema,
  MessageContentSchema,
  RenameHouseholdRequestSchema,
  UpdateItemRequestSchema,
  hasControlCharacter,
  hasForbiddenNameCharacters,
  hasVisibleNameCharacter,
} from '../src';

/*
 * Free-text hygiene (src/text.ts): PostgreSQL rejects U+0000 in text values, so every free-text request
 * field must turn NUL (and other control characters) into a 400 instead of a 500.
 */

describe('text helpers', () => {
  it('detects control characters, optionally allowing line breaks', () => {
    expect(hasControlCharacter('Milch')).toBe(false);
    expect(hasControlCharacter('a\u0000b')).toBe(true);
    expect(hasControlCharacter('a\nb')).toBe(true);
    expect(hasControlCharacter('a\u007Fb')).toBe(true);
    expect(hasControlCharacter('a\u0085b')).toBe(true);
    expect(hasControlCharacter('Zeile 1\nZeile 2\r\n\tEnde', { multiline: true })).toBe(false);
    expect(hasControlCharacter('a\u0000b', { multiline: true })).toBe(true);
    expect(hasControlCharacter('a\u001Bb', { multiline: true })).toBe(true);
  });

  it('rejects bidi controls and blank names, keeps ZWJ emoji', () => {
    expect(hasForbiddenNameCharacters('Admin\u202Egnp.exe')).toBe(true);
    expect(hasForbiddenNameCharacters('a\u200Fb')).toBe(true);
    expect(hasForbiddenNameCharacters('Unser Zuhause')).toBe(false);
    expect(hasVisibleNameCharacter('\u200B\u2060')).toBe(false);
    expect(hasVisibleNameCharacter('\u{1F469}\u200D\u{1F4BB}')).toBe(true);
  });
});

describe('free-text request fields reject NUL / control characters', () => {
  const nul = 'Ju\u0000lia';

  it.each([
    ['display name', () => DisplayNameSchema.safeParse(nul)],
    ['household name (create)', () => CreateHouseholdRequestSchema.safeParse({ name: nul })],
    ['household name (rename)', () => RenameHouseholdRequestSchema.safeParse({ name: 'WG\nBasel' })],
    ['item name (create)', () => CreateItemRequestSchema.safeParse({ name: nul })],
    ['item name (update)', () => UpdateItemRequestSchema.safeParse({ name: nul, version: 1 })],
    ['shopping item name', () => CreateShoppingItemRequestSchema.safeParse({ name: nul })],
    ['chat message', () => MessageContentSchema.safeParse(nul)],
    ['inventory search', () => ItemListQuerySchema.safeParse({ search: nul })],
  ])('%s', (_label, parse) => {
    expect(parse().success).toBe(false);
  });

  it('still accepts normal input (multi-line chat messages included)', () => {
    expect(CreateHouseholdRequestSchema.safeParse({ name: 'WG Basel' }).success).toBe(true);
    expect(CreateItemRequestSchema.safeParse({ name: 'Olivenöl Extra Vergine' }).success).toBe(true);
    expect(MessageContentSchema.safeParse('Hallo\nwer kauft Milch?').success).toBe(true);
    expect(ItemListQuerySchema.safeParse({ search: 'Oliv' }).success).toBe(true);
  });

  it('rejects invisible-only and bidi-spoofed household and item names', () => {
    expect(CreateHouseholdRequestSchema.safeParse({ name: '\u200B\u200B' }).success).toBe(false);
    expect(CreateHouseholdRequestSchema.safeParse({ name: 'WG\u202Elesab' }).success).toBe(false);
    expect(CreateItemRequestSchema.safeParse({ name: '\u2800' }).success).toBe(false);
  });
});
