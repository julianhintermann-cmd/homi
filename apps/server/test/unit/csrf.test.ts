import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/db';
import { classifyApiTarget } from '../../src/lib/api-path';
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

  it('treats percent-encoded spellings of the /api prefix as API requests', () => {
    // Regression: the router decodes `/%61pi/...` to `/api/...`, the raw-URL prefix test did not.
    expect(passesCsrfCheck(post({}, '/%61pi/auth/logout'), dev)).toBe(false);
    expect(passesCsrfCheck(post({}, '/a%70i/items?x=1'), dev)).toBe(false);
    expect(passesCsrfCheck({ ...post({}, '/whatever'), routeUrl: '/api/auth/logout' }, dev)).toBe(false);
    expect(passesCsrfCheck(post({ 'x-homi-request': '1' }, '/%61pi/auth/logout'), dev)).toBe(true);
  });

  it('classifies request targets', () => {
    expect(classifyApiTarget('/api')).toBe('canonical');
    expect(classifyApiTarget('/api?x=1')).toBe('canonical');
    expect(classifyApiTarget('/api/auth/me')).toBe('canonical');
    expect(classifyApiTarget('/%61pi/auth/me')).toBe('non-canonical');
    expect(classifyApiTarget('/%41PI/auth/me')).toBe('none'); // the router is case-sensitive: no API route
    expect(classifyApiTarget('/x', '/api/households')).toBe('non-canonical');
    expect(classifyApiTarget('/apiary')).toBe('none');
    expect(classifyApiTarget('/einkauf')).toBe('none');
    expect(classifyApiTarget('/%E0%A4%A')).toBe('none'); // undecodable: the router answers 400 itself
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
        app.get('/api/__probe', async () => ({ ok: true }));
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

  it('rejects percent-encoded /api prefixes: 403 without the header, 404 otherwise (any method)', async () => {
    const noHeader = await t.client().post('/%61pi/__probe', {}, { csrf: false });
    expect(noHeader.statusCode).toBe(403);
    expect(noHeader.json()).toMatchObject({ error: { code: 'CSRF' } });
    expect((await t.client().post('/%61pi/__probe', {})).statusCode).toBe(404);
    expect((await t.client().get('/%61pi/__probe')).statusCode).toBe(404);
    expect((await t.client().get('/a%70i/__probe')).statusCode).toBe(404);
    expect((await t.client().get('/api/__probe')).statusCode).toBe(200);
  });

  it('accepts a same-origin request with the header', async () => {
    const response = await t.client().post('/api/__probe', {});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
