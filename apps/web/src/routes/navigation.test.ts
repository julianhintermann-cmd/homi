import { afterEach, describe, expect, it } from 'vitest';
import {
  createFallbackLocation,
  getBackgroundLocation,
  hasInAppHistory,
  matchSheetRoute,
  sheetFallbackPath,
  sheetLinkState,
} from './navigation';
import { isTabPath, tabIndexForPath } from './paths';

afterEach(() => {
  window.history.replaceState(null, '');
});

describe('sheet routes', () => {
  it('matches only the two sheet URLs', () => {
    expect(matchSheetRoute('/inventar/neu')).toEqual({ kind: 'inventory-new' });
    expect(matchSheetRoute('/inventar/abc/bearbeiten')).toEqual({ kind: 'inventory-edit', itemId: 'abc' });
    expect(matchSheetRoute('/inventar/abc')).toBeNull();
    expect(matchSheetRoute('/inventar')).toBeNull();
  });

  it('falls back to the list / item detail for deep links', () => {
    expect(sheetFallbackPath({ kind: 'inventory-new' })).toBe('/inventar');
    expect(sheetFallbackPath({ kind: 'inventory-edit', itemId: 'a b' })).toBe('/inventar/a%20b');
  });

  it('accepts a background location from state but never another sheet', () => {
    const background = createFallbackLocation('/inventar/abc');
    expect(getBackgroundLocation({ backgroundLocation: background })).toBe(background);
    expect(getBackgroundLocation({ backgroundLocation: createFallbackLocation('/inventar/neu') })).toBeNull();
    expect(getBackgroundLocation({ backgroundLocation: 'nope' })).toBeNull();
    expect(getBackgroundLocation(null)).toBeNull();
  });

  it('keeps the original background when a sheet opens from a sheet', () => {
    const list = createFallbackLocation('/inventar');
    const sheet = { ...createFallbackLocation('/inventar/neu'), state: { backgroundLocation: list } };
    expect(sheetLinkState(sheet).backgroundLocation).toBe(list);
    expect(sheetLinkState(list).backgroundLocation).toBe(list);
  });
});

describe('hasInAppHistory', () => {
  it('reads React Router’s history index', () => {
    window.history.replaceState({ idx: 0, key: 'a', usr: null }, '');
    expect(hasInAppHistory()).toBe(false);
    window.history.replaceState({ idx: 2, key: 'b', usr: null }, '');
    expect(hasInAppHistory()).toBe(true);
    window.history.replaceState(null, '');
    expect(hasInAppHistory()).toBe(false);
  });
});

describe('tab paths', () => {
  it('identifies the four tab roots (trailing slash tolerant)', () => {
    expect(tabIndexForPath('/')).toBe(0);
    expect(tabIndexForPath('/inventar/')).toBe(1);
    expect(tabIndexForPath('/einkauf')).toBe(2);
    expect(tabIndexForPath('/chats')).toBe(3);
    expect(isTabPath('/inventar/abc')).toBe(false);
    expect(isTabPath('/haushalt')).toBe(false);
  });
});
