import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_TYPE_VALUES,
  CONVERSATION_TYPE_VALUES,
  HOUSEHOLD_ROLE_VALUES,
  ITEM_CATEGORY_VALUES,
  MESSAGE_KIND_VALUES,
  UNIT_VALUES,
} from '@homi/shared';
import * as PrismaEnums from '../../src/generated/prisma/enums';
import { Prisma } from '../../src/db';
import {
  moneyToString,
  optionalMoneyToString,
  optionalQuantityToString,
  quantityToString,
  totalValueToString,
} from '../../src/lib/money';
import { toActivityDto, type ActivityRow } from '../../src/modules/activity/service';

describe('Prisma Decimal ↔ API strings', () => {
  it('formats money with two decimals', () => {
    expect(moneyToString(new Prisma.Decimal('8.5'))).toBe('8.50');
    expect(moneyToString(new Prisma.Decimal('1e-7'))).toBe('0.00');
    expect(moneyToString(new Prisma.Decimal('12345678.90'))).toBe('12345678.90');
    expect(optionalMoneyToString(null)).toBeNull();
  });

  it('formats quantities without insignificant zeros', () => {
    expect(quantityToString(new Prisma.Decimal('3.000'))).toBe('3');
    expect(quantityToString(new Prisma.Decimal('1.500'))).toBe('1.5');
    expect(quantityToString(new Prisma.Decimal('0.125'))).toBe('0.125');
    expect(optionalQuantityToString(undefined)).toBeNull();
  });

  it('computes line totals exactly', () => {
    expect(totalValueToString(new Prisma.Decimal('3'), new Prisma.Decimal('8.50'))).toBe('25.50');
    expect(totalValueToString(new Prisma.Decimal('0.1'), new Prisma.Decimal('0.2'))).toBe('0.02');
    expect(totalValueToString(new Prisma.Decimal('2'), null)).toBeNull();
  });
});

describe('enum parity with prisma/schema.prisma', () => {
  it.each([
    ['HouseholdRole', HOUSEHOLD_ROLE_VALUES, PrismaEnums.HouseholdRole],
    ['ItemCategory', ITEM_CATEGORY_VALUES, PrismaEnums.ItemCategory],
    ['Unit', UNIT_VALUES, PrismaEnums.Unit],
    ['ConversationType', CONVERSATION_TYPE_VALUES, PrismaEnums.ConversationType],
    ['MessageKind', MESSAGE_KIND_VALUES, PrismaEnums.MessageKind],
    ['ActivityType', ACTIVITY_TYPE_VALUES, PrismaEnums.ActivityType],
  ] as const)('%s', (_name, shared, prisma) => {
    expect([...shared]).toEqual(Object.values(prisma));
  });
});

describe('toActivityDto', () => {
  const base: ActivityRow = {
    id: '0f8fad5b-d9cb-469f-a165-70867728950e',
    type: 'ITEM_CREATED',
    entityType: 'item',
    entityId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    meta: { name: 'Milch', extra: true },
    valueDelta: new Prisma.Decimal('4.2'),
    createdAt: new Date('2026-10-12T10:00:00Z'),
    actor: { id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427', displayName: 'Anna' },
  };

  it('maps rows to DTOs', () => {
    expect(toActivityDto(base)).toEqual({
      id: base.id,
      type: 'ITEM_CREATED',
      actor: { id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427', displayName: 'Anna' },
      entityType: 'item',
      entityId: base.entityId,
      meta: { name: 'Milch', extra: true },
      valueDelta: '4.20',
      createdAt: '2026-10-12T10:00:00.000Z',
    });
  });

  it('drops unknown entity types and malformed meta', () => {
    const dto = toActivityDto({
      ...base,
      entityType: 'weird',
      meta: ['not', 'an', 'object'],
      valueDelta: null,
      actor: null,
    });
    expect(dto).toMatchObject({ entityType: null, meta: null, valueDelta: null, actor: null });
  });
});
