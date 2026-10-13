import fp from 'fastify-plugin';
import type { IncomingHttpHeaders } from 'node:http';
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '@homi/shared';
import type { AppConfig } from '../config';
import { classifyApiTarget } from '../lib/api-path';
import { AppError } from '../lib/http-errors';

/**
 * CSRF defence (§4.3) for every mutating `/api` request:
 *   1. header `X-Homi-Request: 1` is required (cannot be sent cross-site without CORS), and
 *   2. if an `Origin` header is present it must be the APP_URL origin
 *      (in development also the origin the request was addressed to, e.g. a LAN IP via Vite).
 * Missing/invalid → `403 CSRF`.
 *
 * "API request" is decided by `classifyApiTarget` (raw path, decoded path and matched route), so a
 * percent-encoded prefix such as `/%61pi/...` cannot skip the check. Such non-canonical spellings of
 * an API path are then rejected with `404` for every method (the session hook must never be skipped).
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_HEADER = CSRF_HEADER_NAME.toLowerCase();

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function hostOf(origin: string): string {
  return new URL(origin).host.toLowerCase();
}

/**
 * True if `origin` may issue state-changing requests / open sockets. Shared by the HTTP hook
 * and the Socket.IO `allowRequest` check.
 */
export function isAllowedOrigin(origin: string, config: AppConfig, headers: IncomingHttpHeaders): boolean {
  const normalized = originOf(origin);
  if (!normalized) return false;
  if (normalized === config.appUrl) return true;
  if (config.isProduction) return false;

  // Development: the browser talks to the Vite dev server (proxy) or directly to the API.
  const candidateHosts = [firstHeader(headers.host), firstHeader(headers['x-forwarded-host'])]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => (value.split(',')[0] ?? '').trim().toLowerCase());
  return candidateHosts.includes(hostOf(normalized));
}

export interface CsrfCheckInput {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  /** Pattern of the matched route (`request.routeOptions.url`), if any. */
  routeUrl?: string | undefined;
}

/** Pure check used by the hook (and unit tests). Returns `true` if the request may proceed. */
export function passesCsrfCheck(request: CsrfCheckInput, config: AppConfig): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  if (classifyApiTarget(request.url, request.routeUrl) === 'none') return true;

  if (firstHeader(request.headers[CSRF_HEADER]) !== CSRF_HEADER_VALUE) return false;
  if (firstHeader(request.headers['sec-fetch-site']) === 'cross-site') return false;

  const origin = firstHeader(request.headers.origin);
  if (origin !== undefined && !isAllowedOrigin(origin, config, request.headers)) return false;
  return true;
}

export const csrfPlugin = fp(
  async (app) => {
    app.addHook('onRequest', async (request) => {
      const routeUrl = request.routeOptions.url;
      const target = classifyApiTarget(request.url, routeUrl);
      if (target === 'none') return;
      const input = { method: request.method, url: request.url, headers: request.headers, routeUrl };
      if (!passesCsrfCheck(input, app.config)) {
        request.log.warn({ origin: request.headers.origin, method: request.method }, 'CSRF check failed');
        throw new AppError('CSRF');
      }
      if (target === 'non-canonical') {
        // e.g. `/%61pi/auth/logout`: the API is only served under its literal prefix.
        request.log.warn({ method: request.method, route: routeUrl }, 'non-canonical API path rejected');
        throw new AppError('NOT_FOUND');
      }
    });
  },
  { name: 'homi-csrf', fastify: '5.x' },
);
