import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

/**
 * Security headers (§4.6). The CSP is the exact policy of the architecture contract; helmet's
 * defaults are disabled so nothing else (e.g. `upgrade-insecure-requests`) sneaks in, which
 * would break plain-HTTP LAN testing on an iPhone.
 *
 * `connect-src` allows the own origin plus the WebSocket form of `APP_URL` only (`ws:`/`wss:` alone
 * would match any host and leave an exfiltration channel open should script injection ever land).
 */
export const CONTENT_SECURITY_POLICY_DIRECTIVES = {
  defaultSrc: ["'self'"],
  imgSrc: ["'self'", 'data:', 'blob:'],
  connectSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  fontSrc: ["'self'", 'data:'],
  scriptSrc: ["'self'"],
  workerSrc: ["'self'", 'blob:'],
  manifestSrc: ["'self'"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
} as const;

/** `http://host` → `ws://host`, `https://host` → `wss://host` (older WebKit does not map 'self' to ws). */
export function webSocketOrigin(appUrl: string): string {
  return appUrl.replace(/^http/, 'ws');
}

export const securityPlugin = fp(
  async (app) => {
    await app.register(helmet, {
      global: true,
      contentSecurityPolicy: {
        useDefaults: false,
        directives: Object.fromEntries(
          Object.entries(CONTENT_SECURITY_POLICY_DIRECTIVES).map(([key, values]) => [
            key,
            key === 'connectSrc' ? [...values, webSocketOrigin(app.config.appUrl)] : [...values],
          ]),
        ),
      },
      // HSTS only makes sense (and is only honoured) over HTTPS in production.
      strictTransportSecurity:
        app.config.isProduction && app.config.appUrlIsHttps ? { maxAge: 15_552_000, includeSubDomains: false } : false,
      crossOriginEmbedderPolicy: false,
      // Invitation / reset links carry tokens in the path – never leak them via Referer.
      referrerPolicy: { policy: 'no-referrer' },
    });
  },
  { name: 'homi-security', fastify: '5.x' },
);
