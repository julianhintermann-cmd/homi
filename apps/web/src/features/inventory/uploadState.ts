import { LIMITS } from '@homi/shared/core';
import type { ItemImageDto } from '@homi/shared';
import { isApiError } from '@/api/client';
import type { ImageUploadState } from '@/components';

/*
 * Photo state of the item form (design 06/07/13) as a pure reducer.
 *
 * `selection` is what the form will save: keep the item's current image, no image, or a freshly
 * uploaded (not yet attached) image. `upload` is the transient transfer (progress, failure).
 * A failed upload never changes the selection, so saving still works without the new photo.
 */

export type ImageSelection = { kind: 'keep' } | { kind: 'none' } | { kind: 'pending'; image: ItemImageDto };

export type UploadProgressState =
  | { status: 'idle' }
  | { status: 'uploading'; previewUrl: string | null; progress: number | null; fileName: string }
  | { status: 'error'; previewUrl: string | null; message: string };

export interface PhotoState {
  /** The item's stored image (edit) – `null` for new items or items without a photo. */
  committed: ItemImageDto | null;
  selection: ImageSelection;
  upload: UploadProgressState;
}

export type PhotoAction =
  | { type: 'pick'; previewUrl: string | null; fileName: string }
  | { type: 'progress'; fraction: number | null }
  | { type: 'uploaded'; image: ItemImageDto }
  | { type: 'failed'; message: string }
  | { type: 'remove' }
  | { type: 'reset'; committed: ItemImageDto | null; selection?: ImageSelection };

export function initialPhotoState(committed: ItemImageDto | null, selection?: ImageSelection): PhotoState {
  return { committed, selection: selection ?? { kind: 'keep' }, upload: { status: 'idle' } };
}

export function photoReducer(state: PhotoState, action: PhotoAction): PhotoState {
  switch (action.type) {
    case 'pick':
      return {
        ...state,
        upload: { status: 'uploading', previewUrl: action.previewUrl, progress: null, fileName: action.fileName },
      };
    case 'progress':
      if (state.upload.status !== 'uploading') return state;
      return { ...state, upload: { ...state.upload, progress: action.fraction } };
    case 'uploaded':
      if (state.upload.status !== 'uploading') return state;
      return { ...state, selection: { kind: 'pending', image: action.image }, upload: { status: 'idle' } };
    case 'failed':
      if (state.upload.status !== 'uploading') return state;
      return { ...state, upload: { status: 'error', previewUrl: state.upload.previewUrl, message: action.message } };
    case 'remove':
      return { ...state, selection: { kind: 'none' }, upload: { status: 'idle' } };
    case 'reset':
      return initialPhotoState(action.committed, action.selection);
    default:
      return state;
  }
}

/** The image shown when no transfer is running. */
export function selectedImage(state: PhotoState): ItemImageDto | null {
  switch (state.selection.kind) {
    case 'pending':
      return state.selection.image;
    case 'none':
      return null;
    default:
      return state.committed;
  }
}

/** Props for `ImageUploadArea`. */
export function uploadAreaProps(state: PhotoState): {
  state: ImageUploadState;
  imageUrl: string | null;
  progress?: number;
  errorMessage?: string;
} {
  if (state.upload.status === 'uploading') {
    return {
      state: 'uploading',
      imageUrl: state.upload.previewUrl,
      ...(state.upload.progress === null ? {} : { progress: state.upload.progress }),
    };
  }
  if (state.upload.status === 'error') {
    return { state: 'error', imageUrl: state.upload.previewUrl, errorMessage: state.upload.message };
  }
  const image = selectedImage(state);
  return image ? { state: 'selected', imageUrl: image.fullUrl } : { state: 'empty', imageUrl: null };
}

export function isUploading(state: PhotoState): boolean {
  return state.upload.status === 'uploading';
}

/** Image id for a create request. */
export function imageIdForCreate(state: PhotoState): string | null {
  return selectedImage(state)?.id ?? null;
}

/** `imageId` for a partial update: `undefined` = unchanged. */
export function imageIdForUpdate(state: PhotoState): string | null | undefined {
  const next = selectedImage(state)?.id ?? null;
  const current = state.committed?.id ?? null;
  return next === current ? undefined : next;
}

/** The photo differs from what is stored. */
export function isPhotoDirty(state: PhotoState): boolean {
  return imageIdForUpdate(state) !== undefined;
}

/** A pending (uploaded, not yet attached) image id, e.g. to delete it when it is replaced or discarded. */
export function pendingImageId(state: PhotoState): string | null {
  return state.selection.kind === 'pending' ? state.selection.image.id : null;
}

const MAX_UPLOAD_BYTES = LIMITS.upload.defaultMaxMb * 1024 * 1024;
const HEIF_FILE_NAME = /\.(heic|heif)$/i;

/** Client-side pre-check (the server sniffs the content anyway). */
export function checkPhotoFile(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return `Das Foto ist zu gross (höchstens ${LIMITS.upload.defaultMaxMb} MB).`;
  if (file.type && !file.type.startsWith('image/') && !HEIF_FILE_NAME.test(file.name)) {
    return 'Dieses Dateiformat wird nicht unterstützt.';
  }
  return null;
}

/** German message for a failed upload (server message, offline hint or a generic fallback). */
export function uploadErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.isNetworkError) return 'Keine Verbindung – bitte erneut versuchen.';
    return error.message;
  }
  return 'Upload fehlgeschlagen';
}
