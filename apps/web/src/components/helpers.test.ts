import { describe, expect, it } from 'vitest';
import { avatarTone, initialOf } from './avatarTone';
import { menuGroupStarts, placeContextMenu } from './overlayGeometry';
import { finalizePrice, sanitizePriceInput } from './priceInput';

describe('price input', () => {
  it('accepts a decimal comma and limits to two decimals', () => {
    expect(sanitizePriceInput('8,5')).toBe('8.5');
    expect(sanitizePriceInput('8.505', '8.50')).toBe('8.50');
    expect(sanitizePriceInput('abc', '1')).toBe('1');
    expect(sanitizePriceInput("2'485.50")).toBe('2485.50');
    expect(sanitizePriceInput('.5')).toBe('0.5');
    expect(sanitizePriceInput('007')).toBe('7');
    expect(sanitizePriceInput('')).toBe('');
  });

  it('completes prices on blur and keeps unknown prices empty', () => {
    expect(finalizePrice('8')).toBe('8.00');
    expect(finalizePrice('8.5')).toBe('8.50');
    expect(finalizePrice('')).toBe('');
  });
});

describe('avatarTone', () => {
  it('is stable, gives the signed-in user sage and never sage to others', () => {
    expect(avatarTone('user-1')).toBe(avatarTone('user-1'));
    expect(avatarTone('user-1', { self: true })).toBe('sage');
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) expect(avatarTone(id)).not.toBe('sage');
  });

  it('derives an upper-case initial', () => {
    expect(initialOf('lisa')).toBe('L');
    expect(initialOf('  ')).toBe('?');
    expect(initialOf('Ömer')).toBe('Ö');
  });
});

describe('context menu geometry', () => {
  const anchor = { top: 374, bottom: 450, left: 20, right: 373, width: 353, height: 76 };

  it('places the menu right-aligned 12 px below the anchor (design 16)', () => {
    expect(placeContextMenu(anchor, 201, { width: 393, height: 852 }, { top: 54, bottom: 34 })).toEqual({
      top: 462,
      left: 123,
      origin: 'top',
    });
  });

  it('flips above the anchor when there is no room below', () => {
    const low = { ...anchor, top: 700, bottom: 776 };
    expect(placeContextMenu(low, 201, { width: 393, height: 852 }, { top: 54, bottom: 34 })).toMatchObject({
      top: 700 - 12 - 201,
      origin: 'bottom',
    });
  });

  it('starts a new group before the first destructive item', () => {
    expect([...menuGroupStarts([{}, {}, {}, { destructive: true }])]).toEqual([3]);
    expect([...menuGroupStarts([{}, { separatorBefore: true }])]).toEqual([1]);
  });
});
