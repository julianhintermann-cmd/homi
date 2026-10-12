import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig, type AppConfig } from '../../src/config';

export const TEST_APP_URL = 'http://localhost:5173';
export const TEST_SESSION_SECRET = 'homi-test-session-secret-0123456789abcdef';

/** Config for tests: NODE_ENV=test, fixed secret, unique temp upload dir. No DB connection is made. */
export function createTestConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://homi:homi@localhost:5432/homi_test_unused',
    APP_URL: TEST_APP_URL,
    SESSION_SECRET: TEST_SESSION_SECRET,
    UPLOAD_DIR: path.join(os.tmpdir(), `homi-test-uploads-${randomUUID()}`),
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}
