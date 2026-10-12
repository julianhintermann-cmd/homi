import { describe, expect, it } from 'vitest';
import { createHashedToken, generateToken, hashToken, isWellFormedToken, safeEqual } from '../../src/lib/tokens';
import { hashPassword, verifyPassword, verifyPasswordOrDummy } from '../../src/lib/passwords';

describe('tokens', () => {
  it('generates 32-byte base64url tokens', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(generateToken()).not.toBe(token);
  });

  it('hashes with HMAC-SHA256 as 64 hex chars, keyed by the secret', () => {
    const token = 'abc';
    // known answer: HMAC-SHA256(key "secret", message "abc")
    expect(hashToken('secret', token)).toBe('9946dad4e00e913fc8be8e5d3f7e110a4a9e832f83fb09c345285d78638d8a0e');
    expect(hashToken('secret', token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('other-secret', token)).not.toBe(hashToken('secret', token));
  });

  it('creates token + hash pairs that match', () => {
    const { token, tokenHash } = createHashedToken('s3cret');
    expect(hashToken('s3cret', token)).toBe(tokenHash);
  });

  it('rejects malformed tokens before any lookup', () => {
    expect(isWellFormedToken(generateToken())).toBe(true);
    for (const value of [
      '',
      'short',
      'a'.repeat(129),
      'has space'.padEnd(40, 'x'),
      '../../etc/passwd'.padEnd(40, 'x'),
      42,
      null,
    ]) {
      expect(isWellFormedToken(value)).toBe(false);
    }
  });

  it('compares in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('passwords', () => {
  it('hashes with argon2id and the OWASP parameters', async () => {
    const hash = await hashPassword('Korrekt-Pferd-42');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, 'Korrekt-Pferd-42')).toBe(true);
    expect(await verifyPassword(hash, 'falsch')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('verifies against a dummy hash for unknown accounts', async () => {
    expect(await verifyPasswordOrDummy(null, 'irgendwas-123')).toBe(false);
    const hash = await hashPassword('Geheim-12345');
    expect(await verifyPasswordOrDummy(hash, 'Geheim-12345')).toBe(true);
  });
});
