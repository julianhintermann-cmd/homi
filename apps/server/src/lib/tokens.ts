import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Default entropy of session, invitation and password-reset tokens (§4.1). */
export const TOKEN_BYTES = 32;

/** Raw tokens are base64url without padding: 32 bytes → 43 characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

/** Generates a cryptographically random base64url token. */
export function generateToken(bytes: number = TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url');
}

/** Cheap syntactic check before touching the database with attacker-controlled input. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

/** `HMAC-SHA256(secret, token)` as lowercase hex (64 chars) – the only form stored in the DB. */
export function hashToken(secret: string, token: string): string {
  return createHmac('sha256', secret).update(token, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests / strings. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Creates a token together with its stored hash. */
export function createHashedToken(secret: string, bytes: number = TOKEN_BYTES): { token: string; tokenHash: string } {
  const token = generateToken(bytes);
  return { token, tokenHash: hashToken(secret, token) };
}
