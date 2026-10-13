import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { LIMITS, imageUrl, type ImageUploadResponse } from '@homi/shared';
import type { Db, PrismaClient } from '../../db';
import { AppError } from '../../lib/http-errors';
import { imageStoragePrefix, imageVariantKey, type Storage } from '../../lib/storage';

/*
 * Image upload pipeline (§4.5): content sniffing → HEIC/HEIF conversion → sharp
 * (EXIF rotation, metadata stripped, pixel limit) → `thumb` (240 px square, cover) and
 * `full` (≤ 1600 px, inside) WebP variants under `<householdId>/<imageId>-<variant>.webp`.
 * Storage keys are generated here only – never from user input.
 */

export const MAX_IMAGE_PIXELS = LIMITS.upload.maxMegapixels * 1_000_000;
export const THUMB_SIZE = LIMITS.upload.thumbSize;
export const FULL_MAX_SIZE = LIMITS.upload.fullMaxSize;
/** Unattached uploads (form abandoned, image replaced before saving) are removed after this. */
export const ORPHAN_IMAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type DetectedImageKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'heif';

const MIME_KINDS: Readonly<Record<string, DetectedImageKind>> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heif',
  'image/heif': 'heif',
  'image/heic-sequence': 'heif',
  'image/heif-sequence': 'heif',
};

/** Detects the image type from the file content (magic bytes), ignoring name and client MIME type. */
export async function detectImageKind(buffer: Uint8Array): Promise<DetectedImageKind | null> {
  const detected = await fileTypeFromBuffer(buffer);
  return detected ? (MIME_KINDS[detected.mime] ?? null) : null;
}

export type HeicConverter = (buffer: Buffer) => Promise<Buffer>;

/** HEIC/HEIF → JPEG with `heic-convert` (loaded lazily: the WASM decoder is large). */
export const convertHeicToJpeg: HeicConverter = async (buffer) => {
  const { default: convert } = await import('heic-convert');
  const output = await convert({ buffer, format: 'JPEG', quality: 0.92 });
  return Buffer.from(output instanceof ArrayBuffer ? new Uint8Array(output) : output);
};

export interface ProcessedImage {
  kind: DetectedImageKind;
  thumb: Buffer;
  full: Buffer;
  /** Size of the `full` variant (after EXIF rotation). */
  width: number;
  height: number;
}

export interface ProcessImageOptions {
  /** Injectable for tests; defaults to `heic-convert`. */
  convertHeic?: HeicConverter;
  maxPixels?: number;
}

function unsupported(): AppError {
  return new AppError(
    'UNSUPPORTED_MEDIA_TYPE',
    'Dieses Dateiformat wird nicht unterstützt. Erlaubt sind JPEG, PNG, WebP, GIF und HEIC.',
  );
}

function invalidImage(cause?: unknown): AppError {
  return new AppError('IMAGE_INVALID', undefined, cause === undefined ? {} : { cause });
}

function tooManyPixels(maxPixels: number): AppError {
  return new AppError(
    'IMAGE_INVALID',
    `Das Bild ist zu gross (höchstens ${Math.round(maxPixels / 1_000_000)} Megapixel).`,
  );
}

/** Formats sharp may decode after sniffing (HEIC/HEIF arrive here already converted to JPEG). */
const DECODABLE_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp', 'gif']);

interface ImageHeader {
  format: string | undefined;
  width: number;
  height: number;
}

async function readHeader(input: Buffer): Promise<ImageHeader | null> {
  try {
    const meta = await sharp(input, { failOn: 'none' }).metadata();
    return meta.width && meta.height ? { format: meta.format, width: meta.width, height: meta.height } : null;
  } catch {
    return null;
  }
}

/**
 * Validates and converts an uploaded file into the two WebP variants. Throws
 * `415 UNSUPPORTED_MEDIA_TYPE` (not an allowed image type, e.g. SVG or a renamed text file) or
 * `422 IMAGE_INVALID` (cannot be decoded, more than 40 MP).
 */
export async function processImage(buffer: Buffer, options: ProcessImageOptions = {}): Promise<ProcessedImage> {
  const maxPixels = options.maxPixels ?? MAX_IMAGE_PIXELS;
  const kind = await detectImageKind(buffer);
  if (!kind) throw unsupported();

  let input = buffer;
  if (kind === 'heif') {
    // Refuse oversized photos before the (memory-hungry) full decode when the header is readable.
    const header = await readHeader(buffer);
    if (header && header.width * header.height > maxPixels) throw tooManyPixels(maxPixels);
    try {
      input = await (options.convertHeic ?? convertHeicToJpeg)(buffer);
    } catch (error) {
      throw invalidImage(error);
    }
  }

  // libvips sniffs on its own and could decode more (SVG, TIFF, …) – it must agree with the sniffing above.
  const header = await readHeader(input);
  if (!header || !header.format || !DECODABLE_FORMATS.has(header.format)) throw invalidImage();
  if (header.width * header.height > maxPixels) throw tooManyPixels(maxPixels);

  // `animated: false` (default) → GIF/WebP animations use their first frame. Output carries no
  // EXIF/XMP/ICC metadata (sharp strips it unless asked to keep it).
  const pipeline = () => sharp(input, { limitInputPixels: maxPixels, failOn: 'error' }).rotate();
  try {
    const [full, thumb] = await Promise.all([
      pipeline()
        .resize({ width: FULL_MAX_SIZE, height: FULL_MAX_SIZE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true }),
      pipeline()
        .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'cover', position: 'centre' })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true }),
    ]);
    return { kind, full: full.data, thumb: thumb.data, width: full.info.width, height: full.info.height };
  } catch (error) {
    throw invalidImage(error);
  }
}

