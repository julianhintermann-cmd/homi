import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { BASE_URL } from './support/env';
import { seedWorld, type SeededWorld } from './support/seed';

/**
 * Regression suite for navigation that starts while another transition is still running (tab crossfade, push, pop).
 *
 * Bug (CI, WebKit on a slow Linux runner, e2e/two-users.spec.ts): tapping the "Chats" tab and immediately a
 * conversation row left the screen stuck – the chat list rendered twice (mid-crossfade), the tab bar showed Home and
 * Chats as active and the conversation never appeared. Cause: the exiting tab layer was re-rendered with the *new*
 * location (see routes/TabShell.tsx), so its inner `AnimatePresence` flipped to the Home tab and re-presented the
 * Home layer that was still fading out.
 *
 * The tests do not rely on a slow machine: a rAF sampler in the page records every frame, and the taps are
 * dispatched programmatically at chosen frame offsets, so the overlap with the animation is controlled. The
 * invariants hold for every single frame, not only for the final state:
 *   - the chat list is in the DOM at most once and the tab bar never marks two tabs (or a tab of another screen) active
 *   - at most two layers (the leaving and the entering screen) exist during a stack transition
 *   - after the transition exactly one layer is left and it is the screen of the URL.
 */

let world: SeededWorld;

test.beforeAll(() => {
  world = seedWorld();
});

interface Sample {
  path: string;
  /** Highest number of rendered rows for one and the same conversation (> 1: the chat list exists twice). */
  previews: number;
  stackLayers: number;
  tabPages: number;
  /** aria-current tab labels of every tab bar in the document. */
  active: string[][];
  conversationScreens: number;
}

declare global {
  interface Window {
    __race?: { samples: Sample[]; stop: () => void };
  }
}

async function signIn(context: BrowserContext): Promise<void> {
  await context.addCookies([{ name: 'homi_session', value: world.julian.sessionCookie, url: BASE_URL }]);
}

/** Starts recording one sample per animation frame (plus one per DOM mutation, so nothing slips between frames). */
async function startSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const samples: Sample[] = [];
    const maxRowsPerConversation = (): number => {
      const perHref = new Map<string, number>();
      for (const row of document.querySelectorAll('a.homi-conversation-row')) {
        const href = row.getAttribute('href') ?? '';
        perHref.set(href, (perHref.get(href) ?? 0) + 1);
      }
      return Math.max(0, ...perHref.values());
    };
    const take = (): void => {
      samples.push({
        path: location.pathname,
        previews: maxRowsPerConversation(),
        stackLayers: document.querySelectorAll('.app-stack__layer').length,
        tabPages: document.querySelectorAll('.tab-shell__page').length,
        active: [...document.querySelectorAll('nav[aria-label="Hauptnavigation"]')].map((nav) =>
          [...nav.querySelectorAll('a[aria-current="page"]')].map((a) => a.textContent?.trim() ?? ''),
        ),
        conversationScreens: document.querySelectorAll('main[aria-label^="Chat mit"]').length,
      });
    };
    let running = true;
    const frame = (): void => {
      if (!running) return;
      take();
      requestAnimationFrame(frame);
    };
    const observer = new MutationObserver(take);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    requestAnimationFrame(frame);
    window.__race = {
      samples,
      stop: () => {
        running = false;
        observer.disconnect();
      },
    };
  });
}

async function stopSampler(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    window.__race?.stop();
    return window.__race?.samples ?? [];
  });
}

const frames = (page: Page, count: number): Promise<void> =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const step = (left: number): void => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
        step(n);
      }),
    count,
  );

/** Programmatic tap (a real `click` event on the link, handled by React Router's `<Link>`). */
async function tapTab(page: Page, label: string): Promise<void> {
  await page.evaluate((name) => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Hauptnavigation"] a')]
      .reverse()
      .find((a) => a.textContent?.trim() === name);
    if (!link) throw new Error(`tab ${name} not found`);
    link.click();
  }, label);
}

/** Taps the first conversation row of the *entering* screen as soon as it exists. Resolves with its href. */
async function tapFirstRow(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const deadline = performance.now() + 8_000;
        const look = (): void => {
          const row = [...document.querySelectorAll<HTMLAnchorElement>('a.homi-conversation-row')].find(
            (a) => !a.closest('[data-exiting]'),
          );
          if (row) {
            const href = row.getAttribute('href') ?? '';
            row.click();
            resolve(href);
          } else if (performance.now() > deadline) reject(new Error('no conversation row to tap'));
          else requestAnimationFrame(look);
        };
        look();
      }),
  );
}

async function openHomeWithWarmChats(page: Page): Promise<void> {
  await page.goto('/chats');
  await expect(page.locator('a.homi-conversation-row').first()).toBeVisible();
  await tapTab(page, 'Home');
  await expect(page.getByRole('heading', { name: 'Dein Zuhause.' })).toBeVisible();
  await expect(page.locator('.tab-shell__page')).toHaveCount(1);
}

/**
 * Frame-by-frame invariants while a screen is only ever allowed to exist once. `expectedTabs` is the order in which
 * the tab bar may highlight tabs: in this order, every tab at most once, never going back (the bug showed Home, Chats, Home).
 */
