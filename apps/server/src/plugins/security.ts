import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

/**
 * Security headers (§4.6). The CSP is the exact policy of the architecture contract; helmet's
 * defaults are disabled so nothing else (e.g. `upgrade-insecure-requests`) sneaks in, which
 * would break plain-HTTP LAN testing on an iPhone.
 */
export const CONTENT_SECURITY_POLICY_DIRECTIVES = {
  defaultSrc: ["'self'"],
  imgSrc: ["'self'", 'data:', 'blob:'],
  connectSrc: ["'self'", 'ws:', 'wss:'],
  styleSrc: ["'self'", "'unsafe-inline'"],
  fontSrc: ["'self'", 'data:'],
  scriptSrc: ["'self'"],
  workerSrc: ["'self'", 'blob:'],
  manifestSrc: ["'self'"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
} as const;

export const securityPlugin = fp(
  async (app) => {
    await app.register(helmet, {
      global: true,
      contentSecurityPolicy: {
        useDefaults: false,
        directives: Object.fromEntries(
          Object.entries(CONTENT_SECURITY_POLICY_DIRECTIVES).map(([key, values]) => [key, [...values]]),
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
