import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateItemRequestSchema,
  ImageQuerySchema,
  ItemListQuerySchema,
  QuantityChangeRequestSchema,
  UpdateItemRequestSchema,
  type SyncAction,
} from '@homi/shared';
import { AppError } from '../../lib/http-errors';
import { RATE_LIMITS, type KeyedRateLimiter } from '../../lib/rate-limit';
import { imageVariantKey } from '../../lib/storage';
import { requireMember } from '../../plugins/auth';
import {
  MAX_PENDING_UPLOADS_PER_USER,
  cleanupOrphanImages,
  createImageProcessingQueue,
  deleteImageFilesQuietly,
  processImage,
  storeImage,
} from './images';
import { listItems } from './list';
import { changeQuantity, createItem, deleteItem, getItem, updateItem, type InventoryActor } from './service';

/**
 * Inventory (§5): /households/:householdId/items(/:itemId(/quantity)) and
 * /households/:householdId/images(/:imageId). Registered by app.ts under `/api`.
 *
 * Every route checks the membership first (non-members and malformed ids → 404) and every query
 * filters by `householdId`. Realtime `sync` events (scopes `inventory` + `dashboard`) are emitted
 * only after the transaction committed; image files are deleted after the commit as well.
 *
 * Writes are rate-limited per user (every write records an activity and makes every member's
 * client refetch twice), uploads per IP and per user, and at most two images are decoded at once.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Unattached uploads older than 24 h are removed hourly (first run shortly after start). */
const ORPHAN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const ORPHAN_CLEANUP_FIRST_RUN_MS = 2 * 60 * 1000;

const IMAGE_CACHE_CONTROL = 'private, max-age=31536000, immutable';

/**
 * Item writes (create, edit, quantity, delete) per user. Generous for real use – the quantity
 * stepper sends one request per burst, bulk entry is a few items per minute – but a script can no
 * longer flood the activity log and every member's socket (each write emits two `sync` events).
 */
export const INVENTORY_WRITE_LIMIT = { max: 150, windowMs: 60_000 } as const;

/** Photo uploads per user (on top of the per-IP preset, which a proxy setup may not see). */
export const UPLOAD_USER_LIMIT = { max: 30, windowMs: 10 * 60_000 } as const;

function consumeOrThrow(limiter: KeyedRateLimiter, reply: FastifyReply, key: string, message: string): void {
  if (limiter.consume(key)) return;
  const retryAfterSeconds = Math.max(1, Math.ceil(limiter.retryAfterMs(key) / 1000));
  reply.header('retry-after', String(retryAfterSeconds));
  throw new AppError('RATE_LIMITED', message, { details: { retryAfterSeconds } });
}

const WRITE_RATE_LIMITED = 'Zu viele Änderungen in kurzer Zeit. Bitte warte einen Moment.';
const UPLOAD_RATE_LIMITED = 'Zu viele Fotos in kurzer Zeit. Bitte warte einen Moment.';

interface HouseholdParams {
  householdId: string;
}
interface ItemParams extends HouseholdParams {
  itemId: string;
}
interface ImageParams extends HouseholdParams {
  imageId: string;
}

async function actorFor(request: FastifyRequest, householdId: string): Promise<InventoryActor> {
  const membership = await requireMember(request, householdId);
  return { householdId: membership.householdId, userId: membership.user.id };
}

/** Path ids that are not UUIDs can never exist – answer like an unknown id. */
function assertId(id: string, message?: string): void {
  if (!UUID.test(id)) throw new AppError('NOT_FOUND', message);
}