function expectConsistent(samples: Sample[], expectedTabs: string[]): void {
  expect(samples.length, 'the sampler recorded frames').toBeGreaterThan(3);
  const highlighted: string[] = [];
  for (const sample of samples) {
    const where = JSON.stringify(sample);
    expect(sample.previews, `the chat list exists at most once: ${where}`).toBeLessThanOrEqual(1);
    expect(sample.stackLayers, `at most two stack layers: ${where}`).toBeLessThanOrEqual(2);
    expect(sample.active.length, `at most one tab bar per layer: ${where}`).toBeLessThanOrEqual(2);
    for (const active of sample.active) {
      expect(active.length, `at most one active tab: ${where}`).toBeLessThanOrEqual(1);
      for (const label of active) if (highlighted.at(-1) !== label) highlighted.push(label);
    }
  }
  // (a tab bar frame may be missed between two samples, but the order is never broken and no tab comes back)
  expect(expectedTabs.join(' > '), `tabs highlighted: ${highlighted.join(' > ')}`).toContain(highlighted.join(' > '));
  expect(highlighted.length, 'the tab bar highlighted a tab').toBeGreaterThan(0);
}

const FRAME_OFFSETS = [0, 1, 2, 4, 8, 14, 22];

test.describe('push during the tab crossfade', () => {
  for (const offset of FRAME_OFFSETS) {
    test(`Home → Chats, conversation tapped ${offset} frame(s) after the row appeared`, async ({ page, context }) => {
      await signIn(context);
      await openHomeWithWarmChats(page);
      await startSampler(page);

      await tapTab(page, 'Chats');
      const href = await tapFirstRow(page);
      await frames(page, offset);
      await expect(page).toHaveURL(new RegExp(`${href}$`));

      // the conversation screen is shown, alone, once the transitions are over
      await expect(page.getByRole('main', { name: /^Chat mit/ })).toBeVisible();
      await expect(page.locator('.app-stack__layer')).toHaveCount(1);
      await expect(page.locator('.tab-shell')).toHaveCount(0);
      await expect(page.locator('.homi-conversation-row__preview')).toHaveCount(0);

      const samples = await stopSampler(page);
      expectConsistent(samples, ['Home', 'Chats']);

      // and back: the list is there once, Chats is the active tab
      await page.getByRole('button', { name: 'Zurück' }).click();
      await expect(page).toHaveURL(/\/chats$/);
      await expect(page.locator('.tab-shell__page')).toHaveCount(1);
      await expect(page.locator('.app-stack__layer')).toHaveCount(1);
      await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toHaveCount(1);
      await expect(
        page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Chats' }),
      ).toHaveAttribute('aria-current', 'page');
    });
  }

  test('the same race on a throttled CPU (Chromium)', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools feature');
    await signIn(context);
    await openHomeWithWarmChats(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await startSampler(page);

    await tapTab(page, 'Chats');
    const href = await tapFirstRow(page);
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('main', { name: /^Chat mit/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.app-stack__layer')).toHaveCount(1, { timeout: 20_000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    expectConsistent(await stopSampler(page), ['Home', 'Chats']);
  });

  test('with reduced motion', async ({ page, context }) => {
    await signIn(context);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHomeWithWarmChats(page);
    await startSampler(page);

    await tapTab(page, 'Chats');
    const href = await tapFirstRow(page);
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('main', { name: /^Chat mit/ })).toBeVisible();
    await expect(page.locator('.app-stack__layer')).toHaveCount(1);

    expectConsistent(await stopSampler(page), ['Home', 'Chats']);
  });
});

test.describe('other overlapping transitions', () => {
  for (const offset of [0, 2, 6, 12]) {
    test(`pop ${offset} frame(s) after a push from the Chats tab`, async ({ page, context }) => {
      await signIn(context);
      await page.goto('/chats');
      await expect(page.locator('a.homi-conversation-row').first()).toBeVisible();
      await startSampler(page);

      await tapFirstRow(page);
      await frames(page, offset);
      await page.evaluate(() => window.history.back());
      await expect(page).toHaveURL(/\/chats$/);

      await expect(page.locator('.app-stack__layer')).toHaveCount(1);
      await expect(page.locator('.tab-shell__page')).toHaveCount(1);
      await expect(page.locator('.homi-conversation-row__preview').first()).toBeVisible();
      await expect(page.getByRole('main', { name: /^Chat mit/ })).toHaveCount(0);
      await expect(
        page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Chats' }),
      ).toHaveAttribute('aria-current', 'page');

      const samples = await stopSampler(page);
      expect(Math.max(...samples.map((sample) => sample.previews))).toBeLessThanOrEqual(1);
    });
  }

  test('three tab taps in a row leave exactly one page and the last tab active', async ({ page, context }) => {
    await signIn(context);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dein Zuhause.' })).toBeVisible();
    await startSampler(page);

    await tapTab(page, 'Chats');
    await frames(page, 2);
    await tapTab(page, 'Einkauf');
    await frames(page, 2);
    await tapTab(page, 'Inventar');

    await expect(page).toHaveURL(/\/inventar$/);
    await expect(page.locator('.tab-shell__page')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Inventar' }).first()).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Inventar' }),
    ).toHaveAttribute('aria-current', 'page');

    const samples = await stopSampler(page);
    for (const sample of samples) {
      expect(sample.active.every((active) => active.length <= 1)).toBe(true);
      expect(sample.tabPages, JSON.stringify(sample)).toBeLessThanOrEqual(4);
    }
  });
});
