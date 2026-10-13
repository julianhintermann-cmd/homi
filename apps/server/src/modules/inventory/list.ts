import type { ItemCategory, ItemListParams, ItemListResponse, ItemSort } from '@homi/shared';
import { Prisma, type Db } from '../../db';
import { AppError } from '../../lib/http-errors';
import { inventoryItemSelect, toInventoryItemDto } from './dto';

/*
 * `GET /households/:householdId/items` – filtered, sorted, keyset-paginated item list.
 *
 * The page is selected with one raw query (sort keys can be expressions such as
 * `quantity × unitPrice` that Prisma cannot order by) and then loaded with Prisma for the DTO.
 * The opaque cursor carries the sort key of the last row, so pages stay stable while rows
 * before the cursor are inserted or deleted (no duplicates, no gaps).
 *
 *   name   – lower(name) ASC, id ASC
 *   recent – updatedAt DESC, id DESC
 *   value  – quantity × unitPrice DESC NULLS LAST (unknown prices last), lower(name) ASC, id ASC
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const NUMERIC = /^-?\d{1,20}(\.\d{1,10})?$/;

export type ItemCursor =
  | { s: 'name'; n: string; id: string }
  | { s: 'recent'; u: string; id: string }
  | { s: 'value'; t: string | null; n: string; id: string };

export function encodeItemCursor(cursor: ItemCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function invalidCursor(): AppError {
  return new AppError('VALIDATION', 'Ungültige Seitenmarke. Bitte lade die Liste neu.', {
    details: { fieldErrors: { cursor: 'Ungültige Seitenmarke.' }, formErrors: [] },
  });
}

/** Decodes and validates a cursor for `sort`; throws `400 VALIDATION` for anything else. */
export function decodeItemCursor(raw: string, sort: ItemSort): ItemCursor {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (typeof value !== 'object' || value === null) throw invalidCursor();
  const cursor = value as Record<string, unknown>;
  if (cursor.s !== sort || typeof cursor.id !== 'string' || !UUID.test(cursor.id)) throw invalidCursor();
  const isName = (name: unknown): name is string => typeof name === 'string' && name.length <= 400;

  switch (sort) {
    case 'name':
      if (!isName(cursor.n)) throw invalidCursor();
      return { s: 'name', n: cursor.n, id: cursor.id };
    case 'recent':
      if (typeof cursor.u !== 'string' || !ISO_TIMESTAMP.test(cursor.u) || Number.isNaN(Date.parse(cursor.u))) {
        throw invalidCursor();
      }
      return { s: 'recent', u: cursor.u, id: cursor.id };
    case 'value':
      if (!isName(cursor.n)) throw invalidCursor();
      if (cursor.t !== null && (typeof cursor.t !== 'string' || !NUMERIC.test(cursor.t))) throw invalidCursor();
      return { s: 'value', t: cursor.t, n: cursor.n, id: cursor.id };
    default:
      throw invalidCursor();
  }
}

/** Escapes `%`, `_` and `\` for a `LIKE` pattern (PostgreSQL's default escape character is `\`). */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

interface KeyRow {
  id: string;
  nameKey: string;
  updatedAt: Date;
  totalKey: string | null;
}

const TOTAL = Prisma.sql`(i."quantity" * i."unitPrice")`;

function orderBy(sort: ItemSort): Prisma.Sql {
  switch (sort) {
    case 'recent':
      return Prisma.sql`ORDER BY i."updatedAt" DESC, i."id" DESC`;
    case 'value':
      return Prisma.sql`ORDER BY ${TOTAL} DESC NULLS LAST, lower(i."name") ASC, i."id" ASC`;
    default:
      return Prisma.sql`ORDER BY lower(i."name") ASC, i."id" ASC`;
  }
}

function keysetCondition(cursor: ItemCursor): Prisma.Sql {
  switch (cursor.s) {
    case 'name':
      return Prisma.sql`(lower(i."name"), i."id") > (${cursor.n}, ${cursor.id}::uuid)`;
    case 'recent':
      return Prisma.sql`(i."updatedAt", i."id") < (${cursor.u}::timestamp(3), ${cursor.id}::uuid)`;
    case 'value': {
      const afterName = Prisma.sql`(lower(i."name"), i."id") > (${cursor.n}, ${cursor.id}::uuid)`;
      if (cursor.t === null) return Prisma.sql`(i."unitPrice" IS NULL AND ${afterName})`;
      return Prisma.sql`(${TOTAL} < ${cursor.t}::numeric OR (${TOTAL} = ${cursor.t}::numeric AND ${afterName}) OR i."unitPrice" IS NULL)`;
    }
  }
}

function cursorFor(sort: ItemSort, row: KeyRow): ItemCursor {
  switch (sort) {
    case 'recent':
      return { s: 'recent', u: row.updatedAt.toISOString(), id: row.id };
    case 'value':
      return { s: 'value', t: row.totalKey, n: row.nameKey, id: row.id };
    default:
      return { s: 'name', n: row.nameKey, id: row.id };
  }
}

export interface ListItemsInput extends ItemListParams {
  householdId: string;
}

export async function listItems(db: Db, input: ListItemsInput): Promise<ItemListResponse> {
  const { householdId, search, category, sort, limit } = input;
  const cursor = input.cursor ? decodeItemCursor(input.cursor, sort) : null;

  const filters: Prisma.Sql[] = [Prisma.sql`i."householdId" = ${householdId}::uuid`];
  if (search) filters.push(Prisma.sql`i."name" ILIKE ${`%${escapeLikePattern(search)}%`}`);
  if (category) filters.push(Prisma.sql`i."category" = ${category satisfies ItemCategory}::"ItemCategory"`);
  const where = Prisma.join(filters, ' AND ');
  const pageWhere = cursor ? Prisma.join([...filters, keysetCondition(cursor)], ' AND ') : where;

  const [keys, counted] = await Promise.all([
    db.$queryRaw<KeyRow[]>`
      SELECT i."id"::text AS "id", lower(i."name") AS "nameKey", i."updatedAt" AS "updatedAt",
             ${TOTAL}::text AS "totalKey"
      FROM "InventoryItem" i
      WHERE ${pageWhere}
      ${orderBy(sort)}
      LIMIT ${limit + 1}`,
    db.$queryRaw<Array<{ total: number }>>`
      SELECT count(*)::int AS "total" FROM "InventoryItem" i WHERE ${where}`,
  ]);

  const page = keys.slice(0, limit);
  const last = page.at(-1);
  const nextCursor = keys.length > limit && last ? encodeItemCursor(cursorFor(sort, last)) : null;

  const rows =
    page.length === 0
      ? []
      : await db.inventoryItem.findMany({
          where: { householdId, id: { in: page.map((key) => key.id) } },
          select: inventoryItemSelect,
        });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const items = page.flatMap((key) => {
    const row = byId.get(key.id);
    return row ? [toInventoryItemDto(row)] : [];
  });

  return { items, nextCursor, total: counted[0]?.total ?? 0 };
}
