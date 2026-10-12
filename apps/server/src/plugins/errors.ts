import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { toValidationDetails, type ApiErrorBody, type ApiErrorCode } from '@homi/shared';
import { AppError } from '../lib/http-errors';

/**
 * Central error mapping (§4.6). Every error leaves the server as
 * `{ error: { code, message, details? } }` with a German message; stack traces, Prisma
 * messages and Fastify internals are only logged, never sent.
 */

export interface ErrorResponse {
  statusCode: number;
  body: ApiErrorBody;
}

function respond(code: ApiErrorCode, details?: unknown, message?: string): ErrorResponse {
  const error = new AppError(code, message, { details });
  return { statusCode: error.statusCode, body: error.toBody() };
}

interface PrismaLikeError {
  name: string;
  code?: unknown;
  meta?: unknown;
}

function isPrismaError(error: unknown): error is PrismaLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string' &&
    error.name.startsWith('PrismaClient')
  );
}

const CONNECTION_ERROR_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  '57P01',
  '57P03',
]);

/** Walks `cause` chains looking for low-level connection failures (driver adapter errors). */
function isConnectionFailure(error: unknown, depth = 0): boolean {
  if (depth > 5 || typeof error !== 'object' || error === null) return false;
  const code = 'code' in error ? error.code : undefined;
  if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) return true;
  if ('name' in error && error.name === 'PrismaClientInitializationError') return true;
  if (typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)) return true;
  if ('cause' in error) {
    const { cause } = error as { cause?: unknown };
    if (isConnectionFailure(cause, depth + 1)) return true;
    if (typeof cause === 'object' && cause !== null && 'originalCode' in cause) {
      const original = (cause as { originalCode?: unknown }).originalCode;
      if (typeof original === 'string' && NETWORK_ERROR_CODES.has(original)) return true;
    }
  }
  return false;
}

function mapPrismaError(error: PrismaLikeError): ErrorResponse | null {
  if (error.name === 'PrismaClientInitializationError') return respond('SERVICE_UNAVAILABLE');
  if (error.name !== 'PrismaClientKnownRequestError' || typeof error.code !== 'string') return null;
  switch (error.code) {
    case 'P2002': // unique constraint
    case 'P2003': // foreign key constraint
    case 'P2034': // write conflict / deadlock
      return respond('CONFLICT');
    case 'P2001':
    case 'P2015':
    case 'P2018':
    case 'P2025': // record to update/delete not found
      return respond('NOT_FOUND');
    case 'P2000': // value too long for column
    case 'P2006':
    case 'P2007':
    case 'P2023': // inconsistent column data (e.g. malformed UUID)
      return respond('BAD_REQUEST');
    default:
      return CONNECTION_ERROR_CODES.has(error.code) ? respond('SERVICE_UNAVAILABLE') : null;
  }
}

function mapStatusCode(statusCode: number): ApiErrorCode {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 406:
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return statusCode >= 400 && statusCode < 500 ? 'BAD_REQUEST' : 'INTERNAL';
  }
}

/** Maps any thrown value to the public error response. */
export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof AppError) return { statusCode: error.statusCode, body: error.toBody() };

  if (error instanceof z.core.$ZodError) {
    return respond('VALIDATION', toValidationDetails(error));
  }

  if (isPrismaError(error)) {
    const mapped = mapPrismaError(error);
    if (mapped) return mapped;
  }

  if (isConnectionFailure(error)) return respond('SERVICE_UNAVAILABLE');

  if (typeof error === 'object' && error !== null) {
    const fastifyError = error as Partial<FastifyError>;
    // Fastify JSON-schema validation (routes may still use `schema`).
    if (Array.isArray(fastifyError.validation)) {
      const issues = fastifyError.validation.map((v) => ({
        path: (v.instancePath ?? '').split('/').filter(Boolean),
        message: 'Ungültiger Wert.',
      }));
      return respond('VALIDATION', toValidationDetails({ issues }));
    }
    const statusCode = fastifyError.statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600) {
      return respond(mapStatusCode(statusCode));
    }
  }

  return respond('INTERNAL');
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
  const { statusCode, body } = toErrorResponse(error);
  if (statusCode >= 500) {
    request.log.error({ err: error, code: body.error.code }, 'request failed');
  } else {
    request.log.info(
      { code: body.error.code, statusCode, err: error instanceof AppError ? undefined : error },
      'request rejected',
    );
  }
  void reply.status(statusCode).header('cache-control', 'no-store').send(body);
}

/** JSON 404 for unknown API routes (and everything else when no SPA is served). */
export function apiNotFound(_request: FastifyRequest, reply: FastifyReply): void {
  const { statusCode, body } = respond('NOT_FOUND');
  void reply.status(statusCode).header('cache-control', 'no-store').send(body);
}
