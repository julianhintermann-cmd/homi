import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ApiClient, registerApiPerson } from './support/api';
import { BASE_URL } from './support/env';
import { seedWorld, type SeededWorld } from './support/seed';

/**
 * iPhone-first behaviour of the production build (Chromium mobile emulation and WebKit, 393×852 @3×, touch):
 * layout on the real routes with real data (incl. very long unbroken texts), tab bar + swipe, bottom sheet, input
 * sizes (iOS zooms into fields below 16 px), the keyboard, reduced motion and the PWA plumbing.
 */

let world: SeededWorld;
let longItemId = '';
let invitationPath = '';
const LONG_WORD = 'Superlangerartikelnamederkeinenumbruchhatundtrotzdemhineinpasstbitte'; // 64 chars, no spaces
const LONG_URL = 'https://beispiel.example/ein/sehr/langer/pfad/ohne/leerzeichen/der/nicht/umbrechen/kann/abc123def456';

test.beforeAll(async ({ playwright }) => {
  world = seedWorld();
  // Stress data: unbreakable long texts in the inventory, the shopping list and the chat.
  const request = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { cookie: `homi_session=${world.julian.sessionCookie}` },
  });
  const api = new ApiClient(request);
  const item = await api.post(`/api/households/${world.householdId}/items`, {
    name: LONG_WORD,
    category: 'SONSTIGES',
    quantity: '12345.5',
    unit: 'MILLILITER',
    unitPrice: '99999.99',
    imageId: null,
  });
  expect(item.status).toBe(201);
  longItemId = item.body.id;
  expect((await api.post(`/api/households/${world.householdId}/shopping/items`, { name: LONG_WORD })).status).toBe(201);
  // the longest possible detail ("99’999.999 Packungen · CHF 99’999.99 / Pkg.") next to a short name
  expect(
    (
      await api.post(`/api/households/${world.householdId}/shopping/items`, {
        name: 'Grosseinkauf Wasser',
        quantity: '99999.999',
        unit: 'PACKUNG',
        unitPrice: '99999.99',
      })
    ).status,
  ).toBe(201);
  // 18 messages, alternating between Julian and Max (each stays below the 20 messages / 10 s send limit), so the
  // conversation with Max overflows the screen
  const maxRequest = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { cookie: `homi_session=${world.max.sessionCookie}` },
  });
  const maxApi = new ApiClient(maxRequest);
  for (let index = 1; index <= 18; index += 1) {
    const sent = await (index % 2 === 0 ? maxApi : api).post(
      `/api/households/${world.householdId}/conversations/${world.conversations.max}/messages`,
      {
        clientId: randomUUID(),
        content:
          index === 18
            ? 'Letzte Nachricht ganz unten'
            : index === 17
              ? LONG_URL
              : `Nachricht Nummer ${index} im Verlauf`,
      },
    );
    expect(sent.status).toBe(201);
  }
  const invitation = await api.post(`/api/households/${world.householdId}/invitations`, { role: 'MEMBER' });
  expect(invitation.status).toBe(201);
  invitationPath = new URL(invitation.body.url).pathname;
  await request.dispose();
  await maxRequest.dispose();
});

async function signIn(context: BrowserContext, cookie = world.julian.sessionCookie): Promise<void> {
  await context.addCookies([{ name: 'homi_session', value: cookie, url: BASE_URL }]);
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          [...document.images]
            .filter((image) => image.loading !== 'lazy' || image.getBoundingClientRect().top < window.innerHeight)
            .every((image) => image.complete),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await page.waitForTimeout(350);
}

interface Overflow {
  scrollWidth: number;
  innerWidth: number;
  /** Visible elements that stick out of the viewport (outside deliberately scrollable / swipeable areas). */
  offenders: string[];
}

async function measureOverflow(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const scrolling = document.scrollingElement ?? document.documentElement;
    const offenders: string[] = [];
    const insideScroller = (element: Element): boolean => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const { overflowX } = getComputedStyle(node);
        if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth) return true;
        if (node.hasAttribute('data-no-swipe') || node.getAttribute('aria-hidden') === 'true') return true;
        // clipped by an ancestor that itself fits (e.g. the progress bar fill inside its track)
        if (node !== element && (overflowX === 'hidden' || overflowX === 'clip')) {
          const box = node.getBoundingClientRect();
          if (box.left >= -0.5 && box.right <= window.innerWidth + 0.5) return true;
        }
      }
      return false;
    };
    for (const element of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if ((rect.right > window.innerWidth + 0.5 || rect.left < -0.5) && !insideScroller(element)) {
        offenders.push(
          `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} [${Math.round(rect.left)}..${Math.round(rect.right)}] "${(element.textContent ?? '').trim().slice(0, 30)}"`,
        );
      }
    }
    return { scrollWidth: scrolling.scrollWidth, innerWidth: window.innerWidth, offenders: offenders.slice(0, 8) };
  });
}

