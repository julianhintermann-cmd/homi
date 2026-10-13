import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import pg from 'pg';
import {
  ARTIFACTS_DIR,
  E2E_DATABASE_URL,
  E2E_UPLOAD_DIR,
  REPO_ROOT,
  SERVER_ENTRY,
  WEB_DIST_INDEX,
  assertDisposableDatabase,
} from './support/env';

/**
 * Global setup: resets the disposable E2E database (drop + recreate the `public` schema), applies every
 * migration with `prisma migrate deploy` and wipes the upload directory.
 *
 * Note: Playwright starts the `webServer` before it runs the global setup. That is harmless here: the
 * server only connects lazily and runs no query at start-up (`/api/health` is `SELECT 1`), so the schema
 * is reset and migrated before the first test touches a table.
 */
export default async function globalSetup(): Promise<void> {
  if (!existsSync(SERVER_ENTRY) || !existsSync(WEB_DIST_INDEX)) {
    throw new Error(
      'The production build is missing (apps/server/dist/index.js or apps/web/dist/index.html).\n' +
        'Run `npm run db:generate && npm run build` before `npm run test:e2e`.',
    );
  }
  assertDisposableDatabase(E2E_DATABASE_URL);

  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }

  const serverDir = path.join(REPO_ROOT, 'apps/server');
  const prismaCli = createRequire(path.join(serverDir, 'package.json')).resolve('prisma/build/index.js');
  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: serverDir,
      env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `prisma migrate deploy failed:\n${output.stdout?.toString() ?? ''}\n${output.stderr?.toString() ?? ''}`,
      { cause: error },
    );
  }

  await rm(E2E_UPLOAD_DIR, { recursive: true, force: true });
  await mkdir(E2E_UPLOAD_DIR, { recursive: true });
  await mkdir(path.join(ARTIFACTS_DIR, 'visual'), { recursive: true });
}
