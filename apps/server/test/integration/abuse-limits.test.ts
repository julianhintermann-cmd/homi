import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { MAX_PENDING_UPLOADS_PER_USER } from '../../src/modules/inventory/images';
import { INVENTORY_WRITE_LIMIT, UPLOAD_USER_LIMIT } from '../../src/modules/inventory/routes';
import { MAX_ITEMS_PER_HOUSEHOLD } from '../../src/modules/inventory/service';
import { buildTestApp, type TestApp } from '../helpers/app';
import { createHousehold, createLoggedInUser } from '../helpers/fixtures';

/**
 * Per-user abuse guards added after the release security review: inventory writes, photo uploads,
 * pending uploads, items per household, and the REGISTRATION_ENABLED switch.
 */

function multipart(data: Buffer) {
  const boundary = `----homi-${randomUUID()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="foto.png"\r\n` +
      'Content-Type: image/png\r\n\r\n',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    rawBody: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

const ITEM = { name: 'Kaffee', category: 'KUECHE', quantity: '1', unit: 'PACKUNG' } as const;

describe('abuse limits (rate limiting enabled)', () => {
  let t: TestApp;
  let png: Buffer;

  beforeAll(async () => {
    t = await buildTestApp({ rateLimit: true });
    png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#5e7d63' } })
      .png()
      .toBuffer();
  });
  afterAll(() => t.close());

  async function setup() {
    const owner = await createLoggedInUser(t.app);
    const household = await createHousehold(t.prisma, owner.user.id);
    return { ...owner, household, base: `/api/households/${household.id}` };
  }

  it(`limits inventory writes to ${INVENTORY_WRITE_LIMIT.max} per minute per user`, async () => {
    const { client, base } = await setup();
    const statuses: number[] = [];
    for (let index = 0; index < INVENTORY_WRITE_LIMIT.max; index += 1) {
      const response = await client.post(`${base}/items`, { ...ITEM, name: `Artikel ${index + 1}` });
      statuses.push(response.statusCode);
    }
    expect(statuses.every((status) => status === 201)).toBe(true);

    const item = await t.prisma.inventoryItem.findFirstOrThrow({ where: { name: 'Artikel 1' } });
    for (const response of [
      await client.post(`${base}/items`, ITEM),
      await client.patch(`${base}/items/${item.id}`, { name: 'Neu' }),
      await client.post(`${base}/items/${item.id}/quantity`, { delta: '1' }),
      await client.delete(`${base}/items/${item.id}`),
    ]) {
      expect(response.statusCode).toBe(429);
      expect(response.json().error).toMatchObject({
        code: 'RATE_LIMITED',
        message: 'Zu viele Änderungen in kurzer Zeit. Bitte warte einen Moment.',
      });
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    }
    // Reads stay available, and another member is not affected.
    expect((await client.get(`${base}/items`)).statusCode).toBe(200);
    const other = await setup();
    expect((await other.client.post(`${other.base}/items`, ITEM)).statusCode).toBe(201);
  });

  it(`limits photo uploads to ${UPLOAD_USER_LIMIT.max} per 10 minutes per user, whatever the IP`, async () => {
    const { client, base } = await setup();
    const statuses: number[] = [];
    for (let index = 0; index <= UPLOAD_USER_LIMIT.max; index += 1) {
      const response = await client.post(`${base}/images`, undefined, {
        ...multipart(png),
        remoteAddress: `198.18.7.${index + 1}`,
      });
      statuses.push(response.statusCode);
      // Keep the pending-upload quota out of the way: attach nothing, delete right away.
      if (response.statusCode === 201) {
        expect((await client.delete(`${base}/images/${response.json().id}`)).statusCode).toBe(204);
      }
    }
    expect(statuses.slice(0, UPLOAD_USER_LIMIT.max)).toEqual(Array(UPLOAD_USER_LIMIT.max).fill(201));
    expect(statuses[UPLOAD_USER_LIMIT.max]).toBe(429);
  });

  it(`refuses uploads while ${MAX_PENDING_UPLOADS_PER_USER} unattached photos are pending`, async () => {
    const { client, base, household, user } = await setup();
    await t.prisma.inventoryImage.createMany({
      data: Array.from({ length: MAX_PENDING_UPLOADS_PER_USER }, () => {
        const id = randomUUID();
        return {
          id,
          householdId: household.id,
          storageKey: `${household.id}/${id}`,
          mimeType: 'image/webp',
          width: 1,
          height: 1,
          byteSize: 1,
          createdById: user.id,
        };
      }),
    });
    const response = await client.post(`${base}/images`, undefined, multipart(png));
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toMatch(/noch keinem Artikel gehören/);

    // Attaching one to an item makes room again.
    const pending = await t.prisma.inventoryImage.findFirstOrThrow({ where: { createdById: user.id } });
    expect((await client.post(`${base}/items`, { ...ITEM, imageId: pending.id })).statusCode).toBe(201);
    expect((await client.post(`${base}/images`, undefined, multipart(png))).statusCode).toBe(201);
  });

  it(`caps a household at ${MAX_ITEMS_PER_HOUSEHOLD} items`, async () => {
    const { client, base, household, user } = await setup();
    await t.prisma.inventoryItem.createMany({
      data: Array.from({ length: MAX_ITEMS_PER_HOUSEHOLD }, (_, index) => ({
        householdId: household.id,
        name: `Vorrat ${index + 1}`,
        category: 'SONSTIGES' as const,
        quantity: '1',
        unit: 'STUECK' as const,
        createdById: user.id,
      })),
    });
    const response = await client.post(`${base}/items`, ITEM);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toEqual({
      code: 'CONFLICT',
      message: `Ein Haushalt kann höchstens ${MAX_ITEMS_PER_HOUSEHOLD} Artikel haben. Lösche zuerst Artikel, die du nicht mehr brauchst.`,
    });
  });
});

describe('REGISTRATION_ENABLED=false', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await buildTestApp({ env: { REGISTRATION_ENABLED: 'false' } });
  });
  afterAll(() => t.close());

  it('refuses new accounts but keeps logins working', async () => {
    const response = await t.client().post('/api/auth/register', {
      displayName: 'Neu',
      email: `neu-${randomUUID()}@homi.test`,
      password: 'Sommer-Wiese-2026',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toEqual({
      code: 'FORBIDDEN',
      message: 'Auf diesem Server können keine neuen Konten erstellt werden.',
    });
    const existing = await createLoggedInUser(t.app);
    expect((await existing.client.get('/api/auth/me')).statusCode).toBe(200);
  });
});
