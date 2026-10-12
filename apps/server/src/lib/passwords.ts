import { hash, verify, type Algorithm, type Options } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

/**
 * Argon2id password hashing with the OWASP baseline parameters (§4.2):
 * memoryCost 19456 KiB, timeCost 2, parallelism 1.
 */

// `Algorithm` is an ambient const enum (not usable with isolatedModules); 2 = Argon2id.
const ARGON2ID: Algorithm = 2;

export const ARGON2_OPTIONS: Readonly<Options> = Object.freeze({
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Verifies a password; malformed hashes count as a mismatch instead of throwing. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Hash of a random secret, computed once; used to equalise timing for unknown accounts. */
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  return dummyHash;
}

/**
 * Login helper: verifies against the user's hash, or – if the account does not exist – against a
 * dummy hash so that response times do not reveal whether an email is registered. Always `false`
 * for a missing hash.
 */
export async function verifyPasswordOrDummy(
  passwordHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!passwordHash) {
    await verifyPassword(await getDummyHash(), password);
    return false;
  }
  return verifyPassword(passwordHash, password);
}

/** Pre-computes the dummy hash (call at start-up to keep the first login fast). */
export async function warmUpPasswordHasher(): Promise<void> {
  await getDummyHash();
}