async function collectOverflowFailures(page: Page, label: string, route: string, failures: string[]): Promise<void> {
  await page.goto(route);
  await expect(page.locator('main, [role="dialog"], h1').first()).toBeVisible();
  await settle(page);
  const overflow = await measureOverflow(page);
  if (overflow.scrollWidth > overflow.innerWidth) {
    failures.push(`${label} (${route}): scrollWidth ${overflow.scrollWidth} > innerWidth ${overflow.innerWidth}`);
  }
  if (overflow.offenders.length > 0) {
    failures.push(`${label} (${route}): elements outside the viewport: ${overflow.offenders.join(' | ')}`);
  }
}

// ── layout ─────────────────────────────────────────────────────────────────────

test.describe('no horizontal overflow', () => {
  const sizes = [
    { width: 393, height: 852 },
    { width: 320, height: 568 },
  ];

  const signedInRoutes = (): Array<[string, string]> => [
    ['Home', '/'],
    ['Inventar', '/inventar'],
    ['Einkauf', '/einkauf'],
    ['Chats', '/chats'],
    ['Chat Haushalt', `/chats/${world.conversations.group}`],
    ['Chat Lisa', `/chats/${world.conversations.lisa}`],
    ['Chat Max (lange Texte)', `/chats/${world.conversations.max}`],
    ['Artikel-Details', `/inventar/${world.itemIds['Nespresso Kapseln']}`],
    ['Artikel-Details (langer Name)', `/inventar/${longItemId}`],
    ['Neuer Artikel (Sheet)', '/inventar/neu'],
    ['Artikel bearbeiten (Sheet)', `/inventar/${world.itemIds['Olivenöl']}/bearbeiten`],
    ['Haushalt', '/haushalt'],
    ['Mitglied', `/haushalt/mitglieder/${world.lisa.id}`],
    ['Profil', '/profil'],
    ['Einstellungen', '/einstellungen'],
  ];

  for (const size of sizes) {
    test(`signed-in screens fit ${size.width} px`, async ({ page, context }) => {
      await signIn(context);
      await page.setViewportSize(size);
      const failures: string[] = [];
      for (const [label, route] of signedInRoutes()) await collectOverflowFailures(page, label, route, failures);
      expect(failures, failures.join('\n')).toEqual([]);
    });

    test(`public screens fit ${size.width} px`, async ({ page, context, playwright }) => {
      await page.setViewportSize(size);
      const failures: string[] = [];
      const publicRoutes: Array<[string, string]> = [
        ['Login', '/login'],
        ['Registrieren', '/registrieren'],
        ['Passwort vergessen', '/passwort-vergessen'],
        ['Passwort zurücksetzen (ungültig)', '/passwort-zuruecksetzen/ungueltiges-token'],
        ['Einladung', invitationPath],
        ['404', '/gibt-es-nicht'],
      ];
      for (const [label, route] of publicRoutes) await collectOverflowFailures(page, label, route, failures);

      // "Willkommen": a signed-in person without a household
      const newcomer = await registerApiPerson(playwright, 'Neu');
      await context.clearCookies();
      await signIn(context, newcomer.sessionCookie);
      await collectOverflowFailures(page, 'Willkommen', '/willkommen', failures);
      await newcomer.dispose();
      expect(failures, failures.join('\n')).toEqual([]);
    });
  }
});

