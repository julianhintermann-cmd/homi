import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, SERVER_ROOT, loadConfig, trustProxyWarning, usesDevSessionSecret } from '../../src/config';

const base = { DATABASE_URL: 'postgresql://homi:homi@localhost:5432/homi' };
const strongSecret = 'x'.repeat(32);

function problemsOf(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
}

describe('loadConfig', () => {
  it('applies the documented defaults in development', () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({
      env: 'development',
      isProduction: false,
      port: 3000,
      host: '0.0.0.0',
      appUrl: 'http://localhost:5173',
      sessionTtlDays: 30,
      sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
      maxUploadMb: 15,
      maxUploadBytes: 15 * 1024 * 1024,
      trustProxy: false,
      smtp: null,
      logLevel: 'info',
    });
    expect(config.uploadDir).toBe(path.resolve('./uploads'));
    expect(config.webDistDir).toBe(path.resolve(SERVER_ROOT, '../web/dist'));
    expect(usesDevSessionSecret(config)).toBe(true);
  });

  it('requires DATABASE_URL to be a PostgreSQL URL', () => {
    expect(problemsOf({})).toEqual([expect.stringContaining('DATABASE_URL')]);
    expect(problemsOf({ DATABASE_URL: 'mysql://localhost/db' })).toEqual([expect.stringContaining('postgresql://')]);
  });

  it('requires a strong SESSION_SECRET and APP_URL in production', () => {
    const problems = problemsOf({ ...base, NODE_ENV: 'production', SESSION_SECRET: 'too-short' });
    expect(problems).toEqual([expect.stringContaining('SESSION_SECRET'), expect.stringContaining('APP_URL')]);
    expect(problemsOf({ ...base, NODE_ENV: 'production', APP_URL: 'https://homi.example.ch' })).toEqual([
      expect.stringContaining('SESSION_SECRET'),
    ]);

    const config = loadConfig({
      ...base,
      NODE_ENV: 'production',
      SESSION_SECRET: strongSecret,
      APP_URL: 'https://homi.example.ch/some/path/',
    });
    expect(config.isProduction).toBe(true);
    expect(config.appUrl).toBe('https://homi.example.ch');
    expect(config.sessionSecret).toBe(strongSecret);
    expect(usesDevSessionSecret(config)).toBe(false);
  });

  it('rejects non-http APP_URLs and invalid numbers', () => {
    expect(problemsOf({ ...base, APP_URL: 'javascript:alert(1)' })).toHaveLength(1);
    expect(problemsOf({ ...base, PORT: 'abc' })).toHaveLength(1);
    expect(problemsOf({ ...base, SESSION_TTL_DAYS: '0' })).toHaveLength(1);
    expect(problemsOf({ ...base, LOG_LEVEL: 'verbose' })).toHaveLength(1);
  });

  it('parses TRUST_PROXY as boolean or hop count', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadConfig({ ...base, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(loadConfig({ ...base, TRUST_PROXY: '2' }).trustProxy).toBe(2);
    expect(problemsOf({ ...base, TRUST_PROXY: 'maybe' })).toEqual([expect.stringContaining('TRUST_PROXY')]);
  });

  it('derives the Secure cookie flag and HSTS from APP_URL unless COOKIE_SECURE forces it', () => {
    expect(loadConfig({ ...base, APP_URL: 'http://192.168.1.20:3000' }).cookieSecure).toBe(false);
    expect(loadConfig({ ...base, APP_URL: 'https://homi.example.ch' }).cookieSecure).toBe(true);
    expect(loadConfig({ ...base, APP_URL: 'https://homi.example.ch' }).appUrlIsHttps).toBe(true);
    expect(loadConfig({ ...base, APP_URL: 'http://localhost:3000', COOKIE_SECURE: 'true' }).cookieSecure).toBe(true);
    expect(loadConfig({ ...base, APP_URL: 'https://homi.example.ch', COOKIE_SECURE: 'false' }).cookieSecure).toBe(
      false,
    );
    expect(problemsOf({ ...base, COOKIE_SECURE: 'yes' })).toEqual([expect.stringContaining('COOKIE_SECURE')]);
  });

  it('enables SMTP only with host and sender', () => {
    expect(loadConfig({ ...base, SMTP_FROM: 'Homi <a@b.ch>' }).smtp).toBeNull();
    expect(problemsOf({ ...base, SMTP_HOST: 'smtp.example.ch' })).toEqual([expect.stringContaining('SMTP_FROM')]);
    expect(
      loadConfig({ ...base, SMTP_HOST: 'smtp.example.ch', SMTP_FROM: 'Homi <a@b.ch>', SMTP_SECURE: 'true' }).smtp,
    ).toEqual({
      host: 'smtp.example.ch',
      port: 465,
      secure: true,
      user: undefined,
      pass: undefined,
      from: 'Homi <a@b.ch>',
    });
  });

  it('treats empty strings as unset', () => {
    const config = loadConfig({ ...base, SESSION_SECRET: '', APP_URL: '', SMTP_HOST: '', UPLOAD_DIR: '' });
    expect(config.appUrl).toBe('http://localhost:5173');
    expect(config.smtp).toBeNull();
    expect(usesDevSessionSecret(config)).toBe(true);
  });

  it('keeps registration open unless REGISTRATION_ENABLED=false', () => {
    expect(loadConfig(base).registrationEnabled).toBe(true);
    expect(loadConfig({ ...base, REGISTRATION_ENABLED: 'false' }).registrationEnabled).toBe(false);
    expect(loadConfig({ ...base, REGISTRATION_ENABLED: '0' }).registrationEnabled).toBe(false);
    expect(problemsOf({ ...base, REGISTRATION_ENABLED: 'nope' })).toEqual([
      expect.stringContaining('REGISTRATION_ENABLED'),
    ]);
  });

  it('warns about TRUST_PROXY=true in production only (security review: spoofable X-Forwarded-For)', () => {
    const prod = { ...base, NODE_ENV: 'production', APP_URL: 'https://homi.example.ch', SESSION_SECRET: strongSecret };
    expect(trustProxyWarning(loadConfig({ ...prod, TRUST_PROXY: 'true' }))).toMatch(/TRUST_PROXY=1/);
    expect(trustProxyWarning(loadConfig({ ...prod, TRUST_PROXY: '1' }))).toBeNull();
    expect(trustProxyWarning(loadConfig({ ...prod }))).toBeNull();
    expect(trustProxyWarning(loadConfig({ ...base, TRUST_PROXY: 'true' }))).toBeNull();
  });
});