/** `If-None-Match` may hold several (weak) validators. */
function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === etag || value === '*');
}

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  const writes = app.createKeyedRateLimiter(INVENTORY_WRITE_LIMIT);
  const uploads = app.createKeyedRateLimiter(UPLOAD_USER_LIMIT);
  const imageQueue = createImageProcessingQueue();
  const consumeWrite = (reply: FastifyReply, actor: InventoryActor): void =>
    consumeOrThrow(writes, reply, `inventory:${actor.userId}`, WRITE_RATE_LIMITED);

  const emitItemSync = (actor: InventoryActor, action: SyncAction, itemId: string): void => {
    const base = { householdId: actor.householdId, action, entityId: itemId, actorId: actor.userId };
    app.realtime.emitSync({ ...base, scope: 'inventory' });
    app.realtime.emitSync({ ...base, scope: 'dashboard' });
  };

  // ── Items ────────────────────────────────────────────────────────────────

  app.get<{ Params: HouseholdParams }>('/households/:householdId/items', async (request) => {
    const actor = await actorFor(request, request.params.householdId);
    const query = ItemListQuerySchema.parse(request.query ?? {});
    return listItems(app.prisma, { ...query, householdId: actor.householdId });
  });

  app.post<{ Params: HouseholdParams }>('/households/:householdId/items', async (request, reply) => {
    const actor = await actorFor(request, request.params.householdId);
    consumeWrite(reply, actor);
    const input = CreateItemRequestSchema.parse(request.body ?? {});
    const item = await createItem(app.prisma, actor, input);
    emitItemSync(actor, 'created', item.id);
    return reply.code(201).send(item);
  });

  app.get<{ Params: ItemParams }>('/households/:householdId/items/:itemId', async (request) => {
    const actor = await actorFor(request, request.params.householdId);
    assertId(request.params.itemId, 'Dieser Artikel existiert nicht mehr.');
    return getItem(app.prisma, actor, request.params.itemId);
  });

  app.patch<{ Params: ItemParams }>('/households/:householdId/items/:itemId', async (request, reply) => {
    const actor = await actorFor(request, request.params.householdId);
    assertId(request.params.itemId, 'Dieser Artikel existiert nicht mehr.');
    consumeWrite(reply, actor);
    const input = UpdateItemRequestSchema.parse(request.body ?? {});
    const result = await updateItem(app.prisma, actor, request.params.itemId, input);
    if (result.changed) emitItemSync(actor, 'updated', result.item.id);
    if (result.removedImageKey) await deleteImageFilesQuietly(app.storage, [result.removedImageKey], request.log);
    return result.item;
  });

  app.post<{ Params: ItemParams }>('/households/:householdId/items/:itemId/quantity', async (request, reply) => {
    const actor = await actorFor(request, request.params.householdId);
    assertId(request.params.itemId, 'Dieser Artikel existiert nicht mehr.');
    consumeWrite(reply, actor);
    const { delta } = QuantityChangeRequestSchema.parse(request.body ?? {});
    const result = await changeQuantity(app.prisma, actor, request.params.itemId, delta);
    if (result.changed) emitItemSync(actor, 'updated', result.item.id);
    return result.item;
  });

  app.delete<{ Params: ItemParams }>('/households/:householdId/items/:itemId', async (request, reply) => {
    const actor = await actorFor(request, request.params.householdId);
    assertId(request.params.itemId, 'Dieser Artikel existiert nicht mehr.');
    consumeWrite(reply, actor);
    const { removedImageKey } = await deleteItem(app.prisma, actor, request.params.itemId);
    emitItemSync(actor, 'deleted', request.params.itemId);
    if (removedImageKey) await deleteImageFilesQuietly(app.storage, [removedImageKey], request.log);
    return reply.code(204).send();
  });

  // ── Images ───────────────────────────────────────────────────────────────

  app.post<{ Params: HouseholdParams }>(
    '/households/:householdId/images',
    { config: { rateLimit: RATE_LIMITS.upload } },
    async (request, reply) => {
      const actor = await actorFor(request, request.params.householdId);
      consumeOrThrow(uploads, reply, `upload:${actor.userId}`, UPLOAD_RATE_LIMITED);
      if (!request.isMultipart()) {
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Bitte lade das Foto als Formular-Datei hoch.');
      }
      const file = await request.file();
      if (!file || file.fieldname !== 'file') {
        throw new AppError('VALIDATION', 'Bitte wähle ein Foto aus.', {
          details: { fieldErrors: { file: 'Bitte wähle ein Foto aus.' }, formErrors: [] },
        });
      }
      // Throws 413 (→ PAYLOAD_TOO_LARGE) when the file exceeds MAX_UPLOAD_MB.
      const buffer = await file.toBuffer();
      if (buffer.length === 0) throw new AppError('IMAGE_INVALID', 'Die Datei ist leer.');

      // Unattached uploads are purged after 24 h – until then they count against a small quota.
      const pending = await app.prisma.inventoryImage.count({
        where: { householdId: actor.householdId, createdById: actor.userId, item: { is: null } },
      });
      if (pending >= MAX_PENDING_UPLOADS_PER_USER) {
        throw new AppError(
          'CONFLICT',
          'Du hast viele Fotos hochgeladen, die noch keinem Artikel gehören. Speichere oder verwirf zuerst deine Entwürfe.',
        );
      }

      // At most two decodes at once (each holds the upload plus libvips buffers); a full queue → 503.
      const processed = await imageQueue.run(() => processImage(buffer));
      const stored = await storeImage(app.prisma, app.storage, {
        householdId: actor.householdId,
        userId: actor.userId,
        image: processed,
      });
      request.log.info(
        { imageId: stored.id, kind: processed.kind, width: stored.width, height: stored.height },
        'image uploaded',
      );
      return reply.code(201).send(stored);
    },
  );

  app.get<{ Params: ImageParams; Querystring: Record<string, unknown> }>(
    '/households/:householdId/images/:imageId',
    async (request, reply) => {
      const actor = await actorFor(request, request.params.householdId);
      assertId(request.params.imageId);
      const { variant } = ImageQuerySchema.parse(request.query ?? {});
      const image = await app.prisma.inventoryImage.findFirst({
        where: { id: request.params.imageId, householdId: actor.householdId },
        select: { id: true, storageKey: true },
      });
      if (!image) throw new AppError('NOT_FOUND');

      const etag = `"${image.id}-${variant}"`;
      void reply
        .header('cache-control', IMAGE_CACHE_CONTROL)
        .header('x-content-type-options', 'nosniff')
        .header('etag', etag);
      if (matchesEtag(request.headers['if-none-match'], etag)) return reply.code(304).send();

      const stream = await app.storage.getStream(imageVariantKey(image.storageKey, variant));
      if (!stream) throw new AppError('NOT_FOUND');
      return reply.type('image/webp').header('content-disposition', 'inline').send(stream);
    },
  );

  app.delete<{ Params: ImageParams }>('/households/:householdId/images/:imageId', async (request, reply) => {
    const actor = await actorFor(request, request.params.householdId);
    assertId(request.params.imageId);
    const image = await app.prisma.inventoryImage.findFirst({
      where: { id: request.params.imageId, householdId: actor.householdId },
      select: { id: true, createdById: true, item: { select: { id: true } } },
    });
    // Pending uploads are private to their uploader; attached images go with their item.
    if (!image || (!image.item && image.createdById !== actor.userId)) throw new AppError('NOT_FOUND');
    if (image.item) throw new AppError('IMAGE_IN_USE');

    const deleted = await app.prisma.$queryRaw<Array<{ storageKey: string }>>`
      DELETE FROM "InventoryImage" img
      WHERE img."id" = ${image.id}::uuid AND img."householdId" = ${actor.householdId}::uuid
        AND NOT EXISTS (SELECT 1 FROM "InventoryItem" it WHERE it."imageId" = img."id")
      RETURNING img."storageKey" AS "storageKey"`;
    if (deleted.length === 0) throw new AppError('IMAGE_IN_USE');
    await deleteImageFilesQuietly(
      app.storage,
      deleted.map((row) => row.storageKey),
      request.log,
    );
    return reply.code(204).send();
  });

  // ── Orphan cleanup ───────────────────────────────────────────────────────

  let running: Promise<unknown> | null = null;
  const runCleanup = (): void => {
    if (running) return;
    running = cleanupOrphanImages(app.prisma, app.storage, app.log)
      .then((removed) => {
        if (removed > 0) app.log.info({ removed }, 'removed orphaned images');
      })
      .catch((error: unknown) => app.log.warn({ err: error }, 'orphaned image cleanup failed'))
      .finally(() => {
        running = null;
      });
  };
  const firstRun = setTimeout(runCleanup, ORPHAN_CLEANUP_FIRST_RUN_MS);
  const interval = setInterval(runCleanup, ORPHAN_CLEANUP_INTERVAL_MS);
  firstRun.unref();
  interval.unref();
  app.addHook('onClose', async () => {
    clearTimeout(firstRun);
    clearInterval(interval);
    await running;
  });
};
