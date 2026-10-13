import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import {
  ClearCompletedResponseSchema,
  SHOPPING_ITEM_ID_NAMESPACE,
  SHOPPING_LIMITS,
  SOCKET_PATH,
  ShoppingItemDtoSchema,
  ShoppingListResponseSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type ShoppingItemDto,
  type ShoppingListResponse,
  type SyncEvent,
  shoppingItemIdFor,
  uuidV5,
} from '@homi/shared';
import { SHOPPING_WRITE_LIMIT } from '../../src/modules/shopping/routes';
import { householdRoom } from '../../src/plugins/realtime';
import { buildTestApp, type TestApp } from '../helpers/app';
import { TEST_APP_URL } from '../helpers/config';
import { addMember, createHousehold, createLoggedInUser, type TestHousehold } from '../helpers/fixtures';
import type { TestClient } from '../helpers/http';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const shoppingUrl = (householdId: string) => `/api/households/${householdId}/shopping`;
const itemsUrl = (householdId: string) => `${shoppingUrl(householdId)}/items`;
const itemUrl = (householdId: string, itemId: string) => `${itemsUrl(householdId)}/${itemId}`;
const clearUrl = (householdId: string) => `${shoppingUrl(householdId)}/clear-completed`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A moment the 24-hour rule already hides (completed two days ago). */
const hiddenCompletedAt = () => new Date(Date.now() - 2 * SHOPPING_LIMITS.completedVisibleHours * 60 * 60 * 1000);

