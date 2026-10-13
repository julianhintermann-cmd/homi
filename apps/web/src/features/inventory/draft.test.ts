import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, loadDraft, saveDraft } from './draft';

const values = {
  name: 'Olivenöl',
  category: 'KUECHE' as const,
  quantity: '2',
  unit: 'FLASCHE' as const,
  unitPrice: '8.5',
};

describe('item form drafts (sessionStorage)', () => {
  afterEach(() => window.sessionStorage.clear());

  it('restores a saved draft for the same scope only', () => {
    saveDraft('h1:new:abc', { values, selection: { kind: 'keep' }, baseVersion: null }, 1_000);
    expect(loadDraft('h1:new:abc', 2_000)).toEqual({
      values,
      selection: { kind: 'keep' },
      baseVersion: null,
      savedAt: 1_000,
    });
    expect(loadDraft('h1:new:other', 2_000)).toBeNull();
    clearDraft('h1:new:abc');
    expect(loadDraft('h1:new:abc', 2_000)).toBeNull();
  });

  it('keeps uploaded photos and drops expired or malformed drafts', () => {
    const image = { id: 'img', thumbUrl: '/t', fullUrl: '/f' };
    saveDraft('s', { values, selection: { kind: 'pending', image }, baseVersion: 4 }, 0);
    expect(loadDraft('s', 60_000)?.selection).toEqual({ kind: 'pending', image });
    expect(loadDraft('s', 13 * 60 * 60 * 1000)).toBeNull();

    window.sessionStorage.setItem('homi:inventory-draft:bad', '{"values":{"name":1}}');
    expect(loadDraft('bad')).toBeNull();
    window.sessionStorage.setItem('homi:inventory-draft:bad2', 'not json');
    expect(loadDraft('bad2')).toBeNull();
    window.sessionStorage.setItem(
      'homi:inventory-draft:bad3',
      JSON.stringify({ values: { ...values, unit: 'KISTE' }, selection: { kind: 'keep' }, savedAt: Date.now() }),
    );
    expect(loadDraft('bad3')).toBeNull();
  });

  it('keeps only the newest drafts and survives a broken storage', () => {
    for (let index = 0; index < 14; index += 1) {
      saveDraft(`d${index}`, { values, selection: { kind: 'keep' }, baseVersion: null }, 1_000 + index);
    }
    const kept = Object.keys(window.sessionStorage).filter((key) => key.startsWith('homi:inventory-draft:'));
    expect(kept).toHaveLength(10);
    expect(loadDraft('d0', 2_000)).toBeNull();
    expect(loadDraft('d13', 2_000)).not.toBeNull();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveDraft('quota', { values, selection: { kind: 'keep' }, baseVersion: null })).not.toThrow();
  });
});
