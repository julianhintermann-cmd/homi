import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { apiNotFound } from './errors';

/**
 * Production SPA hosting (§2): serves `WEB_DIST_DIR` with
 *   - `public, max-age=31536000, immutable` for hashed build assets (`/assets/*`, `workbox-*.js`),
 *   - `no-cache` for `index.html`, `sw.js`, `registerSW.js` and `manifest.webmanifest`,
 *   - a short public cache for everything else (icons, robots.txt),
 * and falls back to `index.html` for client-side routes. `/api/*` and `/socket.io/*` are never
 * shadowed: unknown API paths get the JSON 404, and Socket.IO intercepts its path before Fastify.
 */

const NO_CACHE_FILES = new Set(['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']);
const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT_CACHE = 'public, max-age=3600';

/** Cache-Control for a file path relative to the dist root (posix separators). */
export function cacheControlFor(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const base = path.posix.basename(normalized);
  if (NO_CACHE_FILES.has(base) || base.endsWith('.html')) return 'no-cache';
  if (normalized.startsWith('assets/') || /^workbox-[\w-]+\.js$/.test(base)) return IMMUTABLE;
  return SHORT_CACHE;
}

function isReservedPath(url: string): boolean {
  return /^\/(api|socket\.io)(\/|\?|$)/.test(url);
}

/** True for paths that look like files (`/foo.png`); those get a real 404 instead of the SPA. */
function looksLikeFile(url: string): boolean {
  const pathname = url.split(/[?#]/, 1)[0] ?? '';
  return /\.[A-Za-z0-9]{1,8}$/.test(path.posix.basename(pathname));
}

export interface SpaOptions {
  root: string;
}

/**
 * Registers static serving on `app` and returns the not-found handler implementing the SPA
 * fallback. Returns `null` (and logs a warning) when the build directory does not exist.
 */
export async function registerSpa(
  app: FastifyInstance,
  options: SpaOptions,
): Promise<((request: FastifyRequest, reply: FastifyReply) => void) | null> {
  const root = path.resolve(options.root);
  const indexFile = path.join(root, 'index.html');
  if (!existsSync(indexFile)) {
    app.log.warn({ root }, 'WEB_DIST_DIR has no index.html – static SPA serving disabled');
    return null;
  }

  await app.register(fastifyStatic, {
    root,
    prefix: '/',
    wildcard: false,
    index: false,
    decorateReply: true,
    cacheControl: false,
    dotfiles: 'ignore',
    etag: true,
    lastModified: true,
    setHeaders(reply, filePath) {
      reply.header('cache-control', cacheControlFor(path.relative(root, filePath)));
      if (filePath.endsWith('sw.js')) reply.header('service-worker-allowed', '/');
    },
  });

  return function spaFallback(request, reply) {
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    if (!isRead || isReservedPath(request.url) || looksLikeFile(request.url)) {
      apiNotFound(request, reply);
      return;
    }
    void reply.header('cache-control', 'no-cache').type('text/html; charset=utf-8').sendFile('index.html');
  };
}