export interface StoreImageInput {
  householdId: string;
  userId: string;
  image: ProcessedImage;
}

/** Writes both variants, then the `InventoryImage` row (files are removed again if the insert fails). */
export async function storeImage(
  prisma: PrismaClient,
  storage: Storage,
  { householdId, userId, image }: StoreImageInput,
): Promise<ImageUploadResponse> {
  const imageId = randomUUID();
  const storageKey = imageStoragePrefix(householdId, imageId);
  try {
    await storage.put(imageVariantKey(storageKey, 'thumb'), image.thumb);
    await storage.put(imageVariantKey(storageKey, 'full'), image.full);
    await prisma.inventoryImage.create({
      data: {
        id: imageId,
        householdId,
        storageKey,
        mimeType: 'image/webp',
        width: image.width,
        height: image.height,
        byteSize: image.thumb.length + image.full.length,
        createdById: userId,
      },
    });
  } catch (error) {
    await deleteImageFiles(storage, storageKey).catch(() => undefined);
    throw error;
  }
  return {
    id: imageId,
    width: image.width,
    height: image.height,
    thumbUrl: imageUrl(householdId, imageId, 'thumb'),
    fullUrl: imageUrl(householdId, imageId, 'full'),
  };
}

/** Removes both variants of an image (missing files are ignored). */
export async function deleteImageFiles(storage: Storage, storageKey: string): Promise<void> {
  await Promise.all([
    storage.delete(imageVariantKey(storageKey, 'thumb')),
    storage.delete(imageVariantKey(storageKey, 'full')),
  ]);
}

/** Best-effort file removal after a committed transaction (failures are logged, never thrown). */
export async function deleteImageFilesQuietly(
  storage: Storage,
  storageKeys: readonly string[],
  log: FastifyBaseLogger,
): Promise<void> {
  await Promise.all(
    storageKeys.map((storageKey) =>
      deleteImageFiles(storage, storageKey).catch((error: unknown) => {
        log.warn({ err: error, storageKey }, 'failed to delete image files');
      }),
    ),
  );
}

/**
 * Checks that `imageId` may be attached to an item of the household: it must belong to the
 * household, be uploaded by the acting user and not be attached to another item
 * (`currentItemId` = the item being edited).
 */
export async function assertAttachableImage(
  db: Db,
  input: { householdId: string; userId: string; imageId: string; currentItemId?: string },
): Promise<void> {
  const image = await db.inventoryImage.findFirst({
    where: { id: input.imageId, householdId: input.householdId },
    select: { createdById: true, item: { select: { id: true } } },
  });
  if (image?.item) {
    if (image.item.id === input.currentItemId) return;
    throw new AppError('IMAGE_IN_USE');
  }
  if (!image || image.createdById !== input.userId) {
    throw new AppError('VALIDATION', undefined, {
      details: { fieldErrors: { imageId: 'Das Bild wurde nicht gefunden.' }, formErrors: [] },
    });
  }
}

/** Deletes unattached images older than `maxAgeMs` (rows and files). Returns the number removed. */
export async function cleanupOrphanImages(
  prisma: PrismaClient,
  storage: Storage,
  log: FastifyBaseLogger,
  { maxAgeMs = ORPHAN_IMAGE_MAX_AGE_MS, now = new Date(), batchSize = 200 } = {},
): Promise<number> {
  const cutoff = new Date(now.getTime() - maxAgeMs);
  let removed = 0;
  for (;;) {
    const candidates = await prisma.inventoryImage.findMany({
      where: { createdAt: { lt: cutoff }, item: { is: null } },
      select: { id: true, storageKey: true },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
    if (candidates.length === 0) break;
    // Re-check "unattached" in the DELETE itself (an item may have attached one meanwhile).
    const deleted = await prisma.$queryRaw<Array<{ storageKey: string }>>`
      DELETE FROM "InventoryImage" img
      WHERE img."id" = ANY(${candidates.map((c) => c.id)}::uuid[])
        AND NOT EXISTS (SELECT 1 FROM "InventoryItem" it WHERE it."imageId" = img."id")
      RETURNING img."storageKey" AS "storageKey"`;
    await deleteImageFilesQuietly(
      storage,
      deleted.map((row) => row.storageKey),
      log,
    );
    removed += deleted.length;
    if (candidates.length < batchSize || deleted.length === 0) break;
  }
  return removed;
}
