import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from './config';

interface LoggedRequest {
  method?: string | undefined;
  url?: string | undefined;
  host?: string | undefined;
  ip?: string | undefined;
  socket?: { remoteAddress?: string | undefined; remotePort?: number | undefined } | undefined;
}

/**
 * pino options for Fastify (§4.6): secrets are redacted, invitation tokens are stripped from
 * logged URLs, and pino-pretty is used only in development.
 */

const SECRET_KEYS = [
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'tokenHash',
  'rawToken',
  'sessionToken',
  'sessionSecret',
  'pass',
  'secret',
];

export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'headers.cookie',
  'headers.authorization',
  ...SECRET_KEYS,
  ...SECRET_KEYS.map((key) => `*.${key}`),
  ...SECRET_KEYS.map((key) => `*.*.${key}`),
];

/** Replaces token path segments (`/api/invitations/<token>`, `/einladung/<token>`, …) in URLs. */
export function sanitizeUrl(url: string): string {
  return url.replace(
    /(\/(?:api\/invitations|einladung|passwort-zuruecksetzen)\/)[^/?#]+/g,
    (_match, prefix: string) => `${prefix}[redacted]`,
  );
}

export function buildLoggerOptions(config: AppConfig): NonNullable<FastifyServerOptions['logger']> {
  return {
    level: config.logLevel,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    serializers: {
      // At runtime Fastify passes its request object (with `ip`/`host`); typed structurally.
      req(request: LoggedRequest) {
        return {
          method: request.method,
          url: request.url === undefined ? undefined : sanitizeUrl(request.url),
          host: request.host,
          remoteAddress: request.ip ?? request.socket?.remoteAddress,
          remotePort: request.socket?.remotePort,
        };
      },
    },
    ...(config.env === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname', singleLine: true },
          },
        }
      : {}),
  };
}
