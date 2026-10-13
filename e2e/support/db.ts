import pg from 'pg';
import { E2E_DATABASE_URL, assertDisposableDatabase } from './env';

/**
 * Direct SQL on the disposable E2E database – only for test arrangement (ordering/timestamps/cleanup of seeded
 * rows). The application under test is never mutated through its code, only its data is arranged.
 */
export async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  assertDisposableDatabase(E2E_DATABASE_URL);
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Sets the order of "Zuletzt geändert" (inventory list default) and of the Home tiles (3 most recently updated):
 * the named items get `updatedAt` = now − i minutes (first name = newest), everything else is a day old.
 */
export async function setInventoryOrder(householdId: string, namesNewestFirst: string[]): Promise<void> {
  await withDb(async (db) => {
    await db.query(
      `UPDATE "InventoryItem" SET "updatedAt" = (now() AT TIME ZONE 'UTC') - interval '1 day' WHERE "householdId" = $1`,
      [householdId],
    );
    for (const [index, name] of namesNewestFirst.entries()) {
      await db.query(
        `UPDATE "InventoryItem" SET "updatedAt" = (now() AT TIME ZONE 'UTC') - ($3 * interval '1 minute')
         WHERE "householdId" = $1 AND name = $2`,
        [householdId, name, index],
      );
    }
  });
}

/** Sets the order of the open shopping items (list and Home preview are ordered by `createdAt` ascending). */
export async function setShoppingOrder(householdId: string, namesOldestFirst: string[]): Promise<void> {
  await withDb(async (db) => {
    for (const [index, name] of namesOldestFirst.entries()) {
      await db.query(
        `UPDATE "ShoppingItem" SET "createdAt" = (now() AT TIME ZONE 'UTC') - interval '2 days' + ($3 * interval '1 minute')
         WHERE "householdId" = $1 AND name = $2 AND NOT completed`,
        [householdId, name, index],
      );
    }
  });
}

/** Removes a message by its content (screen 08 shows the conversation before Lisa's newest message). */
export async function deleteMessage(conversationId: string, content: string): Promise<void> {
  await withDb(async (db) => {
    await db.query(`DELETE FROM "Message" WHERE "conversationId" = $1 AND content = $2`, [conversationId, content]);
  });
}
