import {
  ACTIVITY_ENTITY_TYPE_VALUES,
  ActivityMetaSchema,
  LIMITS,
  isDecimalString,
  toFixedDecimal,
  type ActivityDto,
  type ActivityEntityType,
  type ActivityMeta,
  type ActivityType,
} from '@homi/shared';
import type { Db, Prisma } from '../../db';
import { moneyToString, optionalMoneyToString } from '../../lib/money';

/**
 * Activity recording (used by every feature module inside its write transaction) and the read
 * helpers needed by the dashboard.
 */

export interface RecordActivityInput {
  householdId: string;
  /** Acting user; `null` for system actions. */
  actorId: string | null;
  type: ActivityType;
  entityType?: ActivityEntityType | null;
  entityId?: string | null;
  /** Small JSON payload, e.g. `{ name: "Milch", count: 2 }`. */
  meta?: ActivityMeta | null;
  /**
   * Change of the total inventory value caused by this activity in CHF (decimal string or
   * Prisma Decimal). Rounded half away from zero to 2 decimals.
   */
  valueDelta?: string | Prisma.Decimal | null;
  /** Defaults to now. Activities written in one transaction may share a timestamp. */
  createdAt?: Date;
}

function normalizeValueDelta(value: RecordActivityInput['valueDelta']): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : value.toFixed();
  if (!isDecimalString(text, { allowNegative: true })) {
    throw new TypeError(`recordActivity: invalid valueDelta ${JSON.stringify(text)}`);
  }
  return toFixedDecimal(text, LIMITS.money.scale);
}

/**
 * Inserts a `HouseholdActivity` row. Pass the transaction client so the activity commits (or
 * rolls back) together with the change it describes:
 *
 *   await prisma.$transaction(async (tx) => {
 *     const item = await tx.inventoryItem.create({ … });
 *     await recordActivity(tx, { householdId, actorId: user.id, type: 'ITEM_CREATED',
 *       entityType: 'item', entityId: item.id, meta: { name: item.name }, valueDelta: '25.50' });
 *   });
 */
export async function recordActivity(db: Db, input: RecordActivityInput) {
  const meta = input.meta ? (ActivityMetaSchema.parse(input.meta) as Prisma.InputJsonObject) : undefined;
  return db.householdActivity.create({
    data: {
      householdId: input.householdId,
      actorId: input.actorId,
      type: input.type,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      ...(meta === undefined ? {} : { meta }),
      valueDelta: normalizeValueDelta(input.valueDelta),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });
}

/** `select` for rows passed to {@link toActivityDto}. */
export const activityDtoSelect = {
  id: true,
  type: true,
  entityType: true,
  entityId: true,
  meta: true,
  valueDelta: true,
  createdAt: true,
  actor: { select: { id: true, displayName: true } },
} as const satisfies Prisma.HouseholdActivitySelect;

export type ActivityRow = Prisma.HouseholdActivityGetPayload<{ select: typeof activityDtoSelect }>;

const ENTITY_TYPES: ReadonlySet<string> = new Set(ACTIVITY_ENTITY_TYPE_VALUES);

export function toActivityDto(row: ActivityRow): ActivityDto {
  const meta = row.meta === null ? null : ActivityMetaSchema.safeParse(row.meta);
  return {
    id: row.id,
    type: row.type,
    actor: row.actor ? { id: row.actor.id, displayName: row.actor.displayName } : null,
    entityType: row.entityType && ENTITY_TYPES.has(row.entityType) ? (row.entityType as ActivityEntityType) : null,
    entityId: row.entityId,
    meta: meta && meta.success ? meta.data : null,
    valueDelta: optionalMoneyToString(row.valueDelta),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Latest activities of a household, newest first (Home: 5). */
export async function listRecentActivity(
  db: Db,
  householdId: string,
  limit: number = LIMITS.dashboard.recentActivity,
): Promise<ActivityDto[]> {
  const rows = await db.householdActivity.findMany({
    where: { householdId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: activityDtoSelect,
  });
  return rows.map(toActivityDto);
}

/** Σ valueDelta of a household since `since` as `"42.80"` (Home weekly trend). */
export async function sumValueDeltaSince(db: Db, householdId: string, since: Date): Promise<string> {
  const result = await db.householdActivity.aggregate({
    where: { householdId, createdAt: { gte: since } },
    _sum: { valueDelta: true },
  });
  return result._sum.valueDelta ? moneyToString(result._sum.valueDelta) : '0.00';
}
