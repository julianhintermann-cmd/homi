import { defineConfig } from 'vitest/config';

/**
 * Two projects:
 *   unit        – test/unit, no database, runs in parallel   (`npm test -w @homi/server`)
 *   integration – test/integration against a real PostgreSQL (`DATABASE_URL_TEST`);
 *                 migrations are applied once in globalSetup, every file starts with
 *                 truncated tables, files run sequentially   (`npm run test:integration -w @homi/server`)
 */
export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/integration/global-setup.ts'],
          setupFiles: ['test/integration/setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
