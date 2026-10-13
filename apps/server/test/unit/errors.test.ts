import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CreateItemRequestSchema } from '@homi/shared';
import type { PrismaClient } from '../../src/db';
import { AppError } from '../../src/lib/http-errors';
import { toErrorResponse } from '../../src/plugins/errors';
import { buildTestApp, type TestApp } from '../helpers/app';

function prismaError(name: string, code?: string): Error {
  const error = new Error(`Invalid \`prisma.user.create()\` invocation: secret internals (${code})`);
  error.name = name;
  return Object.assign(error, code ? { code, clientVersion: '7.10.0' } : {});
}

describe('toErrorResponse', () => {
  it('renders AppErrors with their status, code and message', () => {
    expect(toErrorResponse(new AppError('LAST_OWNER'))).toEqual({
      statusCode: 409,
      body: { error: { code: 'LAST_OWNER', message: expect.stringContaining('letzte Inhaber') } },
    });
    expect(toErrorResponse(new AppError('NOT_FOUND', 'Artikel nicht gefunden.', { details: { id: 1 } }))).toEqual({
      statusCode: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Artikel nicht gefunden.', details: { id: 1 } } },
    });
  });

  it('maps zod errors to 400 VALIDATION with field details', () => {
    const result = CreateItemRequestSchema.safeParse({ name: '', unitPrice: '1.234' });
    expect(result.success).toBe(false);
    const response = toErrorResponse(result.error);
    expect(response.statusCode).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION');
    expect(response.body.error.details).toEqual({
      fieldErrors: {
        name: 'Bitte gib einen Namen ein.',
        unitPrice: 'Der Preis darf höchstens 2 Nachkommastellen haben.',
      },
      formErrors: [],
    });
    expect(toErrorResponse(new z.ZodError([])).statusCode).toBe(400);
  });

  it('maps Prisma errors without leaking their messages', () => {
    const unique = toErrorResponse(prismaError('PrismaClientKnownRequestError', 'P2002'));
    expect(unique).toEqual({ statusCode: 409, body: { error: { code: 'CONFLICT', message: expect.any(String) } } });
    expect(JSON.stringify(unique)).not.toContain('prisma');

    expect(toErrorResponse(prismaError('PrismaClientKnownRequestError', 'P2025')).statusCode).toBe(404);
    expect(toErrorResponse(prismaError('PrismaClientKnownRequestError', 'P2003')).statusCode).toBe(409);
    expect(toErrorResponse(prismaError('PrismaClientKnownRequestError', 'P2023')).statusCode).toBe(400);
    expect(toErrorResponse(prismaError('PrismaClientKnownRequestError', 'P1001')).statusCode).toBe(503);
    expect(toErrorResponse(prismaError('PrismaClientInitializationError')).statusCode).toBe(503);
    expect(toErrorResponse(prismaError('PrismaClientKnownRequestError', 'P9999')).statusCode).toBe(500);
    expect(toErrorResponse(prismaError('PrismaClientUnknownRequestError')).statusCode).toBe(500);
  });

  it('maps PostgreSQL "invalid byte sequence" (NUL in text) to 400 VALIDATION instead of 500', () => {
    // Shape of a Prisma 7 driver-adapter error for `WHERE "name" = 'a\u0000b'` (probed against PostgreSQL 18).
    for (const code of ['P2039', 'P2010']) {
      const error = Object.assign(prismaError('PrismaClientKnownRequestError', code), {
        meta: {
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: {
              originalCode: '22021',
              kind: 'postgres',
              message: 'invalid byte sequence for encoding "UTF8": 0x00',
            },
          },
        },
      });
      expect(toErrorResponse(error)).toEqual({
        statusCode: 400,
        body: {
          error: {
            code: 'VALIDATION',
            message: expect.any(String),
            details: { fieldErrors: {}, formErrors: ['Der Text enthält ungültige Zeichen.'] },
          },
        },
      });
    }
    const otherSqlState = Object.assign(prismaError('PrismaClientKnownRequestError', 'P2010'), {
      meta: { driverAdapterError: { cause: { originalCode: '42P01' } } },
    });
    expect(toErrorResponse(otherSqlState).statusCode).toBe(500);
  });

  it('maps connection failures hidden in cause chains to 503', () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
    expect(toErrorResponse(new Error('driver failed', { cause })).statusCode).toBe(503);
  });

  it('maps Fastify status errors to German messages', () => {
    const tooLarge = Object.assign(new Error('Request body is too large'), {
      statusCode: 413,
      code: 'FST_ERR_CTP_BODY_TOO_LARGE',
    });
    expect(toErrorResponse(tooLarge)).toEqual({
      statusCode: 413,
      body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Die Datei ist zu gross.' } },
    });
    const badJson = Object.assign(new SyntaxError('Unexpected token'), { statusCode: 400 });
    expect(toErrorResponse(badJson).body.error).toEqual({ code: 'BAD_REQUEST', message: 'Die Anfrage ist ungültig.' });
    expect(toErrorResponse(Object.assign(new Error('x'), { statusCode: 415 })).body.error.code).toBe(
      'UNSUPPORTED_MEDIA_TYPE',
    );
  });

  it('hides unknown errors behind INTERNAL', () => {
    expect(toErrorResponse(new Error('db password is hunter2'))).toEqual({
      statusCode: 500,
      body: { error: { code: 'INTERNAL', message: 'Ein unerwarteter Fehler ist aufgetreten.' } },
    });
    expect(toErrorResponse('a string').statusCode).toBe(500);
  });
});

describe('error handler integration', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp({
      prisma: {} as PrismaClient,
      configure: (app) => {
        app.get('/api/__boom', async () => {
          throw new Error('stack trace with secrets');
        });
        app.post('/api/__validate', async (request) => CreateItemRequestSchema.parse(request.body));
      },
    });
  });
  afterAll(() => t.close());

  it('never leaks internals', async () => {
    const response = await t.client().get('/api/__boom');
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secrets');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Ein unerwarteter Fehler ist aufgetreten.' },
    });
  });

  it('returns validation details for zod errors thrown in handlers', async () => {
    const response = await t.client().post('/api/__validate', { name: 'x', quantity: '-1' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION', details: { fieldErrors: { quantity: 'Die Menge darf nicht negativ sein.' } } },
    });
  });

  it('answers malformed JSON with 400 BAD_REQUEST', async () => {
    const response = await t.client().post('/api/__validate', undefined, {
      rawBody: '{"name":',
      headers: { 'content-type': 'application/json' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'Die Anfrage ist ungültig.' } });
  });

  it('answers unknown API routes with a JSON 404', async () => {
    const response = await t.client().get('/api/does-not-exist');
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Nicht gefunden.' } });
  });

  it('sends the security headers including the CSP from §4.6', async () => {
    const response = await t.client().get('/api/does-not-exist');
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'self';img-src 'self' data: blob:;connect-src 'self' ws: wss:;style-src 'self' 'unsafe-inline';" +
        "font-src 'self' data:;script-src 'self';worker-src 'self' blob:;manifest-src 'self';frame-ancestors 'none';" +
        "base-uri 'self';form-action 'self'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });
});
