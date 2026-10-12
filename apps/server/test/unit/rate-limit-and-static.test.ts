import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/db';
import { sanitizeUrl } from '../../src/logger';
import { KeyedRateLimiter } from '../../src/lib/rate-limit';
import { cacheControlFor } from '../../src/plugins/static';
import { buildTestApp, type TestApp } from '../helpers/app';

const stubPrisma = {} as PrismaClient;

describe('KeyedRateLimiter', () => {
  it('allows max hits per sliding window and key', () => {
    let now = 0;
    const limiter = new KeyedRateLimiter({ max: 2, windowMs: 1000 }, true, () => now);
    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('a')).toBe(true);
    expect(limiter.consume('a')).toBe(false);
    expect(limiter.consume('b')).toBe(true);
    expect(limiter.retryAfterMs('a')).toBe(1000);
    now = 1001;
    expect(limiter.retryAfterMs('a')).toBe(0);
    expect(limiter.consume('a')).toBe(true);
  });

  it('is a no-op when disabled and evicts old keys', () => {
    const disabled = new KeyedRateLimiter({ max: 0, windowMs: 1000 }, false);
    expect(disabled.consume('x')).toBe(true);
    const small = new KeyedRateLimiter({ max: 1, windowMs: 60_000, maxKeys: 2 });
    small.consume('1');
    small.consume('2');
    small.consume('3');
    expect(small.consume('1')).toBe(true); // evicted, so allowed again
  });
});

describe('route rate limits', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp({
      prisma: stubPrisma,
      rateLimit: true,
      configure: (app) => {
        app.post('/api/__limited', { config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async () => ({
          ok: true,
        }));
        app.post('/api/__unlimited', async () => ({ ok: true }));
      },
    });
  });
  afterAll(() => t.close());

  it('answers 429 RATE_LIMITED with the standard error body', async () => {
    const client = t.client();
    expect((await client.post('/api/__limited', {})).statusCode).toBe(200);
    expect((await client.post('/api/__limited', {})).statusCode).toBe(200);
    const limited = await client.post('/api/__limited', {});
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.json()).toMatchObject({
      error: { code: 'RATE_LIMITED', details: { retryAfterSeconds: expect.any(Number) } },
    });
    // a different client IP has its own budget
    expect((await client.post('/api/__limited', {}, { remoteAddress: '10.0.0.9' })).statusCode).toBe(200);
  });

  it('does not limit routes without config (global: false)', async () => {
    const client = t.client();
    for (let i = 0; i < 5; i += 1) expect((await client.post('/api/__unlimited', {})).statusCode).toBe(200);
  });
});

describe('logger URL sanitising', () => {
  it('redacts tokens in invitation and reset URLs', () => {
    expect(sanitizeUrl('/api/invitations/abcDEF123_-xyz/accept')).toBe('/api/invitations/[redacted]/accept');
    expect(sanitizeUrl('/api/invitations/abc?x=1')).toBe('/api/invitations/[redacted]?x=1');
    expect(sanitizeUrl('/einladung/tok')).toBe('/einladung/[redacted]');
    expect(sanitizeUrl('/api/households/1/items')).toBe('/api/households/1/items');
  });
});

describe('static SPA serving', () => {
  let dist: string;
  let t: TestApp;

  beforeAll(async () => {
    dist = await mkdtemp(path.join(os.tmpdir(), 'homi-dist-'));
    await mkdir(path.join(dist, 'assets'));
    await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>Homi</title>');
    await writeFile(path.join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
    await writeFile(path.join(dist, 'sw.js'), 'self.addEventListener("fetch", () => {})');
    await writeFile(path.join(dist, 'manifest.webmanifest'), '{}');
    await writeFile(path.join(dist, 'icon-192.png'), 'png');
    t = await buildTestApp({ prisma: stubPrisma, serveStatic: true, env: { WEB_DIST_DIR: dist } });
  });
  afterAll(async () => {
    await t.close();
    await rm(dist, { recursive: true, force: true });
  });

  it('chooses cache headers per file type', () => {
    expect(cacheControlFor('assets/index-abc123.js')).toBe('public, max-age=31536000, immutable');
    expect(cacheControlFor('workbox-5d3b2c1a.js')).toBe('public, max-age=31536000, immutable');
    expect(cacheControlFor('index.html')).toBe('no-cache');
    expect(cacheControlFor('sw.js')).toBe('no-cache');
    expect(cacheControlFor('manifest.webmanifest')).toBe('no-cache');
    expect(cacheControlFor('icon-192.png')).toBe('public, max-age=3600');
  });

  it('serves hashed assets as immutable and the shell as no-cache', async () => {
    const client = t.client();
    const asset = await client.get('/assets/index-abc123.js');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');

    const sw = await client.get('/sw.js');
    expect(sw.headers['cache-control']).toBe('no-cache');
    expect((await client.get('/manifest.webmanifest')).headers['cache-control']).toBe('no-cache');
  });

  it('falls back to index.html for client routes', async () => {
    for (const url of ['/', '/inventar', '/chats/123', '/einladung/abc?x=1']) {
      const response = await t.client().get(url);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.body).toContain('<title>Homi</title>');
    }
  });

  it('never shadows the API or missing files', async () => {
    const api = await t.client().get('/api/nope');
    expect(api.statusCode).toBe(404);
    expect(api.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect((await t.client().get('/assets/missing.js')).statusCode).toBe(404);
    expect((await t.client().post('/inventar', {})).statusCode).toBe(404);
    expect((await t.client().get('/socket.io/x')).statusCode).toBe(404);
  });
});
