import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  InventoryItemDtoSchema,
  ItemListResponseSchema,
  type CreateItemRequest,
  type InventoryItemDto,
  type ItemListResponse,
  type SyncEvent,
} from '@homi/shared';
import { decodeItemCursor, encodeItemCursor, escapeLikePattern } from '../../src/modules/inventory/list';
import { buildTestApp, type TestApp } from '../helpers/app';
import { addMember, createHousehold, createLoggedInUser } from '../helpers/fixtures';
import type { TestClient } from '../helpers/http';

const MISSING_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('inventory items', () => {
  let t: TestApp;
  const synced: SyncEvent[] = [];
  /** For every emitted event: was the referenced item's state already committed at emit time? */
  const visibleAtEmit: Array<Promise<{ event: SyncEvent; exists: boolean }>> = [];

  beforeAll(async () => {
    t = await buildTestApp();
    const original = t.app.realtime.emitSync.bind(t.app.realtime);
    t.app.realtime.emitSync = (event) => {
      synced.push(event);
      if (event.entityId) {
        // A separate pool connection only sees committed rows.
        visibleAtEmit.push(
          t.prisma.inventoryItem
            .count({ where: { id: event.entityId } })
            .then((count) => ({ event, exists: count === 1 })),
        );
      }
      original(event);
    };
  });
  afterEach(() => {
    synced.length = 0;
    visibleAtEmit.length = 0;
  });
  afterAll(() => t.close());

  async function setup(name = 'Mia') {
    const owner = await createLoggedInUser(t.app, { displayName: name });
    const household = await createHousehold(t.prisma, owner.user.id, 'Unser Zuhause');
    const base = `/api/households/${household.id}`;
    return { ...owner, household, base };
  }

  async function create(client: TestClient, base: string, body: CreateItemRequest): Promise<InventoryItemDto> {
    const response = await client.post(`${base}/items`, body);
    expect(response.statusCode, response.body).toBe(201);
    return InventoryItemDtoSchema.parse(response.json());
  }

  describe('CRUD', () => {
    it('creates, reads, updates and deletes an item', async () => {
      const { client, base, user, household } = await setup('Lena');
      const created = await create(client, base, {
        name: '  Olivenöl ',
        category: 'KUECHE',
        quantity: '2',
        unit: 'FLASCHE',
        unitPrice: '8,50',
      });
      expect(created).toMatchObject({
        name: 'Olivenöl',
        category: 'KUECHE',
        quantity: '2',
        unit: 'FLASCHE',
        unitPrice: '8.50',
        totalValue: '17.00',
        image: null,
        createdBy: { id: user.id, displayName: 'Lena' },
        version: 1,
      });

      const fetched = await client.get(`${base}/items/${created.id}`);
      expect(fetched.statusCode).toBe(200);
      expect(fetched.json()).toEqual(created);

      const patched = await client.patch(`${base}/items/${created.id}`, { unitPrice: '9.00', version: 1 });
      expect(patched.statusCode, patched.body).toBe(200);
      expect(patched.json()).toMatchObject({
        name: 'Olivenöl',
        quantity: '2',
        unit: 'FLASCHE',
        unitPrice: '9.00',
        totalValue: '18.00',
        version: 2,
      });

      const removed = await client.delete(`${base}/items/${created.id}`);
      expect(removed.statusCode).toBe(204);
      expect((await client.get(`${base}/items/${created.id}`)).statusCode).toBe(404);
      expect((await client.delete(`${base}/items/${created.id}`)).statusCode).toBe(404);
      expect(await t.prisma.inventoryItem.count({ where: { householdId: household.id } })).toBe(0);
    });

    it('applies defaults and accepts unknown prices', async () => {
      const { client, base } = await setup();
      const created = await create(client, base, { name: 'Kerzen' });
      expect(created).toMatchObject({
        category: 'SONSTIGES',
        quantity: '1',
        unit: 'STUECK',
        unitPrice: null,
        totalValue: null,
      });
    });

    it('validates input', async () => {
      const { client, base } = await setup();
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ name: '   ' }, 'name'],
        [{ name: 'x'.repeat(81) }, 'name'],
        [{ name: 'Milch', unit: 'KISTE' }, 'unit'],
        [{ name: 'Milch', category: 'GARAGE' }, 'category'],
        [{ name: 'Milch', unitPrice: '-1' }, 'unitPrice'],
        [{ name: 'Milch', unitPrice: '1.005' }, 'unitPrice'],
        [{ name: 'Milch', unitPrice: '100000' }, 'unitPrice'],
        [{ name: 'Milch', unitPrice: 8.5 }, 'unitPrice'],
        [{ name: 'Milch', quantity: '1.2345' }, 'quantity'],
        [{ name: 'Milch', quantity: '100000' }, 'quantity'],
        [{ name: 'Milch', imageId: 'not-a-uuid' }, 'imageId'],
      ];
      for (const [body, field] of cases) {
        const response = await client.post(`${base}/items`, body);
        expect(response.statusCode, JSON.stringify(body)).toBe(400);
        const error = response.json().error;
        expect(error.code).toBe('VALIDATION');
        expect(Object.keys(error.details.fieldErrors)).toContain(field);
      }
      const patch = await client.patch(`${base}/items/${MISSING_ID}`, { name: 'Ohne Version' });
      expect(patch.statusCode).toBe(400);
      expect(patch.json().error.details.fieldErrors.version).toBeDefined();
      expect((await client.patch(`${base}/items/${MISSING_ID}`, { name: 'X', version: 1 })).statusCode).toBe(404);
    });

    it('rejects requests without CSRF header and without session', async () => {
      const { client, base } = await setup();
      const noCsrf = await client.post(`${base}/items`, { name: 'Milch' }, { csrf: false });
      expect(noCsrf.statusCode).toBe(403);
      expect(noCsrf.json().error.code).toBe('CSRF');

      const anonymous = t.client();
      expect((await anonymous.get(`${base}/items`)).statusCode).toBe(401);
      expect((await anonymous.post(`${base}/items`, { name: 'Milch' })).statusCode).toBe(401);
    });
  });

  describe('tenant isolation', () => {
    it('answers 404 for other households, guessed ids and malformed ids', async () => {
      const a = await setup('Anna');
      const b = await setup('Ben');
      const item = await create(a.client, a.base, { name: 'Kaffee', unitPrice: '7.95' });

      // Ben is not a member of Anna's household.
      expect((await b.client.get(`${a.base}/items`)).statusCode).toBe(404);
      expect((await b.client.get(`${a.base}/items/${item.id}`)).statusCode).toBe(404);
      expect((await b.client.post(`${a.base}/items`, { name: 'Hack' })).statusCode).toBe(404);

      // Ben uses Anna's item id under his own household.
      expect((await b.client.get(`${b.base}/items/${item.id}`)).statusCode).toBe(404);
      expect((await b.client.patch(`${b.base}/items/${item.id}`, { name: 'X', version: 1 })).statusCode).toBe(404);
      expect((await b.client.post(`${b.base}/items/${item.id}/quantity`, { delta: '5' })).statusCode).toBe(404);
      expect((await b.client.delete(`${b.base}/items/${item.id}`)).statusCode).toBe(404);

      expect((await a.client.get(`${a.base}/items/not-a-uuid`)).statusCode).toBe(404);
      expect((await a.client.get('/api/households/not-a-uuid/items')).statusCode).toBe(404);

      const unchanged = await t.prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(unchanged.name).toBe('Kaffee');
      expect(unchanged.quantity.toFixed()).toBe('1');
      expect((await b.client.get(`${b.base}/items`)).json()).toMatchObject({ items: [], total: 0 });
    });

    it('lets every member read and write', async () => {
      const owner = await setup('Olivia');
      const member = await createLoggedInUser(t.app, { displayName: 'Max' });
      await addMember(t.prisma, owner.household, member.user.id);
      const item = await create(owner.client, owner.base, { name: 'Reis', unit: 'PACKUNG' });
      const changed = await member.client.post(`${owner.base}/items/${item.id}/quantity`, { delta: '1' });
      expect(changed.statusCode).toBe(200);
      expect(changed.json()).toMatchObject({ quantity: '2', version: 2 });
    });
  });

  describe('listing', () => {
    let ctx: Awaited<ReturnType<typeof setup>>;
    const fixtures: CreateItemRequest[] = [
      { name: 'Nespresso Kapseln', category: 'KUECHE', quantity: '24', unit: 'STUECK', unitPrice: '0.54' },
      { name: 'Olivenöl', category: 'KUECHE', quantity: '2', unit: 'FLASCHE', unitPrice: '8.50' },
      { name: 'Batterien AA', category: 'TECHNIK', quantity: '8', unit: 'STUECK', unitPrice: '0.75' },
      { name: 'Milch', category: 'KUECHE', quantity: '3', unit: 'STUECK', unitPrice: '1.55' },
      { name: 'Kaffee', category: 'KUECHE', quantity: '2', unit: 'PACKUNG', unitPrice: '7.95' },
      { name: 'Spülmittel', category: 'KUECHE', quantity: '1', unit: 'FLASCHE', unitPrice: '3.20' },
      { name: 'Küchenpapier', category: 'KUECHE', quantity: '4', unit: 'ROLLE', unitPrice: '1.45' },
      { name: 'Reis', category: 'KUECHE', quantity: '1', unit: 'PACKUNG', unitPrice: '2.95' },
      { name: 'Zahnpasta', category: 'BAD', quantity: '2', unit: 'TUBE', unitPrice: null },
      { name: 'Duschgel', category: 'BAD', quantity: '1', unit: 'FLASCHE', unitPrice: '4.20' },
      { name: 'Kerzen 100%', category: 'WOHNZIMMER', quantity: '6', unit: 'STUECK', unitPrice: null },
      { name: 'olive (klein)', category: 'SONSTIGES', quantity: '1', unit: 'DOSE', unitPrice: '17.00' },
    ];

    async function list(query: Record<string, string>): Promise<ItemListResponse> {
      const response = await ctx.client.get(`${ctx.base}/items`, { query });
      expect(response.statusCode, response.body).toBe(200);
      return ItemListResponseSchema.parse(response.json());
    }

    async function listAll(query: Record<string, string>, limit: number): Promise<string[]> {
      const names: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 50; page += 1) {
        const result: ItemListResponse = await list({ ...query, limit: String(limit), ...(cursor ? { cursor } : {}) });
        names.push(...result.items.map((item) => item.name));
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      return names;
    }

    beforeAll(async () => {
      ctx = await setup();
      for (const fixture of fixtures) await create(ctx.client, ctx.base, fixture);
      // Another household's items never show up.
      const other = await setup('Fremd');
      await create(other.client, other.base, { name: 'Olivenöl fremd' });
    });

    it('lists by name with total count', async () => {
      const result = await list({});
      expect(result.total).toBe(fixtures.length);
      expect(result.nextCursor).toBeNull();
      const names = result.items.map((item) => item.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' })));
      expect(names).toContain('Olivenöl');
      expect(names).not.toContain('Olivenöl fremd');
    });

    it('searches case-insensitively and treats LIKE wildcards literally', async () => {
      const oliv = await list({ search: 'OLIV' });
      expect(oliv.items.map((item) => item.name)).toEqual(['olive (klein)', 'Olivenöl']);
      expect(oliv.total).toBe(2);
      expect((await list({ search: '  oliv  ' })).total).toBe(2);
      expect((await list({ search: '%' })).items.map((item) => item.name)).toEqual(['Kerzen 100%']);
      expect((await list({ search: '_' })).total).toBe(0);
      expect((await list({ search: 'xyz' })).items).toEqual([]);
    });

    it('filters by category and combines filters', async () => {
      const bad = await list({ category: 'BAD' });
      expect(bad.items.map((item) => item.name)).toEqual(['Duschgel', 'Zahnpasta']);
      expect(bad.total).toBe(2);
      expect((await list({ category: 'KUECHE', search: 'oliv' })).items.map((item) => item.name)).toEqual(['Olivenöl']);
      const invalid = await ctx.client.get(`${ctx.base}/items`, { query: { category: 'GARAGE' } });
      expect(invalid.statusCode).toBe(400);
    });

    it('sorts by value (unknown prices last) and by recent changes', async () => {
      const byValue = await list({ sort: 'value' });
      const values = byValue.items.map((item) => item.totalValue);
      expect(values.slice(0, 3)).toEqual(['17.00', '17.00', '15.90']);
      // equal totals are ordered by name
      expect(byValue.items.slice(0, 2).map((item) => item.name)).toEqual(['olive (klein)', 'Olivenöl']);
      expect(values.slice(-2)).toEqual([null, null]);

      const milk = byValue.items.find((item) => item.name === 'Milch');
      expect(milk).toBeDefined();
      await ctx.client.post(`${ctx.base}/items/${milk?.id}/quantity`, { delta: '1' });
      const recent = await list({ sort: 'recent' });
      expect(recent.items[0]?.name).toBe('Milch');
      expect(recent.items.at(-1)?.name).toBe('Nespresso Kapseln');
    });

    it('paginates with stable cursors for every sort order', async () => {
      for (const sort of ['name', 'recent', 'value']) {
        const all = (await list({ sort })).items.map((item) => item.name);
        expect(await listAll({ sort }, 5)).toEqual(all);
        expect(await listAll({ sort }, 1)).toEqual(all);
      }
      const firstPage = await list({ limit: '3' });
      expect(firstPage.items).toHaveLength(3);
      expect(firstPage.total).toBe(fixtures.length);
      expect(firstPage.nextCursor).not.toBeNull();
    });

    it('keeps pages consistent when items before the cursor are added or removed', async () => {
      const page1 = await list({ limit: '4' });
      const seen = page1.items.map((item) => item.name);
      // Insert an item that sorts before the cursor and delete one that was already shown.
      const inserted = await create(ctx.client, ctx.base, { name: 'Aaa Apfel' });
      const shown = page1.items[1];
      expect(shown).toBeDefined();
      await ctx.client.delete(`${ctx.base}/items/${shown?.id}`);

      let cursor = page1.nextCursor;
      while (cursor) {
        const page = await list({ limit: '4', cursor });
        seen.push(...page.items.map((item) => item.name));
        cursor = page.nextCursor;
      }
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toHaveLength(fixtures.length);
      expect(seen).not.toContain('Aaa Apfel');

      // restore the fixture set for the other tests
      await ctx.client.delete(`${ctx.base}/items/${inserted.id}`);
      if (shown) {
        await create(ctx.client, ctx.base, {
          name: shown.name,
          category: shown.category,
          quantity: shown.quantity,
          unit: shown.unit,
          unitPrice: shown.unitPrice,
        });
      }
    });

    it('rejects malformed cursors, foreign sort cursors and invalid limits', async () => {
      const page = await list({ limit: '2' });
      const cursor = page.nextCursor ?? '';
      expect((await ctx.client.get(`${ctx.base}/items`, { query: { cursor: 'garbage' } })).statusCode).toBe(400);
      expect((await ctx.client.get(`${ctx.base}/items`, { query: { cursor, sort: 'value' } })).json().error.code).toBe(
        'VALIDATION',
      );
      expect((await ctx.client.get(`${ctx.base}/items`, { query: { limit: '0' } })).statusCode).toBe(400);
      expect((await ctx.client.get(`${ctx.base}/items`, { query: { limit: '101' } })).statusCode).toBe(400);
      expect((await ctx.client.get(`${ctx.base}/items`, { query: { sort: 'price' } })).statusCode).toBe(400);
    });
  });

  describe('cursor helpers', () => {
    it('round-trips and validates cursors', () => {
      const cursor = { s: 'value', t: '17.00000', n: 'olivenöl', id: MISSING_ID } as const;
      expect(decodeItemCursor(encodeItemCursor(cursor), 'value')).toEqual(cursor);
      expect(() => decodeItemCursor(encodeItemCursor(cursor), 'name')).toThrow();
      expect(() =>
        decodeItemCursor(encodeItemCursor({ s: 'recent', u: 'yesterday', id: MISSING_ID }), 'recent'),
      ).toThrow();
      expect(() =>
        decodeItemCursor(encodeItemCursor({ s: 'value', t: '1; DROP', n: 'x', id: MISSING_ID }), 'value'),
      ).toThrow();
      expect(escapeLikePattern('100%_a\\b')).toBe('100\\%\\_a\\\\b');
    });
  });

  describe('quantity changes', () => {
    it('applies 20 parallel +1 requests exactly once each', async () => {
      const { client, base } = await setup();
      const item = await create(client, base, { name: 'Eier', quantity: '0', unitPrice: '0.52' });
      const responses = await Promise.all(
        Array.from({ length: 20 }, () => client.post(`${base}/items/${item.id}/quantity`, { delta: '1' })),
      );
      expect(responses.map((response) => response.statusCode)).toEqual(Array(20).fill(200));
      const row = await t.prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.quantity.toFixed()).toBe('20');
      expect(row.version).toBe(21);
      const activities = await t.prisma.householdActivity.findMany({
        where: { entityId: item.id, type: 'ITEM_QUANTITY_CHANGED' },
      });
      expect(activities).toHaveLength(20);
      const sum = activities.reduce((acc, activity) => acc + Number(activity.valueDelta?.toFixed(2) ?? 0) * 100, 0);
      expect(Math.round(sum)).toBe(1040); // 20 × 0.52
    });

    it('never goes negative under concurrent decrements from two users', async () => {
      const owner = await setup();
      const member = await createLoggedInUser(t.app);
      await addMember(t.prisma, owner.household, member.user.id);
      const item = await create(owner.client, owner.base, { name: 'Milch', quantity: '5' });
      const requests = Array.from({ length: 12 }, (_, index) =>
        (index % 2 === 0 ? owner.client : member.client).post(`${owner.base}/items/${item.id}/quantity`, {
          delta: '-1',
        }),
      );
      const responses = await Promise.all(requests);
      expect(responses.every((response) => response.statusCode === 200)).toBe(true);
      const row = await t.prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.quantity.toFixed()).toBe('0');
      // Only the 5 effective decrements write a version bump and an activity.
      expect(row.version).toBe(6);
      expect(
        await t.prisma.householdActivity.count({ where: { entityId: item.id, type: 'ITEM_QUANTITY_CHANGED' } }),
      ).toBe(5);
    });

    it('clamps at zero, supports decimals and validates the delta', async () => {
      const { client, base } = await setup();
      const item = await create(client, base, { name: 'Mehl', quantity: '1.5', unit: 'KILOGRAMM', unitPrice: '1.90' });
      const half = await client.post(`${base}/items/${item.id}/quantity`, { delta: '-0,5' });
      expect(half.json()).toMatchObject({ quantity: '1', totalValue: '1.90', version: 2 });
      const clamped = await client.post(`${base}/items/${item.id}/quantity`, { delta: '-3' });
      expect(clamped.json()).toMatchObject({ quantity: '0', totalValue: '0.00', version: 3 });
      const noop = await client.post(`${base}/items/${item.id}/quantity`, { delta: '-1' });
      expect(noop.statusCode).toBe(200);
      expect(noop.json()).toMatchObject({ quantity: '0', version: 3 });

      for (const delta of ['0', 'abc', '1.0001', 1]) {
        const response = await client.post(`${base}/items/${item.id}/quantity`, { delta });
        expect(response.statusCode, String(delta)).toBe(400);
      }
      const tooMuch = await client.post(`${base}/items/${item.id}/quantity`, { delta: '99999.999' });
      expect(tooMuch.statusCode).toBe(200);
      const overflow = await client.post(`${base}/items/${item.id}/quantity`, { delta: '1' });
      expect(overflow.statusCode).toBe(400);
      expect(overflow.json().error.details.fieldErrors.delta).toBe('Die Menge ist zu gross.');
    });
  });

  describe('optimistic concurrency', () => {
    it('rejects stale versions and changes only provided fields', async () => {
      const { client, base } = await setup();
      const item = await create(client, base, {
        name: 'Kaffee',
        category: 'KUECHE',
        quantity: '2',
        unit: 'PACKUNG',
        unitPrice: '7.95',
      });

      const renamed = await client.patch(`${base}/items/${item.id}`, { name: 'Kaffeebohnen', version: 1 });
      expect(renamed.json()).toMatchObject({
        name: 'Kaffeebohnen',
        category: 'KUECHE',
        quantity: '2',
        unit: 'PACKUNG',
        unitPrice: '7.95',
        version: 2,
      });

      const stale = await client.patch(`${base}/items/${item.id}`, { name: 'Alt', version: 1 });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: 2 } });

      // A quantity tap bumps the version, so an edit form opened before it conflicts.
      await client.post(`${base}/items/${item.id}/quantity`, { delta: '1' });
      const afterTap = await client.patch(`${base}/items/${item.id}`, { quantity: '5', version: 2 });
      expect(afterTap.statusCode).toBe(409);

      const unpriced = await client.patch(`${base}/items/${item.id}`, { unitPrice: null, version: 3 });
      expect(unpriced.json()).toMatchObject({ unitPrice: null, totalValue: null, quantity: '3', version: 4 });

      // No actual change → no version bump, no activity
      const before = await t.prisma.householdActivity.count({ where: { entityId: item.id } });
      const noop = await client.patch(`${base}/items/${item.id}`, { name: 'Kaffeebohnen', version: 4 });
      expect(noop.json()).toMatchObject({ version: 4 });
      expect(await t.prisma.householdActivity.count({ where: { entityId: item.id } })).toBe(before);
    });

    it('lets exactly one of two concurrent edits win', async () => {
      const { client, base } = await setup();
      const item = await create(client, base, { name: 'Tee' });
      const [first, second] = await Promise.all([
        client.patch(`${base}/items/${item.id}`, { name: 'Grüntee', version: 1 }),
        client.patch(`${base}/items/${item.id}`, { name: 'Schwarztee', version: 1 }),
      ]);
      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
      const row = await t.prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.version).toBe(2);
    });
  });

  describe('decimal precision and activities', () => {
    it('computes totals exactly', async () => {
      const { client, base } = await setup();
      expect((await create(client, base, { name: 'Kapseln', quantity: '24', unitPrice: '0.54' })).totalValue).toBe(
        '12.96',
      );
      expect((await create(client, base, { name: 'Öl', quantity: '2', unitPrice: '8.50' })).totalValue).toBe('17.00');
      expect((await create(client, base, { name: 'Salz', quantity: '3', unitPrice: null })).totalValue).toBeNull();
      expect(
        (await create(client, base, { name: 'Käse', quantity: '0.333', unit: 'KILOGRAMM', unitPrice: '1.50' }))
          .totalValue,
      ).toBe('0.50'); // 0.4995 → half away from zero
      expect((await create(client, base, { name: 'Wein', quantity: '3', unitPrice: '0.10' })).totalValue).toBe('0.30');
      expect(
        (await create(client, base, { name: 'Gold', quantity: '99999.999', unitPrice: '99999.99' })).totalValue,
      ).toBe('9999998900.00');
    });

    it('records value deltas for create, update, quantity change and delete', async () => {
      const { client, base, user, household } = await setup();
      const item = await create(client, base, { name: 'Kapseln', quantity: '24', unitPrice: '0.54' });
      await client.patch(`${base}/items/${item.id}`, { unitPrice: '0.60', version: 1 }); // 14.40 − 12.96
      await client.post(`${base}/items/${item.id}/quantity`, { delta: '-4' }); // −2.40
      await client.delete(`${base}/items/${item.id}`); // −12.00
      const unpriced = await create(client, base, { name: 'Salz' });
      await client.post(`${base}/items/${unpriced.id}/quantity`, { delta: '2' });

      const rows = await t.prisma.householdActivity.findMany({
        where: { householdId: household.id, type: { not: 'HOUSEHOLD_CREATED' } },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((row) => [row.type, row.entityId, row.actorId, row.valueDelta?.toFixed(2) ?? null])).toEqual([
        ['ITEM_CREATED', item.id, user.id, '12.96'],
        ['ITEM_UPDATED', item.id, user.id, '1.44'],
        ['ITEM_QUANTITY_CHANGED', item.id, user.id, '-2.40'],
        ['ITEM_DELETED', item.id, user.id, '-12.00'],
        ['ITEM_CREATED', unpriced.id, user.id, null],
        ['ITEM_QUANTITY_CHANGED', unpriced.id, user.id, null],
      ]);
      expect(rows[2]?.meta).toMatchObject({ name: 'Kapseln', quantityBefore: '24', quantityAfter: '20', delta: '-4' });
      const sum = await t.prisma.householdActivity.aggregate({
        where: { householdId: household.id, entityId: item.id },
        _sum: { valueDelta: true },
      });
      expect(sum._sum.valueDelta?.toFixed(2)).toBe('0.00');
    });
  });

  describe('realtime', () => {
    it('emits inventory + dashboard sync events after the commit', async () => {
      const { client, base, user, household } = await setup();
      const item = await create(client, base, { name: 'Butter' });
      await client.post(`${base}/items/${item.id}/quantity`, { delta: '1' });
      await client.patch(`${base}/items/${item.id}`, { name: 'Butter mild', version: 2 });
      await client.post(`${base}/items/${item.id}/quantity`, { delta: '-5' }); // → 0
      await client.post(`${base}/items/${item.id}/quantity`, { delta: '-1' }); // no-op: no event

      const events = synced.map((event) => `${event.scope}:${event.action}`);
      expect(events).toEqual([
        'inventory:created',
        'dashboard:created',
        'inventory:updated',
        'dashboard:updated',
        'inventory:updated',
        'dashboard:updated',
        'inventory:updated',
        'dashboard:updated',
      ]);
      expect(synced.every((event) => event.householdId === household.id && event.actorId === user.id)).toBe(true);
      expect(synced.every((event) => event.entityId === item.id)).toBe(true);
      const seen = await Promise.all(visibleAtEmit);
      expect(seen.every((entry) => entry.exists)).toBe(true);

      synced.length = 0;
      visibleAtEmit.length = 0;
      await client.delete(`${base}/items/${item.id}`);
      expect(synced.map((event) => `${event.scope}:${event.action}`)).toEqual([
        'inventory:deleted',
        'dashboard:deleted',
      ]);
      // The deletion was committed before the event went out.
      expect((await Promise.all(visibleAtEmit)).every((entry) => !entry.exists)).toBe(true);
    });

    it('emits nothing when a write fails', async () => {
      const { client, base } = await setup();
      const item = await create(client, base, { name: 'Brot' });
      synced.length = 0;
      await client.patch(`${base}/items/${item.id}`, { name: 'Zopf', version: 9 });
      await client.post(`${base}/items`, { name: '' });
      expect(synced).toEqual([]);
    });
  });
});
