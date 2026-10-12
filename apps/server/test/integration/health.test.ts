import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME } from '@homi/shared';
import { createPrismaClient, type PrismaClient } from '../../src/db';
import { generateToken } from '../../src/lib/tokens';
import { buildTestApp, type TestApp } from '../helpers/app';

describe('GET /api/health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  it('reports ok when the database answers', async () => {
    const response = await t.client().get('/api/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', db: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('with the database down', () => {
  let t: TestApp;
  let deadPrisma: PrismaClient;

  beforeAll(async () => {
    deadPrisma = createPrismaClient('postgresql://homi:homi@127.0.0.1:1/homi_test');
    t = await buildTestApp({
      prisma: deadPrisma,
      configure: (app) => {
        app.get('/api/__whoami', async (request) => ({ userId: request.user?.id ?? null }));
      },
    });
  });
  afterAll(async () => {
    await t.close();
    await deadPrisma.$disconnect();
  });

  it('health answers 503', async () => {
    const response = await t.client().get('/api/health');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'error', db: 'down' });
  });

  it('session lookups fail with 503 SERVICE_UNAVAILABLE, not 500', async () => {
    const response = await t.client().setCookie(SESSION_COOKIE_NAME, generateToken()).get('/api/__whoami');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
  });
});
