import { ITEM_CATEGORY_VALUES, UNIT_VALUES } from '@homi/shared/core';
import type { ItemImageDto } from '@homi/shared';
import type { ItemFormValues } from './formModel';
import type { ImageSelection } from './uploadState';

/*
 * In-progress item forms survive an accidental reload, a crash of the tab or a lost connection:
 * the sheet stores its input in `sessionStorage` under its history entry, so the same entry
 * (reload, back/forward) restores it while a newly opened sheet starts empty. Drafts expire after
 * 12 hours and are removed after saving. Storage failures (private mode, quota) are ignored.
 */

const PREFIX = 'homi:inventory-draft:';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_DRAFTS = 10;

export interface ItemDraft {
  values: ItemFormValues;
  /** Photo choice (an uploaded image stays on the server for 24 h until it is attached). */
  selection: ImageSelection;
  /** Item version the edit started from (`null` for new items). */
  baseVersion: number | null;
  savedAt: number;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isImage(value: unknown): value is ItemImageDto {
  if (typeof value !== 'object' || value === null) return false;
  const image = value as Record<string, unknown>;
  return isString(image.id) && isString(image.thumbUrl) && isString(image.fullUrl);
}

function parseSelection(value: unknown): ImageSelection | null {
  if (typeof value !== 'object' || value === null) return null;
  const selection = value as Record<string, unknown>;
  if (selection.kind === 'keep' || selection.kind === 'none') return { kind: selection.kind };
  if (selection.kind === 'pending' && isImage(selection.image)) return { kind: 'pending', image: selection.image };
  return null;
}

function parseValues(value: unknown): ItemFormValues | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const category = v.category;
  const unit = v.unit;
  if (!isString(v.name) || !isString(v.quantity) || !isString(v.unitPrice)) return null;
  if (category !== '' && !(ITEM_CATEGORY_VALUES as readonly unknown[]).includes(category)) return null;
  if (unit !== '' && !(UNIT_VALUES as readonly unknown[]).includes(unit)) return null;
  return {
    name: v.name.slice(0, 200),
    category: category as ItemFormValues['category'],
    quantity: v.quantity.slice(0, 32),
    unit: unit as ItemFormValues['unit'],
    unitPrice: v.unitPrice.slice(0, 32),
  };
}

export function loadDraft(scope: string, now: number = Date.now()): ItemDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + scope);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const values = parseValues(parsed.values);
    const selection = parseSelection(parsed.selection);
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
    const baseVersion = typeof parsed.baseVersion === 'number' ? parsed.baseVersion : null;
    if (!values || !selection || now - savedAt > MAX_AGE_MS) {
      store.removeItem(PREFIX + scope);
      return null;
    }
    return { values, selection, baseVersion, savedAt };
  } catch {
    return null;
  }
}

export function saveDraft(scope: string, draft: Omit<ItemDraft, 'savedAt'>, now: number = Date.now()): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PREFIX + scope, JSON.stringify({ ...draft, savedAt: now }));
    pruneDrafts(store, now);
  } catch {
    // quota / private mode – the draft is a convenience only
  }
}

export function clearDraft(scope: string): void {
  try {
    storage()?.removeItem(PREFIX + scope);
  } catch {
    // ignore
  }
}

/** Drops expired drafts and keeps only the newest few. */
function pruneDrafts(store: Storage, now: number): void {
  const entries: Array<{ key: string; savedAt: number }> = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!key?.startsWith(PREFIX)) continue;
    entries.push({ key, savedAt: readSavedAt(store.getItem(key)) });
  }
  entries.sort((a, b) => b.savedAt - a.savedAt);
  entries.forEach((entry, index) => {
    if (index >= MAX_DRAFTS || now - entry.savedAt > MAX_AGE_MS) store.removeItem(entry.key);
  });
}

function readSavedAt(raw: string | null): number {
  try {
    const parsed = JSON.parse(raw ?? '{}') as { savedAt?: unknown };
    return typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
  } catch {
    return 0;
  }
}
