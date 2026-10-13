import { defineConfig, devices } from '@playwright/test';
import {
  BASE_URL,
  E2E_DATABASE_URL,
  E2E_PORT,
  E2E_SESSION_SECRET,
  E2E_UPLOAD_DIR,
  REPO_ROOT,
  SERVER_ENTRY,
} from './e2e/support/env';

/**
 * Homi end-to-end + visual regression suite.
 *
 * - The system under test is the PRODUCTION build (`node apps/server/dist/index.js`, serves API, Socket.IO and the
 *   built SPA on one origin). Run `npm run db:generate && npm run build` first.
 * - Database: the disposable `E2E_DATABASE_URL` (default postgresql://homi:homi@localhost:5432/homi_e2e); the global
 *   setup drops/recreates its schema and runs `prisma migrate deploy`.
 * - `TRUST_PROXY=true` lets every simulated person send its own `X-Forwarded-For`, so the per-IP rate limits
 *   (register 5/min, login 10/min) never couple independent tests. The limits themselves stay active.
 * - Projects: `chromium-iphone` and `webkit-iphone` (393×852 @3×, touch) run the functional specs, `visual`
 *   (Chromium) and `visual-webkit` (393×852 @1×) compare screenshots with design/reference.
 */

const isCI = !!process.env.CI;

const IPHONE_VIEWPORT = { width: 393, height: 852 } as const;

/** Visual specs compare at 1× and with a fixed locale/time zone so text and greetings are reproducible. */
const visualUse = {
  viewport: IPHONE_VIEWPORT,
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
  locale: 'de-CH',
  timezoneId: 'Europe/Zurich',
  colorScheme: 'light',
  reducedMotion: 'reduce',
} as const;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'de-CH',
    timezoneId: 'Europe/Zurich',
    // The service worker caches the app shell; it is blocked everywhere except in the PWA test.
    serviceWorkers: 'block',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium-iphone',
      testMatch: ['two-users.spec.ts', 'tenant-isolation.spec.ts', 'iphone.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        viewport: IPHONE_VIEWPORT,
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'webkit-iphone',
      testMatch: ['two-users.spec.ts', 'iphone.spec.ts'],
      use: {
        ...devices['iPhone 15 Pro'],
        // The design frame is the full-screen PWA (no Safari chrome): 393×852.
        viewport: IPHONE_VIEWPORT,
      },
    },
    {
      name: 'visual',
      testMatch: ['visual.spec.ts'],
      use: { ...devices['Desktop Chrome'], browserName: 'chromium', ...visualUse },
    },
    // WebKit's rendering on a Linux runner differs from the references more than the budgets allow (they are
    // calibrated on the machine that produced them), so it is opt-in on CI: E2E_VISUAL_WEBKIT=1.
    ...(!isCI || process.env.E2E_VISUAL_WEBKIT
      ? [
          {
            name: 'visual-webkit',
            testMatch: ['visual.spec.ts'],
            use: { ...devices['Desktop Safari'], browserName: 'webkit' as const, ...visualUse },
          },
        ]
      : []),
  ],
  webServer: {
    command: `node "${SERVER_ENTRY}"`,
    cwd: REPO_ROOT,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 60_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    // the server logs expected warnings (CSRF rejections of the isolation tests); E2E_SERVER_LOGS=1 shows them
    stdout: process.env.E2E_SERVER_LOGS ? 'pipe' : 'ignore',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'production',
      PORT: String(E2E_PORT),
      HOST: '127.0.0.1',
      APP_URL: BASE_URL,
      DATABASE_URL: E2E_DATABASE_URL,
      SESSION_SECRET: E2E_SESSION_SECRET,
      UPLOAD_DIR: E2E_UPLOAD_DIR,
      COOKIE_SECURE: 'auto',
      LOG_LEVEL: 'warn',
      TRUST_PROXY: 'true',
    },
  },
});