// Regression (FEATURE_STATUS open issue): on a 320 px phone a long detail squeezed every name to ~3 characters.
test('shopping rows keep the name readable next to a long detail at 320 px', async ({ page, context }) => {
  await signIn(context);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/einkauf');
  const row = page.locator('.homi-shopping-row').filter({ hasText: 'Grosseinkauf' });
  await expect(row).toBeVisible();
  const layout = await row.evaluate((element) => {
    const name = element.querySelector<HTMLElement>('.homi-shopping-row__name')!;
    const detail = element.querySelector<HTMLElement>('.homi-shopping-row__quantity')!;
    const rowBox = element.getBoundingClientRect();
    return {
      nameWidth: name.getBoundingClientRect().width,
      nameFontSize: parseFloat(getComputedStyle(name).fontSize),
      detailRight: detail.getBoundingClientRect().right,
      detailCut: detail.scrollWidth > detail.clientWidth,
      rowRight: rowBox.right,
    };
  });
  // at least ~5 characters of the name stay visible; the detail is cut (ellipsis) inside the row instead
  expect(layout.nameWidth).toBeGreaterThanOrEqual(layout.nameFontSize * 5 - 1);
  expect(layout.detailCut).toBe(true);
  expect(layout.detailRight).toBeLessThanOrEqual(layout.rowRight);
});

// ── navigation ─────────────────────────────────────────────────────────────────

/** A one-finger horizontal swipe: real touch input through CDP on Chromium, pointer events (touch) elsewhere. */
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const steps = 8;
  if (page.context().browser()?.browserType().name() === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    await touch('touchStart', from.x, from.y);
    for (let step = 1; step <= steps; step += 1) {
      await touch('touchMove', from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
    }
    await touch('touchEnd', to.x, to.y);
    await cdp.detach();
    return;
  }
  // WebKit has no CDP: dispatch the same sequence of touch pointer events the app listens to.
  await page.evaluate(
    async ({ from, to, steps }) => {
      const target = document.elementFromPoint(from.x, from.y) ?? document.body;
      const fire = (type: string, x: number, y: number) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        );
      fire('pointerdown', from.x, from.y);
      for (let step = 1; step <= steps; step += 1) {
        fire('pointermove', from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      fire('pointerup', to.x, to.y);
    },
    { from, to, steps },
  );
}

test('tab bar navigation and swipe between the tabs (touch)', async ({ page, context }) => {
  await signIn(context);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  const tabs = [
    { name: 'Home', path: '/' },
    { name: 'Inventar', path: '/inventar' },
    { name: 'Einkauf', path: '/einkauf' },
    { name: 'Chats', path: '/chats' },
  ] as const;
  const here = () => new URL(page.url()).pathname;
  const expectTab = async (index: number) => {
    await expect.poll(here).toBe(tabs[index]!.path);
    await expect(nav.getByRole('link', { name: tabs[index]!.name })).toHaveAttribute('aria-current', 'page');
  };
  // taps (real touch taps) through the tab bar
  await expect(page.getByRole('heading', { name: 'Dein Zuhause.' })).toBeVisible();
  for (const index of [1, 2, 3, 0]) {
    await nav.getByRole('link', { name: tabs[index]!.name }).tap();
    await expectTab(index);
  }

  const swipeFromTitle = async (direction: 'left' | 'right', startX = 196): Promise<void> => {
    const title = await page.locator('main h1').first().boundingBox();
    expect(title, 'screen title is on screen').not.toBeNull();
    const y = Math.round(title!.y + title!.height / 2);
    await swipe(page, { x: startX, y }, { x: direction === 'left' ? startX - 160 : startX + 160, y: y + 6 });
  };

  // swipe left → next tab, three times; a fourth swipe does not wrap around
  for (const index of [1, 2, 3]) {
    await swipeFromTitle('left');
    await expectTab(index);
  }
  await swipeFromTitle('left');
  await page.waitForTimeout(500);
  await expectTab(3);
  // swipe right → previous tab, back to Home
  for (const index of [2, 1, 0]) {
    await swipeFromTitle('right');
    await expectTab(index);
  }
  // starting at the very edge is left to Safari's own back gesture
  await swipeFromTitle('left', 8);
  await page.waitForTimeout(500);
  await expectTab(0);
  // a horizontally scrollable area (category chips) must not trigger a tab swipe
  await nav.getByRole('link', { name: 'Inventar' }).click();
  await expectTab(1);
  const chips = await page.getByRole('group', { name: 'Kategorie' }).boundingBox();
  expect(chips).not.toBeNull();
  const chipY = Math.round(chips!.y + chips!.height / 2);
  await swipe(page, { x: 250, y: chipY }, { x: 90, y: chipY });
  await page.waitForTimeout(500);
  await expectTab(1);
});

test('the add-item sheet opens and closes with Escape and by dragging it down', async ({ page, context }) => {
  await signIn(context);
  await page.goto('/inventar');
  await expect(page.getByRole('link', { name: /^Nespresso Kapseln/ })).toBeVisible();
  const sheet = page.getByRole('dialog', { name: 'Artikel hinzufügen' });

  await page.getByRole('button', { name: 'Artikel hinzufügen' }).first().tap();
  await expect(sheet).toBeVisible();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/inventar/neu');
  // Regression (e2e report): an Escape pressed while the sheet is still sliding in used to be dropped on WebKit.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/inventar');

  // drag the grabber down
  await page.getByRole('button', { name: 'Artikel hinzufügen' }).first().tap();
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(600);
  const grabber = await page.locator('[data-sheet-handle="true"]').first().boundingBox();
  expect(grabber).not.toBeNull();
  const x = Math.round(grabber!.x + grabber!.width / 2);
  const y = Math.round(grabber!.y + 12);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) await page.mouse.move(x, y + step * 40, { steps: 2 });
  await page.mouse.up();
  await expect(sheet).toBeHidden();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/inventar');

  // the "×" button closes it too, and a dirty sheet asks before discarding
  await page.getByRole('button', { name: 'Artikel hinzufügen' }).first().tap();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('textbox', { name: 'Artikelname' }).fill('Entwurf');
  // Regression (e2e report): an Escape right after typing used to close the sheet without asking.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /Abbrechen|Weiter|Zurück/ })
    .first()
    .tap();
  await expect(sheet).toBeVisible();
});

