import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listRecentActivity, recordActivity, sumValueDeltaSince } from '../../src/modules/activity/service';
import { buildTestApp, type TestApp } from '../helpers/app';
import { createHousehold, createUser } from '../helpers/fixtures';

describe('activity service', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  it('records activities inside a transaction and lists them newest first', async () => {
    const user = await createUser(t.prisma, { displayName: 'Luca' });
    const household = await createHousehold(t.prisma, user.id);
    const now = Date.now();

    await t.prisma.$transaction(async (tx) => {
      await recordActivity(tx, {
        householdId: household.id,
        actorId: user.id,
        type: 'ITEM_CREATED',
        entityType: 'item',
        entityId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        meta: { name: 'Olivenöl' },
        valueDelta: '25.505',
        createdAt: new Date(now + 1_000),
      });
      await recordActivity(tx, {
        householdId: household.id,
        actorId: user.id,
        type: 'ITEM_QUANTITY_CHANGED',
        meta: { name: 'Olivenöl', delta: '-1' },
        valueDelta: '-8.50',
        createdAt: new Date(now + 2_000),
      });
    });

    const recent = await listRecentActivity(t.prisma, household.id);
    expect(recent.map((a) => a.type)).toEqual(['ITEM_QUANTITY_CHANGED', 'ITEM_CREATED', 'HOUSEHOLD_CREATED']);
    expect(recent[1]).toMatchObject({
      actor: { id: user.id, displayName: 'Luca' },
      entityType: 'item',
      meta: { name: 'Olivenöl' },
      valueDelta: '25.51',
    });
    expect(recent[2]?.valueDelta).toBeNull();

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(await sumValueDeltaSince(t.prisma, household.id, weekAgo)).toBe('17.01');
    expect(await sumValueDeltaSince(t.prisma, household.id, new Date(now + 60_000))).toBe('0.00');
  });

  it('rolls back with the surrounding transaction', async () => {
    const user = await createUser(t.prisma);
    const household = await createHousehold(t.prisma, user.id);
    await expect(
      t.prisma.$transaction(async (tx) => {
        await recordActivity(tx, { householdId: household.id, actorId: user.id, type: 'SHOPPING_ITEM_ADDED' });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(
      await t.prisma.householdActivity.count({ where: { householdId: household.id, type: 'SHOPPING_ITEM_ADDED' } }),
    ).toBe(0);
  });

  it('rejects invalid value deltas', async () => {
    const user = await createUser(t.prisma);
    const household = await createHousehold(t.prisma, user.id);
    await expect(
      recordActivity(t.prisma, {
        householdId: household.id,
        actorId: user.id,
        type: 'ITEM_UPDATED',
        valueDelta: '1e5',
      }),
    ).rejects.toThrow(TypeError);
  });
});
