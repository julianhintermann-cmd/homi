import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ImageUploadResponseSchema, InventoryItemDtoSchema, type ImageUploadResponse } from '@homi/shared';
import { imageVariantKey } from '../../src/lib/storage';
import { cleanupOrphanImages, detectImageKind, processImage } from '../../src/modules/inventory/images';
import { buildTestApp, type TestApp } from '../helpers/app';
import { createHousehold, createLoggedInUser } from '../helpers/fixtures';
import type { TestClient } from '../helpers/http';

const HOUR = 60 * 60 * 1000;

function multipart(data: Buffer, filename: string, contentType: string, field = 'file') {
  const boundary = `----homi-${randomUUID()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    rawBody: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

function solid(width: number, height: number, background = '#5e7d63') {
  return sharp({ create: { width, height, channels: 3, background } });
}

/** A minimal ISO-BMFF `ftyp` box announcing HEIC – detected as image/heic but not decodable. */
function fakeHeic(): Buffer {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write('ftyp', 4);
  ftyp.write('heic', 8);
  ftyp.writeUInt32BE(0, 12);
  ftyp.write('mif1', 16);
  ftyp.write('heic', 20);
  return Buffer.concat([ftyp, Buffer.alloc(512)]);
}

describe('inventory images', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  async function setup(name = 'Lena') {
    const owner = await createLoggedInUser(t.app, { displayName: name });
    const household = await createHousehold(t.prisma, owner.user.id);
    return { ...owner, household, base: `/api/households/${household.id}` };
  }

  async function upload(client: TestClient, base: string, data: Buffer, filename = 'foto.jpg', type = 'image/jpeg') {
    return client.post(`${base}/images`, undefined, multipart(data, filename, type));
  }

  async function uploadOk(client: TestClient, base: string, data: Buffer, filename?: string, type?: string) {
    const response = await upload(client, base, data, filename, type);
    expect(response.statusCode, response.body).toBe(201);
    return ImageUploadResponseSchema.parse(response.json());
  }

  async function fetchVariant(
    client: TestClient,
    image: Pick<ImageUploadResponse, 'thumbUrl' | 'fullUrl'>,
    variant: 'thumb' | 'full',
  ) {
    const response = await client.get(variant === 'thumb' ? image.thumbUrl : image.fullUrl);
    expect(response.statusCode).toBe(200);
    return response;
  }

  describe('upload pipeline', () => {
    it('stores a JPEG as thumb + full WebP, rotated per EXIF and without metadata', async () => {
      const { client, base, household, user } = await setup();
      const jpeg = await solid(2400, 1200)
        .jpeg({ quality: 80 })
        .withMetadata({ orientation: 6 })
        .withExif({ IFD0: { Copyright: 'geheim', Artist: 'Lena' } })
        .toBuffer();
      const image = await uploadOk(client, base, jpeg);
      // orientation 6 = rotate 90° → portrait; full fits into 1600 × 1600
      expect(image).toMatchObject({ width: 800, height: 1600 });
      expect(image.thumbUrl).toBe(`/api/households/${household.id}/images/${image.id}?variant=thumb`);
      expect(image.fullUrl).toBe(`/api/households/${household.id}/images/${image.id}?variant=full`);

      const row = await t.prisma.inventoryImage.findUniqueOrThrow({ where: { id: image.id } });
      expect(row).toMatchObject({
        householdId: household.id,
        storageKey: `${household.id}/${image.id}`,
        mimeType: 'image/webp',
        width: 800,
        height: 1600,
        createdById: user.id,
      });

      const thumb = await fetchVariant(client, image, 'thumb');
      const thumbMeta = await sharp(thumb.rawPayload).metadata();
      expect(thumbMeta).toMatchObject({ format: 'webp', width: 240, height: 240 });
      expect(thumbMeta.exif).toBeUndefined();

      const full = await fetchVariant(client, image, 'full');
      const fullMeta = await sharp(full.rawPayload).metadata();
      expect(fullMeta).toMatchObject({ format: 'webp', width: 800, height: 1600 });
      expect(fullMeta.exif).toBeUndefined();
      expect(fullMeta.orientation).toBeUndefined();
      expect(full.rawPayload.includes(Buffer.from('geheim'))).toBe(false);
    });

    it('accepts PNG, WebP and GIF and never enlarges small images', async () => {
      const { client, base } = await setup();
      const png = await uploadOk(client, base, await solid(300, 200).png().toBuffer(), 'a.png', 'image/png');
      expect(png).toMatchObject({ width: 300, height: 200 });
      const webp = await uploadOk(client, base, await solid(1000, 3200).webp().toBuffer(), 'b.webp', 'image/webp');
      expect(webp).toMatchObject({ width: 500, height: 1600 });
      const gif = await uploadOk(client, base, await solid(64, 48).gif().toBuffer(), 'c.gif', 'image/gif');
      expect(gif).toMatchObject({ width: 64, height: 48 });
      const thumb = await fetchVariant(client, gif, 'thumb');
      expect(await sharp(thumb.rawPayload).metadata()).toMatchObject({ width: 240, height: 240 });
    });

    it('sniffs the content instead of trusting name or MIME type', async () => {
      const { client, base, household } = await setup();
      const png = await solid(50, 50).png().toBuffer();
      // a PNG named .heic with a wrong MIME type is still a PNG
      await uploadOk(client, base, png, 'foto.heic', 'image/heic');

      const text = await upload(client, base, Buffer.from('Das ist kein Bild, nur Text.\n'.repeat(20)), 'x.jpg');
      expect(text.statusCode).toBe(415);
      expect(text.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
      );
      expect((await upload(client, base, svg, 'x.svg', 'image/svg+xml')).statusCode).toBe(415);

      const tiff = await solid(20, 20).tiff().toBuffer();
      expect((await upload(client, base, tiff, 'x.jpg', 'image/jpeg')).statusCode).toBe(415);

      const avif = await solid(20, 20).avif().toBuffer();
      expect((await upload(client, base, avif, 'x.avif', 'image/avif')).statusCode).toBe(415);

      // Valid magic bytes, broken body → 422
      const broken = Buffer.concat([(await solid(200, 200).jpeg().toBuffer()).subarray(0, 120), Buffer.alloc(64)]);
      const brokenResponse = await upload(client, base, broken);
      expect(brokenResponse.statusCode).toBe(422);
      expect(brokenResponse.json().error.code).toBe('IMAGE_INVALID');

      // only the PNG was stored
      expect(await t.prisma.inventoryImage.count({ where: { householdId: household.id } })).toBe(1);
    });

    it('detects HEIC/HEIF and converts it before processing', async () => {
      const heic = fakeHeic();
      expect(await detectImageKind(heic)).toBe('heif');

      // Through the API the real converter runs – this header-only file cannot be decoded.
      const { client, base } = await setup();
      const response = await upload(client, base, heic, 'IMG_0001.HEIC', 'image/heic');
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('IMAGE_INVALID');

      // The conversion path itself (heic-convert cannot be fed a real HEIC here: no HEVC encoder
      // is available to create one) – a stand-in converter returns a JPEG like heic-convert does.
      const converted = await solid(3024, 4032).jpeg().toBuffer();
      let calls = 0;
      const result = await processImage(heic, {
        convertHeic: async (input) => {
          calls += 1;
          expect(input.subarray(4, 12).toString()).toBe('ftypheic');
          return converted;
        },
      });
      expect(calls).toBe(1);
      expect(result).toMatchObject({ kind: 'heif', width: 1200, height: 1600 });
      expect(await sharp(result.thumb).metadata()).toMatchObject({ format: 'webp', width: 240, height: 240 });
    });

    it('rejects images above 40 megapixels and oversized files', async () => {
      const { client, base } = await setup();
      const huge = await solid(7000, 6000, '#ffffff').png({ compressionLevel: 9 }).toBuffer(); // 42 MP, small file
      const response = await upload(client, base, huge, 'gross.png', 'image/png');
      expect(response.statusCode).toBe(422);
      expect(response.json().error).toMatchObject({
        code: 'IMAGE_INVALID',
        message: 'Das Bild ist zu gross (höchstens 40 Megapixel).',
      });

      const small = await buildTestApp({ env: { MAX_UPLOAD_MB: '1' } });
      try {
        const owner = await createLoggedInUser(small.app);
        const household = await createHousehold(small.prisma, owner.user.id);
        const noise = await sharp(Buffer.from(Array.from({ length: 900 * 900 * 3 }, (_, i) => (i * 7919) % 251)), {
          raw: { width: 900, height: 900, channels: 3 },
        })
          .png({ compressionLevel: 0 })
          .toBuffer();
        expect(noise.length).toBeGreaterThan(1024 * 1024);
        const tooBig = await owner.client.post(
          `/api/households/${household.id}/images`,
          undefined,
          multipart(noise, 'gross.png', 'image/png'),
        );
        expect(tooBig.statusCode).toBe(413);
        expect(tooBig.json().error.code).toBe('PAYLOAD_TOO_LARGE');
        expect(await small.prisma.inventoryImage.count({ where: { householdId: household.id } })).toBe(0);
      } finally {
        await small.close();
      }
    });

    it('requires a multipart "file" field, CSRF and membership', async () => {
      const { client, base } = await setup();
      const png = await solid(10, 10).png().toBuffer();
      const json = await client.post(`${base}/images`, { file: 'x' });
      expect([406, 415]).toContain(json.statusCode);
      const wrongField = await client.post(`${base}/images`, undefined, multipart(png, 'a.png', 'image/png', 'bild'));
      expect(wrongField.statusCode).toBe(400);
      const noCsrf = await client.post(`${base}/images`, undefined, {
        ...multipart(png, 'a.png', 'image/png'),
        csrf: false,
      });
      expect(noCsrf.statusCode).toBe(403);

      const stranger = await createLoggedInUser(t.app);
      expect((await upload(stranger.client, base, png, 'a.png', 'image/png')).statusCode).toBe(404);
      expect((await upload(t.client(), base, png, 'a.png', 'image/png')).statusCode).toBe(401);
    });
  });

  describe('serving', () => {
    it('streams variants with immutable caching, nosniff and ETag revalidation', async () => {
      const { client, base } = await setup();
      const image = await uploadOk(client, base, await solid(400, 400).jpeg().toBuffer());
      const response = await fetchVariant(client, image, 'full');
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      const etag = String(response.headers.etag);
      expect(etag).toBe(`"${image.id}-full"`);

      const revalidated = await client.get(image.fullUrl, { headers: { 'if-none-match': `W/"x", ${etag}` } });
      expect(revalidated.statusCode).toBe(304);
      expect(revalidated.rawPayload.length).toBe(0);

      const defaultVariant = await client.get(`${base}/images/${image.id}`);
      expect(defaultVariant.headers.etag).toBe(`"${image.id}-thumb"`);
      expect((await client.get(`${base}/images/${image.id}?variant=original`)).statusCode).toBe(400);
    });

    it('isolates images between households (also for guessed ids)', async () => {
      const a = await setup('Anna');
      const b = await setup('Ben');
      const image = await uploadOk(a.client, a.base, await solid(100, 100).png().toBuffer(), 'a.png', 'image/png');

      expect((await b.client.get(image.thumbUrl)).statusCode).toBe(404);
      expect((await b.client.get(`${b.base}/images/${image.id}?variant=full`)).statusCode).toBe(404);
      expect((await b.client.get(`${b.base}/images/${randomUUID()}`)).statusCode).toBe(404);
      expect((await b.client.get(`${b.base}/images/..%2F..%2Fetc`)).statusCode).toBe(404);
      expect((await b.client.delete(`${a.base}/images/${image.id}`)).statusCode).toBe(404);
      expect((await b.client.delete(`${b.base}/images/${image.id}`)).statusCode).toBe(404);
      expect((await t.client().get(image.thumbUrl)).statusCode).toBe(401);
      expect((await a.client.get(image.thumbUrl)).statusCode).toBe(200);

      // Ben cannot attach Anna's image to his item.
      const attach = await b.client.post(`${b.base}/items`, { name: 'Dieb', imageId: image.id });
      expect(attach.statusCode).toBe(400);
      expect(attach.json().error.details.fieldErrors.imageId).toBeDefined();
    });
  });

  describe('lifecycle', () => {
    it('attaches, replaces and deletes images together with their item', async () => {
      const { client, base } = await setup();
      const first = await uploadOk(client, base, await solid(300, 300).png().toBuffer(), 'a.png', 'image/png');
      const created = await client.post(`${base}/items`, { name: 'Olivenöl', imageId: first.id });
      expect(created.statusCode).toBe(201);
      const item = InventoryItemDtoSchema.parse(created.json());
      expect(item.image).toEqual({ id: first.id, thumbUrl: first.thumbUrl, fullUrl: first.fullUrl });

      // one image, one item
      const twice = await client.post(`${base}/items`, { name: 'Zweitverwendung', imageId: first.id });
      expect(twice.statusCode).toBe(409);
      expect(twice.json().error.code).toBe('IMAGE_IN_USE');
      expect((await client.delete(`${base}/images/${first.id}`)).statusCode).toBe(409);

      const firstRow = await t.prisma.inventoryImage.findUniqueOrThrow({ where: { id: first.id } });
      const second = await uploadOk(client, base, await solid(300, 300).png().toBuffer(), 'b.png', 'image/png');
      const replaced = await client.patch(`${base}/items/${item.id}`, { imageId: second.id, version: item.version });
      expect(replaced.statusCode, replaced.body).toBe(200);
      expect(replaced.json().image.id).toBe(second.id);
      expect(await t.prisma.inventoryImage.findUnique({ where: { id: first.id } })).toBeNull();
      expect(await t.storage.exists(imageVariantKey(firstRow.storageKey, 'thumb'))).toBe(false);
      expect(await t.storage.exists(imageVariantKey(firstRow.storageKey, 'full'))).toBe(false);
      expect((await client.get(first.thumbUrl)).statusCode).toBe(404);

      // keeping the same image is not a change
      const same = await client.patch(`${base}/items/${item.id}`, { imageId: second.id, version: 2 });
      expect(same.json().version).toBe(2);

      const removedImage = await client.patch(`${base}/items/${item.id}`, { imageId: null, version: 2 });
      expect(removedImage.json()).toMatchObject({ image: null, version: 3 });
      expect(await t.prisma.inventoryImage.findUnique({ where: { id: second.id } })).toBeNull();

      const third = await uploadOk(client, base, await solid(300, 300).png().toBuffer(), 'c.png', 'image/png');
      await client.patch(`${base}/items/${item.id}`, { imageId: third.id, version: 3 });
      const thirdRow = await t.prisma.inventoryImage.findUniqueOrThrow({ where: { id: third.id } });
      expect((await client.delete(`${base}/items/${item.id}`)).statusCode).toBe(204);
      expect(await t.prisma.inventoryImage.findUnique({ where: { id: third.id } })).toBeNull();
      expect(await t.storage.exists(imageVariantKey(thirdRow.storageKey, 'full'))).toBe(false);
    });

    it('deletes unattached uploads of the uploader only', async () => {
      const { client, base, household } = await setup();
      const member = await createLoggedInUser(t.app);
      await t.prisma.householdMember.create({ data: { householdId: household.id, userId: member.user.id } });
      const image = await uploadOk(client, base, await solid(100, 100).png().toBuffer(), 'a.png', 'image/png');
      const row = await t.prisma.inventoryImage.findUniqueOrThrow({ where: { id: image.id } });

      // another member can see it but neither delete nor attach it
      expect((await member.client.get(image.thumbUrl)).statusCode).toBe(200);
      expect((await member.client.delete(`${base}/images/${image.id}`)).statusCode).toBe(404);
      expect((await member.client.post(`${base}/items`, { name: 'X', imageId: image.id })).statusCode).toBe(400);

      expect((await client.delete(`${base}/images/${image.id}`)).statusCode).toBe(204);
      expect(await t.storage.exists(imageVariantKey(row.storageKey, 'thumb'))).toBe(false);
      expect((await client.delete(`${base}/images/${image.id}`)).statusCode).toBe(404);
    });

    it('cleans up unattached images older than 24 hours', async () => {
      const { client, base } = await setup();
      const old = await uploadOk(client, base, await solid(64, 64).png().toBuffer(), 'old.png', 'image/png');
      const fresh = await uploadOk(client, base, await solid(64, 64).png().toBuffer(), 'new.png', 'image/png');
      const attached = await uploadOk(client, base, await solid(64, 64).png().toBuffer(), 'att.png', 'image/png');
      await client.post(`${base}/items`, { name: 'Mit Bild', imageId: attached.id });
      await t.prisma.inventoryImage.updateMany({
        where: { id: { in: [old.id, attached.id] } },
        data: { createdAt: new Date(Date.now() - 25 * HOUR) },
      });
      const oldRow = await t.prisma.inventoryImage.findUniqueOrThrow({ where: { id: old.id } });

      const removed = await cleanupOrphanImages(t.prisma, t.storage, t.app.log);
      expect(removed).toBe(1);
      expect(await t.prisma.inventoryImage.findUnique({ where: { id: old.id } })).toBeNull();
      expect(await t.storage.exists(imageVariantKey(oldRow.storageKey, 'full'))).toBe(false);
      expect(await t.prisma.inventoryImage.findUnique({ where: { id: fresh.id } })).not.toBeNull();
      expect(await t.prisma.inventoryImage.findUnique({ where: { id: attached.id } })).not.toBeNull();
      expect(await cleanupOrphanImages(t.prisma, t.storage, t.app.log)).toBe(0);
    });
  });
});
