import type {
  CreateItemRequest,
  ImageUploadResponse,
  InventoryItemDto,
  ItemCategory,
  ItemListResponse,
  ItemSort,
  UpdateItemRequest,
} from '@homi/shared';
import { api, uploadFile, type UploadProgress } from './client';

/**
 * Inventory API (ARCHITECTURE §5 "Inventory"). All routes are household-scoped; ids are
 * URL-encoded. Money and quantities travel as decimal strings.
 */

function householdPath(householdId: string): string {
  return `/api/households/${encodeURIComponent(householdId)}`;
}

function itemPath(householdId: string, itemId: string): string {
  return `${householdPath(householdId)}/items/${encodeURIComponent(itemId)}`;
}

export interface ItemListParams {
  search?: string | null;
  category?: ItemCategory | null;
  sort?: ItemSort;
  cursor?: string | null;
  limit?: number;
}

export function fetchItems(
  householdId: string,
  params: ItemListParams = {},
  signal?: AbortSignal,
): Promise<ItemListResponse> {
  return api.get<ItemListResponse>(`${householdPath(householdId)}/items`, {
    signal,
    query: {
      search: params.search,
      category: params.category,
      sort: params.sort,
      cursor: params.cursor,
      limit: params.limit,
    },
  });
}

export function fetchItem(householdId: string, itemId: string, signal?: AbortSignal): Promise<InventoryItemDto> {
  return api.get<InventoryItemDto>(itemPath(householdId, itemId), { signal });
}

export function createItem(householdId: string, body: CreateItemRequest): Promise<InventoryItemDto> {
  return api.post<InventoryItemDto>(`${householdPath(householdId)}/items`, body);
}

/** Partial update; `version` must be the version the edit started from (409 `VERSION_CONFLICT` otherwise). */
export function updateItem(householdId: string, itemId: string, body: UpdateItemRequest): Promise<InventoryItemDto> {
  return api.patch<InventoryItemDto>(itemPath(householdId, itemId), body);
}

/** Atomic `quantity = max(quantity + delta, 0)` on the server. */
export function changeItemQuantity(householdId: string, itemId: string, delta: string): Promise<InventoryItemDto> {
  return api.post<InventoryItemDto>(`${itemPath(householdId, itemId)}/quantity`, { delta });
}

export function deleteItem(householdId: string, itemId: string): Promise<void> {
  return api.delete<void>(itemPath(householdId, itemId));
}

export interface UploadImageOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/** Multipart upload (`file`); the server converts HEIC/HEIF and returns WebP variants. */
export function uploadItemImage(
  householdId: string,
  file: Blob,
  options: UploadImageOptions = {},
): Promise<ImageUploadResponse> {
  return uploadFile<ImageUploadResponse>(`${householdPath(householdId)}/images`, file, {
    fieldName: 'file',
    onProgress: options.onProgress,
    signal: options.signal,
  });
}

/** Deletes an uploaded image that is not attached to an item (409 `IMAGE_IN_USE` otherwise). */
export function deleteItemImage(householdId: string, imageId: string): Promise<void> {
  return api.delete<void>(`${householdPath(householdId)}/images/${encodeURIComponent(imageId)}`);
}
