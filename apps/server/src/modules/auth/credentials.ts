import type { Db, Tx } from '../../db';

/*
 * Serialisation of everything that depends on a user's password hash (§4.2).
 *
 * Login verifies the password against a hash it read earlier (argon2 takes tens of milliseconds)
 * and only then inserts its session. A password reset or change that commits in between deletes
 * the sessions that exist at that moment – a login that inserts its session afterwards would
 * survive with the OLD password. Two locks close that gap:
 *
 * - Writers (reset confirm, password change, reset-token issuance) take the user row with
 *   `FOR UPDATE` before they touch the hash, the sessions or the reset tokens.
 * - Login inserts its session first and then re-reads the hash with `FOR SHARE`
 *   ({@link passwordHashUnchanged}). Either the re-read waits for a running writer and sees the new
 *   hash (→ the login discards its session), or it runs before the writer locks the row – then the
 *   writer's session cleanup starts later and sees (and deletes) the new session.
 */

/** Locks the user row for the rest of the transaction. Returns `false` if the user does not exist. */
export async function lockUserRow(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  return rows.length > 0;
}

/**
 * True if the stored hash is still the one the password was verified against. Waits for a
 * concurrent reset / password change that already locked the row (see the file comment).
 */
export async function passwordHashUnchanged(db: Db, userId: string, verifiedHash: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ passwordHash: string }>>`
    SELECT "passwordHash" FROM "User" WHERE "id" = ${userId}::uuid FOR SHARE`;
  return rows[0]?.passwordHash === verifiedHash;
}