// ── input sizes ────────────────────────────────────────────────────────────────

test('every form field is at least 16 px (iOS does not zoom into it)', async ({ page, context }) => {
  const visibleFields = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('input, textarea, select')]
        .filter((field) => {
          const type = (field as HTMLInputElement).type;
          if (['hidden', 'file', 'checkbox', 'radio', 'range'].includes(type)) return false;
          const rect = field.getBoundingClientRect();
          const style = getComputedStyle(field);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        })
        .map((field) => ({
          field: `${field.tagName.toLowerCase()}${field.getAttribute('type') ? `[${field.getAttribute('type')}]` : ''} "${field.getAttribute('aria-label') ?? field.getAttribute('name') ?? field.id}"`,
          size: parseFloat(getComputedStyle(field).fontSize),
        })),
    );
  const checked: string[] = [];
  const check = async (label: string) => {
    const fields = await visibleFields();
    expect(fields.length, `${label}: at least one form field`).toBeGreaterThan(0);
    for (const { field, size } of fields) {
      checked.push(`${label}: ${field} ${size}px`);
      expect(size, `${label}: ${field} is ${size}px`).toBeGreaterThanOrEqual(16);
    }
  };

  for (const [label, route] of [
    ['Login', '/login'],
    ['Registrieren', '/registrieren'],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole('textbox').first()).toBeVisible();
    await check(label);
  }
  await signIn(context);
  await page.goto('/inventar');
  await expect(page.getByRole('searchbox', { name: 'Artikel suchen' })).toBeVisible();
  await check('Inventar-Suche');
  await page.goto('/inventar/neu');
  await expect(page.getByRole('textbox', { name: 'Artikelname' })).toBeVisible();
  await page.waitForTimeout(500);
  await check('Neuer Artikel');
  await page.goto(`/inventar/${world.itemIds['Olivenöl']}/bearbeiten`);
  await expect(page.getByRole('textbox', { name: 'Artikelname' })).toHaveValue('Olivenöl');
  await check('Artikel bearbeiten');
  await page.goto('/einkauf');
  await expect(page.getByRole('textbox', { name: 'Artikel hinzufügen' })).toBeVisible();
  await check('Einkauf-Composer');
  await page.goto(`/chats/${world.conversations.lisa}`);
  await expect(page.getByRole('textbox', { name: 'Nachricht' })).toBeVisible();
  await check('Chat-Composer');
  await page.goto('/chats');
  await expect(page.getByRole('link', { name: /^Lisa/ })).toBeVisible();
  await check('Chat-Suche');
  await page.goto('/profil');
  await page.getByRole('button', { name: /^Anzeigename/ }).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(500);
  await check('Profil: Name ändern');
  test.info().annotations.push({ type: 'fields', description: `${checked.length} fields ≥ 16 px` });
});

// ── keyboard ───────────────────────────────────────────────────────────────────

