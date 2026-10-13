import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { ApiClient, randomClientIp, uniqueEmail } from './api';
import { BASE_URL, TEST_PASSWORD } from './env';

/** One simulated person with an isolated browser context (own cookies, own client IP) and a page. */
export interface Person {
  displayName: string;
  email: string;
  password: string;
  ip: string;
  context: BrowserContext;
  page: Page;
  /** Shares the cookie jar of the browser context. */
  api: ApiClient;
}

interface Fixtures {
  /** Creates another person with the same device emulation as the project (393×852, touch, …). */
  newPerson: (displayName: string) => Promise<Person>;
}

/**
 * Extends the base test with `newPerson`: independent browser contexts against the real backend. Console errors
 * and failed (5xx) responses are collected per person and asserted at the end of the test. Playwright records a
 * trace for every context created through the `browser` fixture (`trace: 'retain-on-failure'`).
 */
export const test = base.extend<Fixtures>({
  newPerson: async (
    { browser, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, locale, timezoneId },
    use,
    testInfo,
  ) => {
    const people: Person[] = [];
    const problems: string[] = [];

    await use(async (displayName) => {
      const ip = randomClientIp();
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport,
        deviceScaleFactor,
        isMobile,
        hasTouch,
        userAgent,
        locale,
        timezoneId,
        serviceWorkers: 'block',
        extraHTTPHeaders: { 'X-Forwarded-For': ip },
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => problems.push(`${displayName}: pageerror ${error.message}`));
      page.on('response', (response) => {
        if (response.status() >= 500) problems.push(`${displayName}: ${response.status()} ${response.url()}`);
      });
      page.on('console', (message) => {
        // A 401 on the first /api/auth/me of a signed-out visitor is expected; anything else is a problem.
        if (message.type() === 'error' && !/status of 401/.test(message.text())) {
          problems.push(`${displayName}: console.error ${message.text()}`);
        }
      });
      const person: Person = {
        displayName,
        email: uniqueEmail(displayName),
        password: TEST_PASSWORD,
        ip,
        context,
        page,
        api: new ApiClient(context.request),
      };
      people.push(person);
      return person;
    });

    const failed = testInfo.status !== testInfo.expectedStatus;
    for (const [index, person] of people.entries()) {
      if (failed) {
        await person.page
          .screenshot({ path: testInfo.outputPath(`${person.displayName}-${index}.png`) })
          .catch(() => undefined);
      }
      await person.context.close().catch(() => undefined);
    }
    if (!failed) expect(problems, 'no console errors / 5xx responses during the test').toEqual([]);
  },
});

export { expect };

// ── UI helpers shared by the specs ────────────────────────────────────────────

export async function registerViaUi(
  page: Page,
  person: Pick<Person, 'displayName' | 'email' | 'password'>,
): Promise<void> {
  await page.getByLabel('Anzeigename').fill(person.displayName);
  await page.getByLabel('E-Mail').fill(person.email);
  await page.getByLabel('Passwort', { exact: true }).fill(person.password);
  await page.getByRole('button', { name: 'Registrieren' }).click();
}

export const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Hauptnavigation' });

export async function goToTab(page: Page, tab: 'Home' | 'Inventar' | 'Einkauf' | 'Chats'): Promise<void> {
  await mainNav(page).getByRole('link', { name: tab }).click();
  const target = { Home: '/', Inventar: '/inventar', Einkauf: '/einkauf', Chats: '/chats' }[tab];
  await page.waitForURL((url) => url.pathname === target);
}
