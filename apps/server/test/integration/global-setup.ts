import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import type { TestProject } from 'vitest/node';

/**
 * Integration global setup: resolves DATABASE_URL_TEST (env or repo `.env`), refuses to touch a
 * database whose name does not contain "test", and applies all migrations with
 * `prisma migrate deploy`.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrlTest: string;
  }
}

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default function setup(project: TestProject): void {
  loadDotenv({ path: [path.join(serverDir, '.env'), path.join(serverDir, '../../.env')], quiet: true });

  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Start the dev database (docker compose -f docker-compose.dev.yml up -d) and set ' +
        'DATABASE_URL_TEST=postgresql://homi:homi@localhost:5432/homi_test in .env or the environment.',
    );
  }
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Refusing to run integration tests against "${databaseName}": the database name must contain "test".`,
    );
  }

  const require = createRequire(import.meta.url);
  const prismaCli = path.join(path.dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });

  project.provide('databaseUrlTest', url);
}