/**
 * WebKit/Chromium emulation do not open a real keyboard: `window.visualViewport` is replaced by a scriptable
 * stand-in whose height shrinks like on iOS (the layout viewport keeps its size) – `useKeyboardInset` and the
 * `--keyboard-inset` CSS variable are the real code under test.
 */
const FAKE_KEYBOARD = `(() => {
  const target = new EventTarget();
  window.__kb = 0;
  const viewport = {
    get width() { return window.innerWidth; },
    get height() { return window.innerHeight - window.__kb; },
    offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
    addEventListener: (...args) => target.addEventListener(...args),
    removeEventListener: (...args) => target.removeEventListener(...args),
    dispatchEvent: (event) => target.dispatchEvent(event),
  };
  Object.defineProperty(window, 'visualViewport', { get: () => viewport, configurable: true });
  window.__setKeyboard = (px) => { window.__kb = px; target.dispatchEvent(new Event('resize')); };
})();`;

test('the chat composer stays above the keyboard and the last message stays visible', async ({ page, context }) => {
  await signIn(context);
  await context.addInitScript(FAKE_KEYBOARD);
  await page.goto(`/chats/${world.conversations.max}`);
  const composer = page.getByRole('textbox', { name: 'Nachricht' });
  const last = page.getByText('Letzte Nachricht ganz unten');
  await expect(last).toBeVisible();
  await settle(page);

  const KEYBOARD = 336;
  const geometry = async () => {
    const viewport = page.viewportSize()!;
    const composerBox = (await composer.boundingBox())!;
    const lastBox = (await last.boundingBox())!;
    const form = (await page.locator('form:has(textarea)').first().boundingBox())!;
    return { viewport, composerBox, lastBox, form };
  };

  const before = await geometry();
  expect(before.form.y + before.form.height).toBeLessThanOrEqual(before.viewport.height);

  await composer.focus();
  await page.evaluate(
    (px) => (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard(px),
    KEYBOARD,
  );
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset')))
    .toBe(`${KEYBOARD}px`);
  await page.waitForTimeout(600);

  const open = await geometry();
  const keyboardTop = open.viewport.height - KEYBOARD;
  expect(open.form.y + open.form.height, 'composer bottom is above the keyboard').toBeLessThanOrEqual(keyboardTop + 1);
  expect(open.composerBox.y, 'composer is on screen').toBeGreaterThan(0);
  expect(open.lastBox.y + open.lastBox.height, 'last message ends above the composer').toBeLessThanOrEqual(
    open.form.y + 1,
  );
  expect(open.lastBox.y, 'last message is fully on screen').toBeGreaterThan(0);

  // typing keeps it there; closing the keyboard restores the layout
  await composer.fill('Tippe gerade …');
  await page.waitForTimeout(300);
  expect((await geometry()).form.y + (await geometry()).form.height).toBeLessThanOrEqual(keyboardTop + 1);
  await page.evaluate(() => (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard(0));
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset')))
    .toBe('0px');
  await page.waitForTimeout(400);
  const closed = await geometry();
  expect(Math.abs(closed.form.y - before.form.y)).toBeLessThanOrEqual(2);
});

// ── reduced motion ─────────────────────────────────────────────────────────────

test('animations are skipped when the system asks for reduced motion', async ({ page, context }) => {
  await signIn(context);

  /** Samples the vertical position of the open sheet every frame while it appears. */
  const sheetTravel = async (): Promise<{ samples: number; travel: number }> => {
    await page.goto('/inventar');
    await expect(page.getByRole('link', { name: /^Nespresso Kapseln/ })).toBeVisible();
    await settle(page);
    await page.evaluate(() => {
      const w = window as unknown as { __tops: number[]; __sampling: boolean };
      w.__tops = [];
      w.__sampling = true;
      const loop = () => {
        const dialog = document.querySelector('[role="dialog"]');
        if (dialog) w.__tops.push(dialog.getBoundingClientRect().top);
        if (w.__sampling) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.getByRole('button', { name: 'Artikel hinzufügen' }).first().tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(900);
    return page.evaluate(() => {
      const w = window as unknown as { __tops: number[]; __sampling: boolean };
      w.__sampling = false;
      return { samples: w.__tops.length, travel: Math.max(...w.__tops) - Math.min(...w.__tops) };
    });
  };

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const animated = await sheetTravel();
  expect(animated.travel, 'without the preference the sheet slides in').toBeGreaterThan(100);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await sheetTravel();
  expect(reduced.travel, 'with reduced motion the sheet appears in place').toBeLessThan(2);

  // CSS transitions/animations of the shell are collapsed too
  const durations = await page.evaluate(() => {
    const longest = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      const seconds = (value: string) => Math.max(...value.split(',').map((part) => parseFloat(part) || 0));
      return Math.max(seconds(style.transitionDuration), seconds(style.animationDuration));
    };
    return { tabbar: longest('nav[aria-label="Hauptnavigation"] a'), main: longest('main') };
  });
  for (const [name, value] of Object.entries(durations)) {
    if (value !== null)
      expect(value, `${name} transition/animation duration under reduced motion`).toBeLessThanOrEqual(0.01);
  }
});

// ── PWA ────────────────────────────────────────────────────────────────────────

test.describe('PWA', () => {
  async function pngSize(page: Page, url: string): Promise<{ width: number; height: number; type: string }> {
    const response = await page.request.get(url);
    expect(response.status(), `GET ${url}`).toBe(200);
    const body = await response.body();
    // PNG: signature (8) + IHDR chunk: width/height are big-endian uint32 at bytes 16 and 20
    expect(body.subarray(0, 8).toString('hex'), `${url} is a PNG`).toBe('89504e470d0a1a0a');
    return {
      width: body.readUInt32BE(16),
      height: body.readUInt32BE(20),
      type: response.headers()['content-type'] ?? '',
    };
  }

  test('web app manifest is valid and its icons exist', async ({ page }) => {
    await page.goto('/login');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/json/);
    expect(response.headers()['cache-control'] ?? '').toMatch(/no-cache|no-store|max-age=0/);
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: 'Homi',
      short_name: 'Homi',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      lang: 'de-CH',
      orientation: 'portrait',
    });
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    const icons = manifest.icons as Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    const find = (sizes: string, purpose: string) =>
      icons.find((icon) => icon.sizes === sizes && (icon.purpose ?? 'any').split(' ').includes(purpose));
    for (const [sizes, purpose] of [
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ] as const) {
      const icon = find(sizes, purpose);
      expect(icon, `icon ${sizes} ${purpose}`).toBeDefined();
      expect(icon!.type).toBe('image/png');
      const size = await pngSize(page, new URL(icon!.src, `${BASE_URL}/`).toString());
      expect(`${size.width}x${size.height}`, `${icon!.src} really is ${sizes}`).toBe(sizes);
      expect(size.type).toBe('image/png');
    }
  });

  test('iOS home-screen metadata is present', async ({ page }) => {
    await page.goto('/login');
    const meta = (name: string) => page.locator(`meta[name="${name}"]`).first().getAttribute('content');
    expect(await meta('apple-mobile-web-app-capable')).toBe('yes');
    expect(await meta('apple-mobile-web-app-title')).toBe('Homi');
    expect(await meta('apple-mobile-web-app-status-bar-style')).toBe('black-translucent');
    expect(await meta('viewport')).toContain('viewport-fit=cover');
    expect(await meta('format-detection')).toContain('telephone=no');
    const themeColors = await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({ content: node.getAttribute('content'), media: node.getAttribute('media') })),
      );
    expect(themeColors.length).toBeGreaterThanOrEqual(2);
    const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect(touchIcon).toBeTruthy();
    const size = await pngSize(page, new URL(touchIcon!, `${BASE_URL}/`).toString());
    expect(`${size.width}x${size.height}`).toBe('180x180');
  });

  test.describe('service worker', () => {
    test.use({ serviceWorkers: 'allow' });

    test('registers, activates and controls the page (Chromium)', async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Service worker registration is asserted in Chromium only');
      await page.goto('/login');
      const registration = await page.evaluate(async () => {
        const ready = await navigator.serviceWorker.ready;
        return { scope: ready.scope, script: ready.active?.scriptURL ?? null };
      });
      expect(registration.scope).toBe(`${BASE_URL}/`);
      expect(registration.script).toBe(`${BASE_URL}/sw.js`);
      await expect
        .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state))
        .toBe('activated');
      await page.reload();
      await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null))
        .toBe(`${BASE_URL}/sw.js`);
      // the app shell is precached: the login screen still loads without a network
      await page.context().setOffline(true);
      await page.goto('/login');
      await expect(page.getByRole('button', { name: 'Anmelden' }).first()).toBeVisible();
      await page.context().setOffline(false);
    });
  });
});
