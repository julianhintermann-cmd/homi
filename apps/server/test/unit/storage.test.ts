import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LocalStorage,
  StorageKeyError,
  imageStoragePrefix,
  imageVariantKey,
  isValidStorageKey,
} from '../../src/lib/storage';

const HID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const IID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('isValidStorageKey', () => {
  it.each([`${HID}/${IID}-thumb.webp`, `${HID}/${IID}-full.webp`, 'a', 'a/b/c/d.png', 'A_b-1/x'])(
    'accepts %s',
    (key) => {
      expect(isValidStorageKey(key)).toBe(true);
    },
  );

  it.each([
    '',
    '../secret',
    'a/../b',
    '..',
    '.',
    '/etc/passwd',
    'a//b',
    'a/',
    'a\\b',
    'C:/Windows/win.ini',
    'c:',
    '.hidden',
    'a/.env',
    'a/b.tar.gz',
    'a/b.WEBP',
    'a/b/c/d/e',
    'a\u0000b',
    'äöü',
    'con',
    'x/NUL.txt',
    `${'a'.repeat(256)}`,
  ])('rejects %j', (key) => {
    expect(isValidStorageKey(key)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isValidStorageKey(undefined)).toBe(false);
    expect(isValidStorageKey(['a'])).toBe(false);
  });
});

describe('image keys', () => {
  it('derives keys only from UUIDs', () => {
    const prefix = imageStoragePrefix(HID, IID);
    expect(prefix).toBe(`${HID}/${IID}`);
    expect(imageVariantKey(prefix, 'thumb')).toBe(`${HID}/${IID}-thumb.webp`);
    expect(() => imageStoragePrefix('../x', IID)).toThrow(StorageKeyError);
    expect(() => imageStoragePrefix(HID, 'not-a-uuid')).toThrow(StorageKeyError);
  });
});

describe('LocalStorage', () => {
  let root: string;
  let storage: LocalStorage;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'homi-storage-'));
    storage = new LocalStorage(root);
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('stores, streams and deletes objects atomically', async () => {
    const key = imageVariantKey(imageStoragePrefix(HID, IID), 'full');
    await storage.put(key, Buffer.from('webp-bytes'));
    expect(await storage.exists(key)).toBe(true);

    const stream = await storage.getStream(key);
    expect(stream).not.toBeNull();
    expect(await text(stream!)).toBe('webp-bytes');
    // no temp files left behind
    expect(await readdir(path.join(root, HID))).toEqual([`${IID}-full.webp`]);

    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
    await expect(storage.delete(key)).resolves.toBeUndefined();
    expect(await storage.getStream(key)).toBeNull();
  });

  it('deletes a household prefix recursively', async () => {
    await storage.put(`${HID}/a-thumb.webp`, Buffer.from('1'));
    await storage.put(`${HID}/b-thumb.webp`, Buffer.from('2'));
    await storage.deletePrefix(HID);
    expect(await storage.exists(`${HID}/a-thumb.webp`)).toBe(false);
    await expect(storage.deletePrefix('../')).rejects.toThrow(StorageKeyError);
    await expect(storage.deletePrefix(`${HID}/x`)).rejects.toThrow(StorageKeyError);
  });

  it('refuses traversal on every operation', async () => {
    await expect(storage.put('../escape.webp', Buffer.from('x'))).rejects.toThrow(StorageKeyError);
    await expect(storage.getStream('../../etc/passwd')).rejects.toThrow(StorageKeyError);
    await expect(storage.exists('a/../../b')).rejects.toThrow(StorageKeyError);
    await expect(storage.delete('/abs')).rejects.toThrow(StorageKeyError);
    expect(() => storage.resolveKey('..\\..\\x')).toThrow(StorageKeyError);
  });
});
