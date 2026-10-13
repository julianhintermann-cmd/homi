import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Environment configuration (docs/ARCHITECTURE.md §2), validated once at start-up.
 */

/** apps/server – two levels up from both `src/config.ts` and the bundled `dist/index.js`. */
export const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url));

const DEV_SESSION_SECRET = 'homi-dev-insecure-session-secret-change-me-0000';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value.length === 0 ? undefined : value));

const booleanString = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no', ''])
    .optional()
    .transform((value) => (value === undefined || value === '' ? defaultValue : ['true', '1', 'yes'].includes(value)));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  APP_URL: optionalString.pipe(z.url({ protocol: /^https?$/ }).optional()),
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is required' })
    .trim()
    .regex(/^postgres(ql)?:\/\//, { error: 'DATABASE_URL must be a postgresql:// URL' }),
  SESSION_SECRET: optionalString,
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  UPLOAD_DIR: optionalString,
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(15),
  TRUST_PROXY: z
    .string()
    .trim()
    .optional()
    .transform((value, ctx): boolean | number => {
      if (value === undefined || value === '' || value === 'false' || value === '0') return false;
      if (value === 'true') return true;
      if (/^\d{1,2}$/.test(value)) return Number(value);
      ctx.addIssue({ code: 'custom', message: 'TRUST_PROXY must be true, false or a hop count' });
      return z.NEVER;
    }),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalString,
  SMTP_SECURE: booleanString(false),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  WEB_DIST_DIR: optionalString,
  /** `auto` (default): Secure cookies only when APP_URL uses https://. `true`/`false` force it. */
  COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  /** `false` closes public sign-up (private instances: create the accounts first, then switch it off). */
  REGISTRATION_ENABLED: booleanString(true),
});

export type NodeEnv = 'development' | 'production' | 'test';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  pass: string | undefined;
  from: string;
}

export interface AppConfig {
  env: NodeEnv;
  isProduction: boolean;
  /** Whether the session cookie carries the Secure flag (see COOKIE_SECURE). */
  cookieSecure: boolean;
  /** True when APP_URL is an https:// origin (enables HSTS). */
  appUrlIsHttps: boolean;
  port: number;
  host: string;
  /** Public origin without trailing slash, e.g. `https://homi.example.ch`. */
  appUrl: string;
  databaseUrl: string;
  sessionSecret: string;
  sessionTtlDays: number;
  sessionTtlMs: number;
  /** Absolute path. */
  uploadDir: string;
  maxUploadMb: number;
  maxUploadBytes: number;
  trustProxy: boolean | number;
  /** POST /auth/register accepts new accounts (REGISTRATION_ENABLED, default true). */
  registrationEnabled: boolean;
  smtp: SmtpConfig | null;
  logLevel: LogLevel;
  /** Absolute path of the built SPA. */
  webDistDir: string;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Parses and validates the environment. Throws {@link ConfigError} listing every problem.
 * Production requires `APP_URL` and a `SESSION_SECRET` of at least 32 characters.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`));
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const problems: string[] = [];

  if (isProduction) {
    if (!e.SESSION_SECRET || e.SESSION_SECRET.length < 32) {
      problems.push('SESSION_SECRET: required in production and must be at least 32 characters long');
    }
    if (!e.APP_URL) problems.push('APP_URL: required in production (public origin, e.g. https://homi.example.ch)');
  } else if (e.SESSION_SECRET && e.SESSION_SECRET.length < 16) {
    problems.push('SESSION_SECRET: must be at least 16 characters long');
  }

  const smtpHost = e.SMTP_HOST;
  if (smtpHost && !e.SMTP_FROM) problems.push('SMTP_FROM: required when SMTP_HOST is set');
  if (problems.length > 0) throw new ConfigError(problems);

  const appUrl = new URL(e.APP_URL ?? 'http://localhost:5173').origin;
  const uploadDir = path.resolve(e.UPLOAD_DIR ?? './uploads');
  const webDistDir = e.WEB_DIST_DIR ? path.resolve(e.WEB_DIST_DIR) : path.resolve(SERVER_ROOT, '../web/dist');

  return {
    env: e.NODE_ENV,
    isProduction,
    cookieSecure: e.COOKIE_SECURE === 'auto' ? appUrl.startsWith('https://') : e.COOKIE_SECURE === 'true',
    appUrlIsHttps: appUrl.startsWith('https://'),
    port: e.PORT,
    host: e.HOST,
    appUrl,
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET ?? DEV_SESSION_SECRET,
    sessionTtlDays: e.SESSION_TTL_DAYS,
    sessionTtlMs: e.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    uploadDir,
    maxUploadMb: e.MAX_UPLOAD_MB,
    maxUploadBytes: e.MAX_UPLOAD_MB * 1024 * 1024,
    trustProxy: e.TRUST_PROXY,
    registrationEnabled: e.REGISTRATION_ENABLED,
    smtp:
      smtpHost && e.SMTP_FROM
        ? {
            host: smtpHost,
            port: e.SMTP_PORT ?? (e.SMTP_SECURE ? 465 : 587),
            secure: e.SMTP_SECURE,
            user: e.SMTP_USER,
            pass: e.SMTP_PASS,
            from: e.SMTP_FROM,
          }
        : null,
    logLevel: e.LOG_LEVEL,
    webDistDir,
  };
}

/**
 * Start-up warning for `TRUST_PROXY=true` in production: it trusts the left-most, client-written
 * `X-Forwarded-For` entry, so every client could pick its own IP and skip the per-IP rate limits –
 * unless the proxy overwrites the header. A hop count (`TRUST_PROXY=1`) is safe with any proxy.
 */
export function trustProxyWarning(config: AppConfig): string | null {
  if (!config.isProduction || config.trustProxy !== true) return null;
  return (
    'TRUST_PROXY=true trusts any client-supplied X-Forwarded-For address (per-IP rate limits can be bypassed) ' +
    'unless the reverse proxy overwrites that header – use TRUST_PROXY=1 (one proxy hop) instead'
  );
}

/** True when the development fallback secret is in use (logged as a warning at start-up). */
export function usesDevSessionSecret(config: AppConfig): boolean {
  return config.sessionSecret === DEV_SESSION_SECRET;
}
