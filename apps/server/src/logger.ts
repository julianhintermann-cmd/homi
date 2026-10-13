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

/**
 * A `/` – literal, or percent-encoded once or more (`%2F`, `%252F`, …): the web app's sign-in pages
 * carry the target path in `?redirect=` and encode it (`/registrieren?redirect=%2Feinladung%2F<token>`).
 */
const URL_SLASH = String.raw`(?:\/|%(?:25)*2F)`;
const TOKEN_SEGMENT = new RegExp(
  String.raw`(${URL_SLASH}(?:api${URL_SLASH}invitations|einladung|passwort-zuruecksetzen)${URL_SLASH})[^/?#&]+`,
  'gi',
);

/**
 * Replaces token path segments (`/api/invitations/<token>`, `/einladung/<token>`, …) in URLs –
 * also inside (percent-encoded) query values such as `?redirect=`; matching ignores case like the
 * SPA router does.
 */
export function sanitizeUrl(url: string): string {
  const redact = (value: string): string =>
    value.replace(TOKEN_SEGMENT, (_match, prefix: string) => `${prefix}[redacted]`);
  const redacted = redact(url);
  // Other percent-encoded spellings (`/%61pi/invitations/<token>` – rejected by the CSRF hook, but
  // still logged): if the decoded URL reveals a token segment, log the decoded, redacted form.
  let decoded: string;
  try {
    decoded = decodeURIComponent(redacted);
  } catch {
    return redacted;
  }
  const decodedRedacted = redact(decoded);
  return decodedRedacted === decoded ? redacted : decodedRedacted;
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
