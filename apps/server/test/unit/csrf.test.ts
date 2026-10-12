import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/db';
import { isAllowedOrigin, passesCsrfCheck } from '../../src/plugins/csrf';
import { buildTestApp, type TestApp } from '../helpers/app';
import { TEST_APP_URL, createTestConfig } from '../helpers/config';

const dev = createTestConfig();
const prod = createTestConfig({ NODE_ENV: 'production', APP_URL: 'https://homi.example.ch' });

describe('passesCsrfCheck', () => {
  const post = (headers: Record<string, string>, url = '/api/items') => ({ method: 'POST', url, headers });

  it('lets safe methods and non-API paths through', () => {
    expect(passesCsrfCheck({ method: 'GET', url: '/api/auth/me', headers: {} }, dev)).toBe(true);
    expect(passesCsrfCheck({ method: 'HEAD', url: '/api/health', headers: {} }, dev)).toBe(true);
    expect(passesCsrfCheck({ method: 'OPTIONS', url: '/api/x', headers: {} }, dev)).toBe(true);
    expect(passesCsrfCheck(post({}, '/einkauf'), dev)).toBe(true);
    expect(passesCsrfCheck(post({}, '/apiary'), dev)).toBe(true);
  });

  it('requires the X-Homi-Request header on mutations', () => {
    expect(passesCsrfCheck(post({}), dev)).toBe(false);
    expect(passesCsrfCheck(post({ 'x-homi-request': '0' }), dev)).toBe(false);
    expect(passesCsrfCheck(post({ 'x-homi-request': '1' }), dev)).toBe(true);
    expect(passesCsrfCheck({ method: 'delete', url: '/api', headers: {} }, dev)).toBe(false);
  });

  it('checks the Origin when present', () => {
    expect(passesCsrfCheck(post({ 'x-homi-request': '1', origin: TEST_APP_URL }), dev)).toBe(true);
    expect(passesCsrfCheck(post({ 'x-homi-request': '1', origin: 'https://evil.example' }), dev)).toBe(false);
    expect(passesCsrfCheck(post({ 'x-homi-request': '1', origin: 'null' }), dev)).toBe(false);
    expect(passesCsrfCheck(post({ 'x-homi-request': '1', 'sec-fetch-site': 'cross-site' }), dev)).toBe(false);
  });

  it('accepts the request host as origin only outside production', () => {
    const lan = { 'x-homi-request': '1', origin: 'http://192.168.1.20:5173', host: '192.168.1.20:5173' };
    expect(passesCsrfCheck(post(lan), dev)).toBe(true);
    expect(passesCsrfCheck(post(lan), prod)).toBe(false);
    expect(passesCsrfCheck(post({ 'x-homi-request': '1', origin: 'https://homi.example.ch' }), prod)).toBe(true);
    expect(passesCsrfCheck(post({ 'x-homi-request': '1', origin: 'https://homi.example.ch.evil.io' }), prod)).toBe(
      false,
    );
  });

  it('normalises origins', () => {
    expect(isAllowedOrigin('https://homi.example.ch:443', prod, {})).toBe(true);
    expect(isAllowedOrigin('http://homi.example.ch', prod, {})).toBe(false);
    expect(isAllowedOrigin('ftp://homi.example.ch', prod, {})).toBe(false);
    expect(isAllowedOrigin('not a url', prod, {})).toBe(false);
  });
});

describe('CSRF hook', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp({
      prisma: {} as PrismaClient,
      configure: (app) => {
        app.post('/api/__probe', async () => ({ ok: true }));
      },
    });
  });
  afterAll(() => t.close());

  it('rejects a mutation without the header with 403 CSRF', async () => {
    const response = await t.client().post('/api/__probe', {}, { csrf: false });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: { code: 'CSRF', message: 'Die Anfrage wurde aus Sicherheitsgründen abgelehnt.' },
    });
  });

  it('rejects a foreign Origin', async () => {
    const response = await t.client().post('/api/__probe', {}, { origin: 'https://evil.example' });
    expect(response.statusCode).toBe(403);
  });

  it('accepts a same-origin request with the header', async () => {
    const response = await t.client().post('/api/__probe', {});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