describe('shopping list API', () => {
  let t: TestApp;
  let baseUrl: string;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    t = await buildTestApp();
    baseUrl = await t.app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  afterAll(() => t.close());

  /** A household with an OWNER and a MEMBER, both logged in. */
  async function setupHousehold(name = 'Unser Zuhause') {
    const owner = await createLoggedInUser(t.app, { displayName: 'Julian' });
    const member = await createLoggedInUser(t.app, { displayName: 'Lisa' });
    const household = await createHousehold(t.prisma, owner.user.id, name);
    await addMember(t.prisma, household, member.user.id);
    return { owner, member, household };
  }

  async function addItem(client: TestClient, household: TestHousehold, body: Record<string, unknown>) {
    const response = await client.post(itemsUrl(household.id), body);
    expect(response.statusCode, response.body).toBe(201);
    return ShoppingItemDtoSchema.parse(response.json());
  }

  async function getList(client: TestClient, household: TestHousehold): Promise<ShoppingListResponse> {
    const response = await client.get(shoppingUrl(household.id));
    expect(response.statusCode, response.body).toBe(200);
    return ShoppingListResponseSchema.parse(response.json());
  }

  function activities(householdId: string, type: string) {
    return t.prisma.householdActivity.findMany({ where: { householdId, type: type as never } });
  }

  describe('CRUD', () => {
    it('returns the default list of a new household', async () => {
      const { owner, household } = await setupHousehold();
      const list = await getList(owner.client, household);
      expect(list).toEqual({
        list: { id: household.shoppingListId, name: 'Einkaufsliste' },
        open: [],
        completed: [],
        stats: { done: 0, total: 0 },
      });
    });

    it('creates items with decimal-safe quantity and price strings', async () => {
      const { owner, household } = await setupHousehold();
      const item = await addItem(owner.client, household, {
        name: '  Zwiebeln ',
        quantity: '1,5',
        unit: 'KILOGRAMM',
        unitPrice: '2,4',
      });
      expect(item).toMatchObject({
        name: 'Zwiebeln',
        quantity: '1.5',
        unit: 'KILOGRAMM',
        unitPrice: '2.40',
        completed: false,
        completedAt: null,
        completedBy: null,
        sourceItemId: null,
        createdBy: { id: owner.user.id, displayName: 'Julian' },
      });

      const minimal = await addItem(owner.client, household, { name: 'Milch' });
      expect(minimal).toMatchObject({ quantity: null, unit: null, unitPrice: null });

      const big = await addItem(owner.client, household, {
        name: 'Reis',
        quantity: '99’999.999',
        unit: 'GRAMM',
        unitPrice: '99999.99',
      });
      expect(big).toMatchObject({ quantity: '99999.999', unitPrice: '99999.99' });

      const row = await t.prisma.shoppingItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.householdId).toBe(household.id);
      expect(row.shoppingListId).toBe(household.shoppingListId);
      expect(row.quantity?.toFixed()).toBe('1.5');
      expect(row.unitPrice?.toFixed(2)).toBe('2.40');

      const added = await activities(household.id, 'SHOPPING_ITEM_ADDED');
      expect(added).toHaveLength(3);
      expect(added.find((a) => a.entityId === item.id)).toMatchObject({
        actorId: owner.user.id,
        entityType: 'shoppingItem',
        meta: { name: 'Zwiebeln' },
        valueDelta: null,
      });
    });

    it('lists open items oldest first and completed items most recently completed first', async () => {
      const { owner, household } = await setupHousehold();
      const milch = await addItem(owner.client, household, { name: 'Milch', quantity: '2', unit: 'LITER' });
      await sleep(5);
      const eier = await addItem(owner.client, household, { name: 'Eier', quantity: '12', unit: 'STUECK' });
      await sleep(5);
      const brot = await addItem(owner.client, household, { name: 'Brot' });
      await sleep(5);
      const joghurt = await addItem(owner.client, household, { name: 'Joghurt' });

      for (const id of [brot.id, joghurt.id]) {
        const response = await owner.client.patch(itemUrl(household.id, id), { completed: true });
        expect(response.statusCode).toBe(200);
        await sleep(5);
      }

      const list = await getList(owner.client, household);
      expect(list.open.map((i) => i.name)).toEqual(['Milch', 'Eier']);
      expect(list.completed.map((i) => i.name)).toEqual(['Joghurt', 'Brot']);
      expect(list.stats).toEqual({ done: 2, total: 4 });
      expect(list.open[0]).toMatchObject({ id: milch.id, quantity: '2', unit: 'LITER' });
      expect(list.open[1]?.id).toBe(eier.id);
    });

    it('updates fields partially and clears them with null', async () => {
      const { owner, member, household } = await setupHousehold();
      const item = await addItem(owner.client, household, { name: 'Milch', quantity: '2', unit: 'LITER' });

      const renamed = await member.client.patch(itemUrl(household.id, item.id), { name: 'Hafermilch' });
      expect(renamed.statusCode).toBe(200);
      expect(ShoppingItemDtoSchema.parse(renamed.json())).toMatchObject({
        name: 'Hafermilch',
        quantity: '2',
        unit: 'LITER',
        unitPrice: null,
      });

      const priced = await member.client.patch(itemUrl(household.id, item.id), {
        quantity: '0.5',
        unit: 'LITER',
        unitPrice: '1.95',
      });
      expect(priced.json()).toMatchObject({ name: 'Hafermilch', quantity: '0.5', unitPrice: '1.95' });

      const cleared = await member.client.patch(itemUrl(household.id, item.id), {
        quantity: null,
        unit: null,
        unitPrice: null,
      });
      expect(cleared.json()).toMatchObject({ quantity: null, unit: null, unitPrice: null });

      const noop = await member.client.patch(itemUrl(household.id, item.id), {});
      expect(noop.statusCode).toBe(200);
      expect(noop.json()).toMatchObject({ id: item.id, name: 'Hafermilch' });
    });

    it('deletes items and records the deletion', async () => {
      const { owner, member, household } = await setupHousehold();
      const item = await addItem(owner.client, household, { name: 'Spülmittel' });

      const deleted = await member.client.delete(itemUrl(household.id, item.id));
      expect(deleted.statusCode).toBe(204);
      expect(deleted.body).toBe('');
      expect(await t.prisma.shoppingItem.count({ where: { id: item.id } })).toBe(0);

      const again = await member.client.delete(itemUrl(household.id, item.id));
      expect(again.statusCode).toBe(404);
      expect(again.json().error.code).toBe('NOT_FOUND');

      const patchGone = await member.client.patch(itemUrl(household.id, item.id), { completed: true });
      expect(patchGone.statusCode).toBe(404);

      const removed = await activities(household.id, 'SHOPPING_ITEM_DELETED');
      expect(removed).toHaveLength(1);
      expect(removed[0]).toMatchObject({ actorId: member.user.id, entityId: item.id, meta: { name: 'Spülmittel' } });
    });

    it('repairs a missing default list', async () => {
      const { owner, household } = await setupHousehold();
      await t.prisma.shoppingList.deleteMany({ where: { householdId: household.id } });
      const [first, second] = await Promise.all([getList(owner.client, household), getList(owner.client, household)]);
      expect(first.list.id).toBe(second.list.id);
      expect(await t.prisma.shoppingList.count({ where: { householdId: household.id } })).toBe(1);
      const item = await addItem(owner.client, household, { name: 'Milch' });
      expect((await getList(owner.client, household)).open.map((i) => i.id)).toEqual([item.id]);
    });
  });

  describe('completion', () => {
    it('completes and restores idempotently', async () => {
      const { owner, member, household } = await setupHousehold();
      const item = await addItem(owner.client, household, { name: 'Brot', quantity: '1', unit: 'STUECK' });

      const done = await member.client.patch(itemUrl(household.id, item.id), { completed: true });
      expect(done.statusCode).toBe(200);
      const doneItem = ShoppingItemDtoSchema.parse(done.json());
      expect(doneItem.completed).toBe(true);
      expect(doneItem.completedBy).toEqual({ id: member.user.id, displayName: 'Lisa' });
      expect(doneItem.completedAt).not.toBeNull();

      // Completing again (by someone else) changes nothing: same actor, same timestamp.
      const again = await owner.client.patch(itemUrl(household.id, item.id), { completed: true });
      expect(again.statusCode).toBe(200);
      expect(again.json()).toMatchObject({
        completed: true,
        completedAt: doneItem.completedAt,
        completedBy: { id: member.user.id },
      });
      expect(await activities(household.id, 'SHOPPING_ITEM_COMPLETED')).toHaveLength(1);

      const restored = await owner.client.patch(itemUrl(household.id, item.id), { completed: false });
      expect(restored.json()).toMatchObject({ completed: false, completedAt: null, completedBy: null });
      const restoredAgain = await owner.client.patch(itemUrl(household.id, item.id), { completed: false });
      expect(restoredAgain.json()).toMatchObject({ completed: false, completedAt: null, completedBy: null });
      const reopened = await activities(household.id, 'SHOPPING_ITEM_REOPENED');
      expect(reopened).toHaveLength(1);
      expect(reopened[0]).toMatchObject({ actorId: owner.user.id, entityId: item.id, meta: { name: 'Brot' } });

      const list = await getList(owner.client, household);
      expect(list.open.map((i) => i.id)).toEqual([item.id]);
      expect(list.stats).toEqual({ done: 0, total: 1 });
    });

    it('records exactly one completion when two members tick the item at the same time', async () => {
      const { owner, member, household } = await setupHousehold();
      for (let round = 0; round < 5; round += 1) {
        const item = await addItem(owner.client, household, { name: `Butter ${round}` });
        const responses = await Promise.all([
          owner.client.patch(itemUrl(household.id, item.id), { completed: true }),
          member.client.patch(itemUrl(household.id, item.id), { completed: true }),
        ]);
        expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
        const bodies = responses.map((r) => ShoppingItemDtoSchema.parse(r.json()));
        expect(bodies.every((b) => b.completed)).toBe(true);
        // Both answers describe the single winning completion.
        expect(bodies[0]?.completedBy?.id).toBe(bodies[1]?.completedBy?.id);
        expect(bodies[0]?.completedAt).toBe(bodies[1]?.completedAt);
        expect([owner.user.id, member.user.id]).toContain(bodies[0]?.completedBy?.id);

        const completions = await t.prisma.householdActivity.count({
          where: { householdId: household.id, type: 'SHOPPING_ITEM_COMPLETED', entityId: item.id },
        });
        expect(completions).toBe(1);
      }
    });

    it('never changes the inventory when an item is completed', async () => {
      const { owner, household } = await setupHousehold();
      const inventoryItem = await t.prisma.inventoryItem.create({
        data: {
          householdId: household.id,
          name: 'Olivenöl',
          category: 'KUECHE',
          quantity: '2',
          unit: 'FLASCHE',
          unitPrice: '8.50',
          createdById: owner.user.id,
        },
      });
      const item = await addItem(owner.client, household, { sourceItemId: inventoryItem.id });
      expect(item).toMatchObject({ name: 'Olivenöl', unit: 'FLASCHE', quantity: null, sourceItemId: inventoryItem.id });

      await owner.client.patch(itemUrl(household.id, item.id), { completed: true });
      await owner.client.patch(itemUrl(household.id, item.id), { completed: false });
      await owner.client.patch(itemUrl(household.id, item.id), { completed: true });
      await owner.client.post(clearUrl(household.id));

      const after = await t.prisma.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItem.id } });
      expect(after.quantity.toFixed()).toBe('2');
      expect(after.version).toBe(inventoryItem.version);
      expect(after.updatedAt.getTime()).toBe(inventoryItem.updatedAt.getTime());
      expect(
        await t.prisma.householdActivity.count({
          where: { householdId: household.id, type: { in: ['ITEM_QUANTITY_CHANGED', 'ITEM_UPDATED'] } },
        }),
      ).toBe(0);
    });

    it('hides items completed more than 24 hours ago', async () => {
      const { owner, household } = await setupHousehold();
      const old = await addItem(owner.client, household, { name: 'Zahnpasta' });
      const recent = await addItem(owner.client, household, { name: 'Äpfel' });
      await owner.client.patch(itemUrl(household.id, old.id), { completed: true });
      await owner.client.patch(itemUrl(household.id, recent.id), { completed: true });
      const hours = SHOPPING_LIMITS.completedVisibleHours;
      await t.prisma.shoppingItem.update({
        where: { id: old.id },
        data: { completedAt: new Date(Date.now() - (hours + 1) * 60 * 60 * 1000) },
      });

      const list = await getList(owner.client, household);
      expect(list.completed.map((i) => i.id)).toEqual([recent.id]);
      expect(list.stats).toEqual({ done: 1, total: 1 });

      // "Erledigte löschen" reports the visible item it removed and purges the hidden one too.
      const cleared = await owner.client.post(clearUrl(household.id));
      expect(ClearCompletedResponseSchema.parse(cleared.json())).toEqual({ deleted: 1 });
      expect(await t.prisma.shoppingItem.count({ where: { householdId: household.id } })).toBe(0);
      const bulk = await activities(household.id, 'SHOPPING_ITEM_DELETED');
      expect(bulk.map((a) => a.meta)).toEqual([{ count: 1 }]);
    });
  });

  describe('clear completed', () => {
    it('deletes only completed items and records one bulk activity', async () => {
      const { owner, member, household } = await setupHousehold();
      const open = await addItem(owner.client, household, { name: 'Tomaten', quantity: '500', unit: 'GRAMM' });
      const done1 = await addItem(owner.client, household, { name: 'Brot' });
      const done2 = await addItem(owner.client, household, { name: 'Joghurt' });
      await owner.client.patch(itemUrl(household.id, done1.id), { completed: true });
      await member.client.patch(itemUrl(household.id, done2.id), { completed: true });

      const response = await member.client.post(clearUrl(household.id));
      expect(response.statusCode).toBe(200);
      expect(ClearCompletedResponseSchema.parse(response.json())).toEqual({ deleted: 2 });

      const list = await getList(owner.client, household);
      expect(list.open.map((i) => i.id)).toEqual([open.id]);
      expect(list.completed).toEqual([]);
      expect(list.stats).toEqual({ done: 0, total: 1 });

      const bulk = await activities(household.id, 'SHOPPING_ITEM_DELETED');
      expect(bulk).toHaveLength(1);
      expect(bulk[0]).toMatchObject({ actorId: member.user.id, entityId: null, meta: { count: 2 } });

      const again = await member.client.post(clearUrl(household.id));
      expect(again.json()).toEqual({ deleted: 0 });
      expect(await activities(household.id, 'SHOPPING_ITEM_DELETED')).toHaveLength(1);
    });

    it('deletes only the confirmed items: not those ticked off or restored meanwhile', async () => {
      const { owner, member, household } = await setupHousehold();
      const brot = await addItem(owner.client, household, { name: 'Brot' });
      const joghurt = await addItem(owner.client, household, { name: 'Joghurt' });
      const kaffee = await addItem(owner.client, household, { name: 'Kaffee' });
      const butter = await addItem(owner.client, household, { name: 'Butter' });
      const hidden = await addItem(owner.client, household, { name: 'Zahnpasta' });
      for (const item of [brot, joghurt, butter, hidden]) {
        await owner.client.patch(itemUrl(household.id, item.id), { completed: true });
      }
      await t.prisma.shoppingItem.update({ where: { id: hidden.id }, data: { completedAt: hiddenCompletedAt() } });

      // The owner confirms "2 erledigte Artikel" (Brot, Joghurt) … meanwhile Lisa ticks off Kaffee
      // and restores Joghurt; Butter was never part of the confirmation.
      await member.client.patch(itemUrl(household.id, kaffee.id), { completed: true });
      await member.client.patch(itemUrl(household.id, joghurt.id), { completed: false });
      const response = await owner.client.post(clearUrl(household.id), { itemIds: [brot.id, joghurt.id] });
      expect(response.statusCode).toBe(200);
      expect(ClearCompletedResponseSchema.parse(response.json())).toEqual({ deleted: 1 });

      const list = await getList(owner.client, household);
      expect(list.open.map((i) => i.name)).toEqual(['Joghurt']);
      expect(list.completed.map((i) => i.name).sort()).toEqual(['Butter', 'Kaffee']);
      // The already hidden item is purged with it, silently.
      expect(await t.prisma.shoppingItem.count({ where: { id: { in: [brot.id, hidden.id] } } })).toBe(0);
      const bulk = await activities(household.id, 'SHOPPING_ITEM_DELETED');
      expect(bulk.map((a) => a.meta)).toEqual([{ count: 1 }]);
    });

    it('validates the confirmed ids and never deletes items of other households through them', async () => {
      const a = await setupHousehold('A');
      const b = await setupHousehold('B');
      const itemB = await addItem(b.owner.client, b.household, { name: 'Kaffee' });
      await b.owner.client.patch(itemUrl(b.household.id, itemB.id), { completed: true });

      const foreign = await a.owner.client.post(clearUrl(a.household.id), { itemIds: [itemB.id] });
      expect(foreign.json()).toEqual({ deleted: 0 });
      expect(await t.prisma.shoppingItem.count({ where: { id: itemB.id } })).toBe(1);

      for (const body of [{ itemIds: 'all' }, { itemIds: ['nope'] }, { itemIds: Array(501).fill(itemB.id) }]) {
        const response = await a.owner.client.post(clearUrl(a.household.id), body);
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe('VALIDATION');
      }
    });

    it('does not touch other households', async () => {
      const a = await setupHousehold('A');
      const b = await setupHousehold('B');
      const itemB = await addItem(b.owner.client, b.household, { name: 'Kaffee' });
      await b.owner.client.patch(itemUrl(b.household.id, itemB.id), { completed: true });
      const itemA = await addItem(a.owner.client, a.household, { name: 'Tee' });
      await a.owner.client.patch(itemUrl(a.household.id, itemA.id), { completed: true });

      expect((await a.owner.client.post(clearUrl(a.household.id))).json()).toEqual({ deleted: 1 });
      expect(await t.prisma.shoppingItem.count({ where: { id: itemB.id } })).toBe(1);
    });
  });

  describe('source items and client ids', () => {
    it('defaults name and unit from the source inventory item and lets the request override them', async () => {
      const { owner, household } = await setupHousehold();
      const source = await t.prisma.inventoryItem.create({
        data: {
          householdId: household.id,
          name: 'Küchenpapier',
          quantity: '3',
          unit: 'ROLLE',
          createdById: owner.user.id,
        },
      });
      const defaulted = await addItem(owner.client, household, { sourceItemId: source.id, quantity: '2' });
      expect(defaulted).toMatchObject({ name: 'Küchenpapier', unit: 'ROLLE', quantity: '2', sourceItemId: source.id });

      const overridden = await addItem(owner.client, household, {
        sourceItemId: source.id,
        name: 'Küchenrollen',
        unit: 'PACKUNG',
      });
      expect(overridden).toMatchObject({ name: 'Küchenrollen', unit: 'PACKUNG' });

      const withoutUnit = await addItem(owner.client, household, { sourceItemId: source.id, unit: null });
      expect(withoutUnit.unit).toBeNull();
    });

    it('rejects a source item of another household like an unknown one', async () => {
      const a = await setupHousehold('A');
      const b = await setupHousehold('B');
      const foreign = await t.prisma.inventoryItem.create({
        data: { householdId: b.household.id, name: 'Geheim', quantity: '1', unit: 'STUECK' },
      });

      const crossHousehold = await a.owner.client.post(itemsUrl(a.household.id), { sourceItemId: foreign.id });
      const unknown = await a.owner.client.post(itemsUrl(a.household.id), { sourceItemId: randomUUID() });
      for (const response of [crossHousehold, unknown]) {
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toMatchObject({
          code: 'VALIDATION',
          details: { fieldErrors: { sourceItemId: 'Dieser Inventarartikel wurde nicht gefunden.' } },
        });
        expect(response.body).not.toContain('Geheim');
      }
      expect(await t.prisma.shoppingItem.count({ where: { householdId: a.household.id } })).toBe(0);
    });

    it('stores an item created with a client id under the household-scoped derived id; a retry is idempotent', async () => {
      const { owner, household } = await setupHousehold();
      const clientId = randomUUID();
      const expectedId = shoppingItemIdFor(household.id, clientId);
      const body = { clientId, name: 'Eier', quantity: '12', unit: 'STUECK' };
      const first = await owner.client.post(itemsUrl(household.id), body);
      expect(first.statusCode).toBe(201);
      expect(first.json().id).toBe(expectedId);
      expect(expectedId).not.toBe(clientId);

      const retry = await owner.client.post(itemsUrl(household.id), body);
      expect(retry.statusCode).toBe(200);
      expect(retry.json()).toEqual(first.json());
      // Upper-case spelling of the same ids → the same item.
      const shouted = await owner.client.post(itemsUrl(household.id.toUpperCase()), {
        ...body,
        clientId: clientId.toUpperCase(),
      });
      expect(shouted.statusCode).toBe(200);
      expect(shouted.json().id).toBe(expectedId);
      expect(await t.prisma.shoppingItem.count({ where: { householdId: household.id } })).toBe(1);
      expect(await activities(household.id, 'SHOPPING_ITEM_ADDED')).toHaveLength(1);
    });

    it('derives ids exactly like RFC 9562 UUIDv5 (client and server compute the same id)', () => {
      // Published test vector (Python docs: uuid5(NAMESPACE_DNS, "python.org")).
      expect(uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'python.org')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
      const reference = (namespace: string, name: string) => {
        const hash = createHash('sha1')
          .update(Buffer.concat([Buffer.from(namespace.replace(/-/g, ''), 'hex'), Buffer.from(name, 'utf8')]))
          .digest();
        hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
        hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
        const hex = hash.subarray(0, 16).toString('hex');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      };
      for (let index = 0; index < 300; index += 1) {
        // Covers every padding length (0 … 130 extra bytes) and multi-byte UTF-8.
        const name = `${'x'.repeat(index % 131)}${randomUUID()}${'äé😀'.repeat(index % 3)}`;
        expect(uuidV5(SHOPPING_ITEM_ID_NAMESPACE, name)).toBe(reference(SHOPPING_ITEM_ID_NAMESPACE, name));
      }
      const householdId = randomUUID();
      const clientId = randomUUID();
      expect(shoppingItemIdFor(householdId, clientId)).toBe(
        reference(SHOPPING_ITEM_ID_NAMESPACE, `${householdId}:${clientId}`),
      );
      expect(ShoppingItemDtoSchema.shape.id.safeParse(shoppingItemIdFor(householdId, clientId)).success).toBe(true);
    });

    it('answers a retry storm of one client id with exactly one item', async () => {
      const { owner, member, household } = await setupHousehold();
      const clientId = randomUUID();
      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          (index % 2 ? member : owner).client.post(itemsUrl(household.id), { clientId, name: 'Eier' }),
        ),
      );
      const statuses = responses.map((response) => response.statusCode).sort();
      expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 200, 201]);
      expect(new Set(responses.map((response) => response.json().id))).toEqual(
        new Set([shoppingItemIdFor(household.id, clientId)]),
      );
      expect(await t.prisma.shoppingItem.count({ where: { householdId: household.id } })).toBe(1);
      expect(await activities(household.id, 'SHOPPING_ITEM_ADDED')).toHaveLength(1);
    });

    it('answers identically for a client id that is another household’s item id and for a fresh one', async () => {
      const a = await setupHousehold('A');
      const b = await setupHousehold('B');
      const itemB = await addItem(b.owner.client, b.household, { name: 'Wein' });

      /** Everything the caller can observe, minus the per-request id and timestamps. */
      const observe = async (clientId: string) => {
        const response = await a.owner.client.post(itemsUrl(a.household.id), { clientId, name: 'Bier' });
        const dto = ShoppingItemDtoSchema.parse(response.json());
        // The returned id depends only on A's household and the client id – never on B's rows.
        expect(dto.id).toBe(shoppingItemIdFor(a.household.id, clientId));
        expect(dto.id).not.toBe(itemB.id);
        expect(response.body).not.toContain('Wein');
        const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = dto;
        return { status: response.statusCode, rest };
      };
      const foreign = await observe(itemB.id);
      const unknown = await observe(randomUUID());
      expect(foreign).toEqual(unknown);
      expect(foreign.status).toBe(201);

      const untouched = await t.prisma.shoppingItem.findUniqueOrThrow({ where: { id: itemB.id } });
      expect(untouched).toMatchObject({ householdId: b.household.id, name: 'Wein' });

      // After B deleted its item, nobody in A can take over B's old id.
      await b.owner.client.delete(itemUrl(b.household.id, itemB.id));
      const again = await a.owner.client.post(itemsUrl(a.household.id), { clientId: itemB.id, name: 'Bier' });
      expect(again.statusCode).toBe(200); // A's own item created above with that client id (idempotent)
      expect(again.json().id).toBe(shoppingItemIdFor(a.household.id, itemB.id));
      const other = await a.member.client.post(itemsUrl(a.household.id), { clientId: randomUUID(), name: 'Bier' });
      expect(other.statusCode).toBe(201);
      expect(await t.prisma.shoppingItem.count({ where: { id: itemB.id } })).toBe(0);
    });

    it('lets two households use the same client id at the same time without any conflict', async () => {
      const a = await setupHousehold('A');
      const b = await setupHousehold('B');
      for (let round = 0; round < 10; round += 1) {
        const clientId = randomUUID();
        const [fromA, fromB] = await Promise.all([
          a.owner.client.post(itemsUrl(a.household.id), { clientId, name: `A${round}` }),
          b.owner.client.post(itemsUrl(b.household.id), { clientId, name: `B${round}` }),
        ]);
        expect([fromA.statusCode, fromB.statusCode]).toEqual([201, 201]);
        expect(fromA.json().id).toBe(shoppingItemIdFor(a.household.id, clientId));
        expect(fromB.json().id).toBe(shoppingItemIdFor(b.household.id, clientId));
        expect(fromA.json().id).not.toBe(fromB.json().id);
      }
      expect(await t.prisma.shoppingItem.count({ where: { householdId: a.household.id } })).toBe(10);
      expect(await t.prisma.shoppingItem.count({ where: { householdId: b.household.id } })).toBe(10);
    });

    it('refuses new items once the list is full', async () => {
      const { owner, household } = await setupHousehold();
      await t.prisma.shoppingItem.createMany({
        data: Array.from({ length: SHOPPING_LIMITS.maxItems }, (_, index) => ({
          householdId: household.id,
          shoppingListId: household.shoppingListId,
          name: `Artikel ${index}`,
        })),
      });
      const response = await owner.client.post(itemsUrl(household.id), { name: 'Einer zu viel' });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toMatchObject({ code: 'CONFLICT', details: { reason: 'LIST_FULL' } });
    });

    it('does not count items hidden by the 24-hour rule towards the cap and purges them', async () => {
      const { owner, household } = await setupHousehold();
      await t.prisma.shoppingItem.createMany({
        data: Array.from({ length: SHOPPING_LIMITS.maxItems }, (_, index) => ({
          householdId: household.id,
          shoppingListId: household.shoppingListId,
          name: `Alt ${index}`,
          completed: true,
          completedAt: hiddenCompletedAt(),
        })),
      });
      // The list looks empty …
      const before = await getList(owner.client, household);
      expect(before.stats).toEqual({ done: 0, total: 0 });

      // … so adding must work, and the hidden rows are gone afterwards (silently).
      const milch = await addItem(owner.client, household, { name: 'Milch' });
      expect(await t.prisma.shoppingItem.count({ where: { householdId: household.id } })).toBe(1);
      const after = await getList(owner.client, household);
      expect(after.open.map((i) => i.id)).toEqual([milch.id]);
      expect(await activities(household.id, 'SHOPPING_ITEM_DELETED')).toHaveLength(0);
    });

    it('still counts recently completed (visible) items towards the cap', async () => {
      const { owner, household } = await setupHousehold();
      await t.prisma.shoppingItem.createMany({
        data: Array.from({ length: SHOPPING_LIMITS.maxItems }, (_, index) => ({
          householdId: household.id,
          shoppingListId: household.shoppingListId,
          name: `Erledigt ${index}`,
          completed: true,
          completedAt: new Date(),
        })),
      });
      const response = await owner.client.post(itemsUrl(household.id), { name: 'Einer zu viel' });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.details).toMatchObject({ reason: 'LIST_FULL' });
    });

    it('cannot be pushed past the cap by concurrent creates', async () => {
      const { owner, member, household } = await setupHousehold();
      await t.prisma.shoppingItem.createMany({
        data: Array.from({ length: SHOPPING_LIMITS.maxItems - 1 }, (_, index) => ({
          householdId: household.id,
          shoppingListId: household.shoppingListId,
          name: `Artikel ${index}`,
        })),
      });
      const responses = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          (index % 2 ? member : owner).client.post(itemsUrl(household.id), { name: `Neu ${index}` }),
        ),
      );
      const statuses = responses.map((response) => response.statusCode);
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.filter((status) => status === 409)).toHaveLength(11);
      expect(await t.prisma.shoppingItem.count({ where: { householdId: household.id } })).toBe(
        SHOPPING_LIMITS.maxItems,
      );
    });
  });

  describe('validation', () => {
    it.each([
      [{}, 'name', 'Bitte gib einen Namen ein.'],
      [{ name: '   ' }, 'name', 'Bitte gib einen Namen ein.'],
      [{ name: 'x'.repeat(81) }, 'name', 'Der Name darf höchstens 80 Zeichen lang sein.'],
      [{ name: 'Milch\u0000' }, 'name', 'Der Name enthält ungültige Zeichen.'],
      [{ name: 'Milch\nBrot' }, 'name', 'Der Name enthält ungültige Zeichen.'],
      [{ name: 'Tee\tKaffee' }, 'name', 'Der Name enthält ungültige Zeichen.'],
      [{ name: '\u202Egnp.exe' }, 'name', 'Der Name enthält ungültige Zeichen.'],
      [{ name: 'Brot\u2066Butter' }, 'name', 'Der Name enthält ungültige Zeichen.'],
      [{ name: 'Milch\u200E' }, 'name', 'Der Name enthält ungültige Zeichen.'],
      [{ name: '\u200FBrot' }, 'name', 'Der Name enthält ungültige Zeichen.'],
      [{ name: '\u061CBrot' }, 'name', 'Der Name enthält ungültige Zeichen.'],
      // Names that would show up as a blank row for every member.
      [{ name: '\u200B' }, 'name', 'Bitte gib einen Namen ein.'],
      [{ name: '\u200B\u200B' }, 'name', 'Bitte gib einen Namen ein.'],
      [{ name: '\u2060' }, 'name', 'Bitte gib einen Namen ein.'],
      [{ name: '\uFEFF\u200B' }, 'name', 'Bitte gib einen Namen ein.'],
      [{ name: '\u00AD' }, 'name', 'Bitte gib einen Namen ein.'],
      [{ name: '\u034F' }, 'name', 'Bitte gib einen Namen ein.'],
      [{ name: ' \u3164 ' }, 'name', 'Bitte gib einen Namen ein.'],
      [{ name: '\u2800' }, 'name', 'Bitte gib einen Namen ein.'],
      [{ name: '\u200D\uFE0F' }, 'name', 'Bitte gib einen Namen ein.'],
      [{ name: 'Milch', quantity: '0' }, 'quantity', 'Die Menge muss grösser als 0 sein.'],
      [{ name: 'Milch', quantity: 'viel' }, 'quantity', 'Bitte gib eine gültige Menge ein.'],
      [{ name: 'Milch', quantity: '1.2345' }, 'quantity', 'Die Menge darf höchstens 3 Nachkommastellen haben.'],
      [{ name: 'Milch', quantity: 2 }, 'quantity', undefined],
      [{ name: 'Milch', unit: 'FASS' }, 'unit', 'Bitte wähle eine Einheit.'],
      [{ name: 'Milch', unitPrice: '-1' }, 'unitPrice', 'Der Preis darf nicht negativ sein.'],
      [{ name: 'Milch', unitPrice: '100000' }, 'unitPrice', 'Der Preis darf höchstens CHF 99’999.99 betragen.'],
      [{ name: 'Milch', unitPrice: 1.5 }, 'unitPrice', undefined],
      [{ name: 'Milch', clientId: 'not-a-uuid' }, 'clientId', 'Ungültige ID.'],
      [{ name: 'Milch', sourceItemId: 'nope' }, 'sourceItemId', 'Ungültige ID.'],
    ])('POST rejects %j', async (body, field, message) => {
      const { owner, household } = await setupHousehold();
      const response = await owner.client.post(itemsUrl(household.id), body);
      expect(response.statusCode).toBe(400);
      const error = response.json().error;
      expect(error.code).toBe('VALIDATION');
      expect(Object.keys(error.details.fieldErrors)).toContain(field);
      if (message) expect(error.details.fieldErrors[field]).toBe(message);
      expect(await t.prisma.shoppingItem.count({ where: { householdId: household.id } })).toBe(0);
    });

    it.each([
      [{ name: '' }, 'name'],
      [{ name: 'X\u0000Y' }, 'name'],
      [{ name: 'Brot\r\nButter' }, 'name'],
      [{ name: '\u202Dabc' }, 'name'],
      [{ name: '\u200B' }, 'name'],
      [{ name: 'Tee\u200F' }, 'name'],
      [{ completed: 'yes' }, 'completed'],
      [{ quantity: '0' }, 'quantity'],
      [{ unitPrice: '1.234' }, 'unitPrice'],
      [{ unit: 'kg' }, 'unit'],
    ])('PATCH rejects %j', async (body, field) => {
      const { owner, household } = await setupHousehold();
      const item = await addItem(owner.client, household, { name: 'Milch' });
      const response = await owner.client.patch(itemUrl(household.id, item.id), body);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fieldErrors).toHaveProperty(field);
      const row = await t.prisma.shoppingItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row).toMatchObject({ name: 'Milch', completed: false, quantity: null, unitPrice: null, unit: null });
    });

    it('keeps accents, umlauts, emoji (incl. ZWJ sequences) and right-to-left text', async () => {
      const { owner, household } = await setupHousehold();
      for (const name of [
        'Crème fraîche',
        'Äpfel 🍎',
        'חלב',
        'Käse – Gruyère',
        '\u{1F468}\u200D\u{1F469}\u200D\u{1F467} Familienpackung',
        'Zucker\u00ADwatte',
      ]) {
        expect((await addItem(owner.client, household, { name })).name).toBe(name);
      }
    });

    it('rejects a JSON body that is not an object', async () => {
      const { owner, household } = await setupHousehold();
      const response = await owner.client.post(itemsUrl(household.id), ['Milch']);
      expect(response.statusCode).toBe(400);
    });
  });

  describe('security', () => {
    it('answers 404 to non-members on every route without leaking data', async () => {
      const { owner, household } = await setupHousehold();
      const item = await addItem(owner.client, household, { name: 'Geheimzutat' });
      const outsider = await createLoggedInUser(t.app, { displayName: 'Eve' });
      await createHousehold(t.prisma, outsider.user.id, 'Eves WG');

      const responses = [
        await outsider.client.get(shoppingUrl(household.id)),
        await outsider.client.post(itemsUrl(household.id), { name: 'Hack' }),
        await outsider.client.post(itemsUrl(household.id), {}),
        await outsider.client.patch(itemUrl(household.id, item.id), { completed: true }),
        await outsider.client.patch(itemUrl(household.id, item.id), { name: '' }),
        await outsider.client.delete(itemUrl(household.id, item.id)),
        await outsider.client.post(clearUrl(household.id)),
        await outsider.client.post(clearUrl(household.id), { itemIds: [item.id] }),
        await outsider.client.post(clearUrl(household.id), { itemIds: 'invalid' }),
      ];
      for (const response of responses) {
        expect(response.statusCode).toBe(404);
        expect(response.json().error.code).toBe('NOT_FOUND');
        expect(response.body).not.toContain('Geheimzutat');
      }
      const row = await t.prisma.shoppingItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.completed).toBe(false);
      expect(await t.prisma.shoppingItem.count({ where: { householdId: household.id } })).toBe(1);
    });

    it('does not let an item id of one household be used through another household', async () => {
      const a = await setupHousehold('A');
      const b = await setupHousehold('B');
      const itemB = await addItem(b.owner.client, b.household, { name: 'Kaffee' });
      // a.owner is a member of A only; the item belongs to B.
      for (const response of [
        await a.owner.client.patch(itemUrl(a.household.id, itemB.id), { completed: true }),
        await a.owner.client.patch(itemUrl(a.household.id, itemB.id), { name: 'Tee' }),
        await a.owner.client.delete(itemUrl(a.household.id, itemB.id)),
      ]) {
        expect(response.statusCode).toBe(404);
      }
      const row = await t.prisma.shoppingItem.findUniqueOrThrow({ where: { id: itemB.id } });
      expect(row).toMatchObject({ name: 'Kaffee', completed: false });
    });

    it('answers 404 for malformed ids and 401 without a session', async () => {
      const { owner, household } = await setupHousehold();
      expect((await owner.client.get(shoppingUrl('not-a-uuid'))).statusCode).toBe(404);
      expect((await owner.client.patch(itemUrl(household.id, 'not-a-uuid'), { completed: true })).statusCode).toBe(404);
      expect((await owner.client.delete(itemUrl(household.id, '../../x'))).statusCode).toBe(404);
      expect((await owner.client.patch(itemUrl(household.id, randomUUID()), { completed: true })).statusCode).toBe(404);

      const anonymous = t.client();
      expect((await anonymous.get(shoppingUrl(household.id))).statusCode).toBe(401);
      expect((await anonymous.post(itemsUrl(household.id), { name: 'Milch' })).statusCode).toBe(401);
    });

    it('emits to the canonical household room when the URL uses an upper-case id', async () => {
      const { owner, household } = await setupHousehold();
      const emitted: SyncEvent[] = [];
      vi.spyOn(t.app.realtime, 'emitSync').mockImplementation((event) => {
        emitted.push(event);
      });
      const upper = household.id.toUpperCase();
      const created = await owner.client.post(itemsUrl(upper), { name: 'Milch' });
      expect(created.statusCode).toBe(201);
      const id = created.json().id as string;
      expect((await owner.client.patch(itemUrl(upper, id.toUpperCase()), { completed: true })).statusCode).toBe(200);
      expect((await owner.client.post(clearUrl(upper), { itemIds: [id.toUpperCase()] })).json()).toEqual({
        deleted: 1,
      });
      expect(emitted).toHaveLength(6);
      for (const event of emitted) {
        expect(event.householdId).toBe(household.id);
        if (event.entityId) expect(event.entityId).toBe(id);
      }
    });

    it('rate-limits shopping writes per user', async () => {
      const limited = await buildTestApp({ rateLimit: true });
      try {
        const owner = await createLoggedInUser(limited.app, { displayName: 'Julian' });
        const member = await createLoggedInUser(limited.app, { displayName: 'Lisa' });
        const household = await createHousehold(limited.prisma, owner.user.id, 'Flut');
        await addMember(limited.prisma, household, member.user.id);

        const created: string[] = [];
        for (let index = 0; index < SHOPPING_WRITE_LIMIT.max; index += 1) {
          const response = await owner.client.post(itemsUrl(household.id), { name: `Artikel ${index}` });
          expect(response.statusCode).toBe(201);
          created.push(response.json().id as string);
        }
        const blocked = [
          await owner.client.post(itemsUrl(household.id), { name: 'Zu viel' }),
          await owner.client.delete(itemUrl(household.id, created[0] ?? '')),
          await owner.client.patch(itemUrl(household.id, created[1] ?? ''), { completed: true }),
          await owner.client.post(clearUrl(household.id)),
        ];
        for (const response of blocked) {
          expect(response.statusCode).toBe(429);
          expect(response.json().error.code).toBe('RATE_LIMITED');
          expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
        }
        expect(await limited.prisma.shoppingItem.count({ where: { householdId: household.id } })).toBe(
          SHOPPING_WRITE_LIMIT.max,
        );
        // Reading and other members are unaffected.
        expect((await owner.client.get(shoppingUrl(household.id))).statusCode).toBe(200);
        expect((await member.client.post(itemsUrl(household.id), { name: 'Brot' })).statusCode).toBe(201);
      } finally {
        await limited.close();
      }
    });

    it('requires the CSRF header and a same-origin Origin on mutations', async () => {
      const { owner, household } = await setupHousehold();
      const noHeader = await owner.client.post(itemsUrl(household.id), { name: 'Milch' }, { csrf: false });
      expect(noHeader.statusCode).toBe(403);
      expect(noHeader.json().error.code).toBe('CSRF');
      const foreignOrigin = await owner.client.post(clearUrl(household.id), undefined, {
        origin: 'https://evil.example',
      });
      expect(foreignOrigin.statusCode).toBe(403);
      expect(await t.prisma.shoppingItem.count({ where: { householdId: household.id } })).toBe(0);
    });
  });

  describe('realtime sync', () => {
    it('emits shopping + dashboard sync events after each committed change only', async () => {
      const { owner, household } = await setupHousehold();
      const emitted: SyncEvent[] = [];
      vi.spyOn(t.app.realtime, 'emitSync').mockImplementation((event) => {
        emitted.push(event);
      });
      const expectEvents = (action: SyncEvent['action'], entityId?: string) => {
        const base = { householdId: household.id, action, actorId: owner.user.id, ...(entityId ? { entityId } : {}) };
        expect(emitted.splice(0)).toEqual([
          { ...base, scope: 'shopping' },
          { ...base, scope: 'dashboard' },
        ]);
      };

      await getList(owner.client, household);
      expect(emitted).toEqual([]);

      const clientId = randomUUID();
      const id = shoppingItemIdFor(household.id, clientId);
      await owner.client.post(itemsUrl(household.id), { clientId, name: 'Milch' });
      expectEvents('created', id);
      await owner.client.post(itemsUrl(household.id), { clientId, name: 'Milch' }); // idempotent retry
      expect(emitted).toEqual([]);

      await owner.client.patch(itemUrl(household.id, id), { completed: true });
      expectEvents('updated', id);
      await owner.client.patch(itemUrl(household.id, id), { completed: true }); // no-op
      expect(emitted).toEqual([]);
      await owner.client.patch(itemUrl(household.id, id), { quantity: '2', unit: 'LITER' });
      expectEvents('updated', id);

      await owner.client.post(clearUrl(household.id));
      expectEvents('bulk');
      await owner.client.post(clearUrl(household.id)); // nothing to clear
      expect(emitted).toEqual([]);

      const other = await addItem(owner.client, household, { name: 'Eier' });
      expectEvents('created', other.id);
      await owner.client.delete(itemUrl(household.id, other.id));
      expectEvents('deleted', other.id);

      // Failed requests emit nothing.
      await owner.client.post(itemsUrl(household.id), { name: '' });
      await owner.client.delete(itemUrl(household.id, other.id));
      expect(emitted).toEqual([]);
    });

    it('delivers the events to other members after the commit, not to other households', async () => {
      const { owner, member, household } = await setupHousehold();
      const outsider = await createLoggedInUser(t.app);
      await createHousehold(t.prisma, outsider.user.id, 'Andere WG');

      const open = (cookie: string): ClientSocket => {
        const socket: ClientSocket = connect(baseUrl, {
          path: SOCKET_PATH,
          transports: ['websocket'],
          extraHeaders: { origin: TEST_APP_URL, cookie },
          reconnection: false,
          forceNew: true,
        });
        sockets.push(socket);
        return socket;
      };
      const memberSocket = open(member.client.cookieHeader());
      const outsiderSocket = open(outsider.client.cookieHeader());
      const outsiderEvents: SyncEvent[] = [];
      outsiderSocket.on('sync', (event) => outsiderEvents.push(event));
      await Promise.all(
        [memberSocket, outsiderSocket].map(
          (socket) => new Promise<void>((resolve) => socket.on('connect', () => resolve())),
        ),
      );
      const deadline = Date.now() + 5_000;
      while ((await t.app.realtime.io.in(householdRoom(household.id)).fetchSockets()).length < 1) {
        if (Date.now() > deadline) throw new Error('member socket did not join the household room');
        await sleep(25);
      }

      const received: Array<{ event: SyncEvent; committed: boolean }> = [];
      const bothScopes = new Promise<void>((resolve) => {
        memberSocket.on('sync', (event) => {
          // At delivery time the change must already be visible to other connections.
          void t.prisma.shoppingItem.count({ where: { id: event.entityId ?? '' } }).then((count) => {
            received.push({ event, committed: count === 1 });
            if (received.length === 2) resolve();
          });
        });
      });

      const item = await addItem(owner.client, household, { name: 'Bananen', quantity: '6', unit: 'STUECK' });
      await bothScopes;
      expect(received.map((r) => r.event.scope).sort()).toEqual(['dashboard', 'shopping']);
      expect(received.every((r) => r.committed && r.event.entityId === item.id)).toBe(true);
      expect(received[0]?.event).toMatchObject({
        householdId: household.id,
        action: 'created',
        actorId: owner.user.id,
      });

      await sleep(100);
      expect(outsiderEvents).toEqual([]);
    });
  });

  it('returns DTOs that satisfy the shared contract', async () => {
    const { owner, household } = await setupHousehold();
    const created: ShoppingItemDto[] = [];
    for (const body of [
      { name: 'Milch', quantity: '2', unit: 'LITER' },
      { name: 'Eier', quantity: '12', unit: 'STUECK', unitPrice: '0.45' },
      { name: 'Reis', quantity: '1', unit: 'PACKUNG' },
    ]) {
      created.push(await addItem(owner.client, household, body));
    }
    await owner.client.patch(itemUrl(household.id, created[2]?.id ?? ''), { completed: true });
    const list = await getList(owner.client, household);
    expect(list.open).toHaveLength(2);
    expect(list.completed).toHaveLength(1);
    expect(list.completed[0]?.completedBy).toEqual({ id: owner.user.id, displayName: 'Julian' });
  });
});
