import { describe, expect, it } from 'vitest';
import { ApiError, networkError } from '@/api/client';
import {
  checkPhotoFile,
  imageIdForCreate,
  imageIdForUpdate,
  initialPhotoState,
  isPhotoDirty,
  isUploading,
  pendingImageId,
  photoReducer,
  uploadAreaProps,
  uploadErrorMessage,
  type PhotoAction,
  type PhotoState,
} from './uploadState';

const stored = { id: 'img-old', thumbUrl: '/t-old', fullUrl: '/f-old' };
const fresh = { id: 'img-new', thumbUrl: '/t-new', fullUrl: '/f-new' };

function run(state: PhotoState, ...actions: PhotoAction[]): PhotoState {
  return actions.reduce(photoReducer, state);
}

describe('photo upload state machine (design 06/13)', () => {
  it('goes empty → uploading (progress) → selected for a new item', () => {
    const empty = initialPhotoState(null);
    expect(uploadAreaProps(empty)).toEqual({ state: 'empty', imageUrl: null });
    expect(imageIdForCreate(empty)).toBeNull();
    expect(isPhotoDirty(empty)).toBe(false);

    const picked = run(empty, { type: 'pick', previewUrl: 'blob:1', fileName: 'oel.jpg' });
    expect(isUploading(picked)).toBe(true);
    expect(uploadAreaProps(picked)).toEqual({ state: 'uploading', imageUrl: 'blob:1' });
    const halfway = run(picked, { type: 'progress', fraction: 0.5 });
    expect(uploadAreaProps(halfway)).toEqual({ state: 'uploading', imageUrl: 'blob:1', progress: 0.5 });

    const done = run(halfway, { type: 'uploaded', image: fresh });
    expect(isUploading(done)).toBe(false);
    expect(uploadAreaProps(done)).toEqual({ state: 'selected', imageUrl: '/f-new' });
    expect(imageIdForCreate(done)).toBe('img-new');
    expect(pendingImageId(done)).toBe('img-new');
    expect(isPhotoDirty(done)).toBe(true);
  });

  it('keeps the previous selection when an upload fails', () => {
    const editing = initialPhotoState(stored);
    expect(uploadAreaProps(editing)).toEqual({ state: 'selected', imageUrl: '/f-old' });
    expect(imageIdForUpdate(editing)).toBeUndefined();

    const failed = run(
      editing,
      { type: 'pick', previewUrl: null, fileName: 'IMG_1.HEIC' },
      { type: 'failed', message: 'Das Bild konnte nicht verarbeitet werden.' },
    );
    expect(uploadAreaProps(failed)).toEqual({
      state: 'error',
      imageUrl: null,
      errorMessage: 'Das Bild konnte nicht verarbeitet werden.',
    });
    expect(imageIdForUpdate(failed)).toBeUndefined(); // saving keeps the stored photo
    expect(isPhotoDirty(failed)).toBe(false);
  });

  it('replaces and removes photos of an existing item', () => {
    const replaced = run(
      initialPhotoState(stored),
      { type: 'pick', previewUrl: 'blob:2', fileName: 'neu.png' },
      { type: 'uploaded', image: fresh },
    );
    expect(imageIdForUpdate(replaced)).toBe('img-new');

    const removed = run(replaced, { type: 'remove' });
    expect(uploadAreaProps(removed)).toEqual({ state: 'empty', imageUrl: null });
    expect(imageIdForUpdate(removed)).toBeNull();
    expect(pendingImageId(removed)).toBeNull();

    // removing a photo from an item without one is no change
    expect(isPhotoDirty(run(initialPhotoState(null), { type: 'remove' }))).toBe(false);
  });

  it('ignores stray events and restores drafts', () => {
    const idle = initialPhotoState(null);
    expect(run(idle, { type: 'progress', fraction: 1 })).toBe(idle);
    expect(run(idle, { type: 'uploaded', image: fresh })).toBe(idle);
    expect(run(idle, { type: 'failed', message: 'x' })).toBe(idle);

    const restored = initialPhotoState(stored, { kind: 'pending', image: fresh });
    expect(imageIdForUpdate(restored)).toBe('img-new');
    const reset = run(restored, { type: 'reset', committed: fresh, selection: restored.selection });
    expect(imageIdForUpdate(reset)).toBeUndefined(); // the new version already has that photo
  });

  it('pre-checks files and maps upload errors', () => {
    expect(checkPhotoFile({ name: 'oel.jpg', type: 'image/jpeg', size: 2_000_000 })).toBeNull();
    expect(checkPhotoFile({ name: 'IMG_0001.HEIC', type: '', size: 3_000_000 })).toBeNull();
    expect(checkPhotoFile({ name: 'IMG_0001.heic', type: 'application/octet-stream', size: 3_000_000 })).toBeNull();
    expect(checkPhotoFile({ name: 'notiz.txt', type: 'text/plain', size: 10 })).toBe(
      'Dieses Dateiformat wird nicht unterstützt.',
    );
    expect(checkPhotoFile({ name: 'riesig.png', type: 'image/png', size: 16 * 1024 * 1024 })).toBe(
      'Das Foto ist zu gross (höchstens 15 MB).',
    );
    expect(
      uploadErrorMessage(
        new ApiError({
          status: 415,
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Dieses Dateiformat wird nicht unterstützt.',
        }),
      ),
    ).toBe('Dieses Dateiformat wird nicht unterstützt.');
    expect(uploadErrorMessage(networkError())).toBe('Keine Verbindung – bitte erneut versuchen.');
    expect(uploadErrorMessage(new Error('x'))).toBe('Upload fehlgeschlagen');
  });
});
