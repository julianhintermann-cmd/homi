import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DashboardDtoSchema, type DashboardDto } from '@homi/shared';
import { recordActivity } from '../../src/modules/activity/service';
import { buildTestApp, type TestApp } from '../helpers/app';
import { addMember, createHousehold, createLoggedInUser, type TestHousehold } from '../helpers/fixtures';
import type { TestClient } from '../helpers/http';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('GET /api/households/:id/dashboard', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  async function fetchDashboard(client: TestClient, householdId: string): Promise<DashboardDto> {
    const res = await client.get(`/api/households/${householdId}/dashboard`);
    expect(res.statusCode).toBe(200);
    // Contract check: the local mappers must produce exactly the shared DTO shapes.
    return DashboardDtoSchema.parse(res.json());
  }

  async function item(
    household: TestHousehold,
    data: { name: string; quantity: string; unitPrice: string | null; updatedAt?: Date; unit?: 'STUECK' | 'FLASCHE' },
  ) {
    return t.prisma.inventoryItem.create({
      data: {
        householdId: household.id,
        name: data.name,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        unit: data.unit ?? 'STUECK',
        ...(data.updatedAt ? { createdAt: data.updatedAt, updatedAt: data.updatedAt } : {}),
      },
    });
  }

  it('sums the inventory value with Decimal precision and counts unpriced items separately', async () => {
    const { user, client } = await createLoggedInUser(t.app, { displayName: 'Julian' });
    const household = await createHousehold(t.prisma, user.id, 'Unser Zuhause');
    await item(household, { name: 'Milch', quantity: '3', unitPrice: '1.55' });
    await item(household, { name: 'Olivenöl', quantity: '2', unitPrice: '8.50', unit: 'FLASCHE' });
    await item(household, { name: 'Kaffeekapseln', quantity: '24', unitPrice: '0.54' });
    await item(household, { name: 'Eier', quantity: '12', unitPrice: null });

    const dashboard = await fetchDashboard(client, household.id);
    // 3 × 1.55 + 2 × 8.50 + 24 × 0.54 = 4.65 + 17.00 + 12.96 (floats would give 34.610000000000007)
    expect(dashboard.inventoryValue).toBe('34.61');
    expect(dashboard.itemCount).toBe(4);
    expect(dashboard.unpricedItemCount).toBe(1);
  });

  it('rounds each line like the item total (half away from zero) and handles big values exactly', async () => {
    const { user, client } = await createLoggedInUser(t.app);
    const household = await createHousehold(t.prisma, user.id);
    await item(household, { name: 'Reis', quantity: '1.5', unitPrice: '3.33' }); // 4.995 → 5.00
    await item(household, { name: 'Kaffee', quantity: '0.333', unitPrice: '0.10' }); // 0.0333 → 0.03
    await item(household, { name: 'Sofa', quantity: '99999.999', unitPrice: '99999.99' }); // max quantity × max price
    const dashboard = await fetchDashboard(client, household.id);
    // 99999.999 × 99999.99 = 9999998900.00001 → 9999998900.00; + 5.00 + 0.03
    expect(dashboard.inventoryValue).toBe('9999998905.03');
    expect(dashboard.unpricedItemCount).toBe(0);
  });

  it('reports zero values for an empty household', async () => {
    const { user, client } = await createLoggedInUser(t.app, { displayName: 'Julian' });
    const household = await createHousehold(t.prisma, user.id);
    const dashboard = await fetchDashboard(client, household.id);
    expect(dashboard).toMatchObject({
      itemCount: 0,
      inventoryValue: '0.00',
      unpricedItemCount: 0,
      weeklyValueDelta: '0.00',
      openShoppingCount: 0,
      recentItems: [],
      openShoppingItems: [],
      members: [{ userId: user.id, displayName: 'Julian' }],
    });
    expect(dashboard.recentActivity.map((a) => a.type)).toEqual(['HOUSEHOLD_CREATED']);
  });

  it('computes the weekly value delta from the last 7 days of activity', async () => {
    const { user, client } = await createLoggedInUser(t.app);
    const household = await createHousehold(t.prisma, user.id);
    const now = Date.now();
    const base = { householdId: household.id, actorId: user.id } as const;
    await recordActivity(t.prisma, { ...base, type: 'ITEM_CREATED', valueDelta: '25.50', createdAt: new Date(now) });
    await recordActivity(t.prisma, {
      ...base,
      type: 'ITEM_QUANTITY_CHANGED',
      valueDelta: '-8.50',
      createdAt: new Date(now - 2 * DAY_MS),
    });
    await recordActivity(t.prisma, {
      ...base,
      type: 'ITEM_CREATED',
      valueDelta: '25.80',
      createdAt: new Date(now - 6 * DAY_MS),
    });
    await recordActivity(t.prisma, {
      ...base,
      type: 'ITEM_CREATED',
      valueDelta: '100.00',
      createdAt: new Date(now - 8 * DAY_MS),
    });
    const dashboard = await fetchDashboard(client, household.id);
    expect(dashboard.weeklyValueDelta).toBe('42.80');

    await recordActivity(t.prisma, { ...base, type: 'ITEM_DELETED', valueDelta: '-50.00' });
    expect((await fetchDashboard(client, household.id)).weeklyValueDelta).toBe('-7.20');
  });

  it('returns the 3 most recently updated items mapped to the shared DTO (incl. image URLs)', async () => {
    const { user, client } = await createLoggedInUser(t.app, { displayName: 'Julian' });
    const household = await createHousehold(t.prisma, user.id);
    const now = Date.now();
    const imageId = randomUUID();
    await t.prisma.inventoryImage.create({
      data: {
        id: imageId,
        householdId: household.id,
        storageKey: `${household.id}/${imageId}`,
        mimeType: 'image/webp',
        width: 400,
        height: 400,
        byteSize: 1234,
      },
    });
    await item(household, { name: 'Alt', quantity: '1', unitPrice: null, updatedAt: new Date(now - 4 * DAY_MS) });
    await item(household, { name: 'Olivenöl', quantity: '2', unitPrice: '8.50', updatedAt: new Date(now - DAY_MS) });
    const milk = await t.prisma.inventoryItem.create({
      data: {
        householdId: household.id,
        name: 'Milch',
        quantity: '3',
        unitPrice: '1.55',
        imageId,
        createdById: user.id,
        createdAt: new Date(now - 3 * DAY_MS),
        updatedAt: new Date(now),
      },
    });
    await item(household, { name: 'Kaffee', quantity: '2', unitPrice: null, updatedAt: new Date(now - 2 * DAY_MS) });

    const dashboard = await fetchDashboard(client, household.id);
    expect(dashboard.recentItems.map((i) => i.name)).toEqual(['Milch', 'Olivenöl', 'Kaffee']);
    expect(dashboard.recentItems[0]).toEqual({
      id: milk.id,
      name: 'Milch',
      category: 'SONSTIGES',
      quantity: '3',
      unit: 'STUECK',
      unitPrice: '1.55',
      totalValue: '4.65',
      image: {
        id: imageId,
        thumbUrl: `/api/households/${household.id}/images/${imageId}?variant=thumb`,
        fullUrl: `/api/households/${household.id}/images/${imageId}?variant=full`,
      },
      createdBy: { id: user.id, displayName: 'Julian' },
      createdAt: new Date(now - 3 * DAY_MS).toISOString(),
      updatedAt: new Date(now).toISOString(),
      version: 1,
    });
    expect(dashboard.recentItems[2]).toMatchObject({ unitPrice: null, totalValue: null, image: null });
  });

  it('lists up to 3 open shopping items (oldest first) and counts all open ones', async () => {
    const { user, client } = await createLoggedInUser(t.app);
    const household = await createHousehold(t.prisma, user.id);
    const now = Date.now();
    const entries: Array<[string, string | null, 'STUECK' | 'GRAMM' | 'FLASCHE' | null, boolean]> = [
      ['Eier', '12', 'STUECK', false],
      ['Milch', '2', null, true],
      ['Butter', '250', 'GRAMM', false],
      ['Spülmittel', '1', 'FLASCHE', false],
      ['Reis', null, null, false],
    ];
    for (const [index, [name, quantity, unit, completed]] of entries.entries()) {
      await t.prisma.shoppingItem.create({
        data: {
          householdId: household.id,
          shoppingListId: household.shoppingListId,
          name,
          quantity,
          unit,
          completed,
          completedAt: completed ? new Date(now) : null,
          completedById: completed ? user.id : null,
          createdById: user.id,
          createdAt: new Date(now - (10 - index) * 60_000),
        },
      });
    }
    const dashboard = await fetchDashboard(client, household.id);
    expect(dashboard.openShoppingCount).toBe(4);
    expect(dashboard.openShoppingItems.map((i) => [i.name, i.quantity, i.unit])).toEqual([
      ['Eier', '12', 'STUECK'],
      ['Butter', '250', 'GRAMM'],
      ['Spülmittel', '1', 'FLASCHE'],
    ]);
    expect(dashboard.openShoppingItems.every((i) => !i.completed && i.completedAt === null)).toBe(true);
  });

  it('includes members and the 5 latest activities', async () => {
    const owner = await createLoggedInUser(t.app, { displayName: 'Julian' });
    const household = await createHousehold(t.prisma, owner.user.id);
    const lisa = await createLoggedInUser(t.app, { displayName: 'Lisa' });
    await addMember(t.prisma, household, lisa.user.id);
    for (let i = 1; i <= 6; i++) {
      await recordActivity(t.prisma, {
        householdId: household.id,
        actorId: owner.user.id,
        type: 'SHOPPING_ITEM_ADDED',
        meta: { name: `Eintrag ${i}` },
        createdAt: new Date(Date.now() + i * 1_000),
      });
    }
    const dashboard = await fetchDashboard(lisa.client, household.id);
    expect(dashboard.members).toEqual([
      { userId: owner.user.id, displayName: 'Julian' },
      { userId: lisa.user.id, displayName: 'Lisa' },
    ]);
    expect(dashboard.recentActivity.map((a) => a.meta?.name)).toEqual([
      'Eintrag 6',
      'Eintrag 5',
      'Eintrag 4',
      'Eintrag 3',
      'Eintrag 2',
    ]);
  });

  it('isolates households: numbers never mix and non-members get 404', async () => {
    const a = await createLoggedInUser(t.app);
    const b = await createLoggedInUser(t.app);
    const householdA = await createHousehold(t.prisma, a.user.id, 'A');
    const householdB = await createHousehold(t.prisma, b.user.id, 'B');
    await item(householdA, { name: 'Milch', quantity: '1', unitPrice: '1.00' });
    await item(householdB, { name: 'Kaffee', quantity: '10', unitPrice: '10.00' });
    await item(householdB, { name: 'Tee', quantity: '1', unitPrice: null });
    await t.prisma.shoppingItem.create({
      data: { householdId: householdB.id, shoppingListId: householdB.shoppingListId, name: 'Brot' },
    });
    await recordActivity(t.prisma, {
      householdId: householdB.id,
      actorId: b.user.id,
      type: 'ITEM_CREATED',
      valueDelta: '100.00',
    });

    const dashboardA = await fetchDashboard(a.client, householdA.id);
    expect(dashboardA).toMatchObject({
      itemCount: 1,
      inventoryValue: '1.00',
      unpricedItemCount: 0,
      weeklyValueDelta: '0.00',
      openShoppingCount: 0,
      openShoppingItems: [],
    });
    expect(dashboardA.recentItems.map((i) => i.name)).toEqual(['Milch']);

    const foreign = await a.client.get(`/api/households/${householdB.id}/dashboard`);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.body).not.toContain('Kaffee');
    expect((await a.client.get('/api/households/not-a-uuid/dashboard')).statusCode).toBe(404);
    expect((await t.client().get(`/api/households/${householdA.id}/dashboard`)).statusCode).toBe(401);
  });
});
