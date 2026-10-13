import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { setInventoryOrder, setShoppingOrder, deleteMessage } from './support/db';
import { BASE_URL, PRODUCT_IMAGE_DIR } from './support/env';
import { seedWorld, type SeededWorld } from './support/seed';
import { zurichInstant } from './support/time';
import { SYSTEM_MASKS, compareImages, writeArtifacts, writeResults, type Mask, type VisualRow } from './support/visual';

/**
 * Visual regression against the design references (design/reference/{light,dark}/*.png, 393×852 @1×).
 *
 * Every screen is rendered from the REAL production build with data created by `apps/server/scripts/seed-demo.ts`
 * (through the real API and image pipeline), safe areas forced to the design frame (--safe-top 54 px,
 * --safe-bottom 34 px), the clock fixed (greeting, "Heute", timestamps) and animations reduced. The status bar
 * (y 0–54) and the home indicator (y 818–852) are never compared; further masks are listed per screen.
 * Mismatch = share of compared pixels that differ (pixelmatch, threshold 0.1, anti-aliasing ignored).
 *
 * Budgets (max. allowed mismatch %) are calibrated from real measurements, see `BUDGET_PCT`. Set
 * E2E_VISUAL_BUDGET_FACTOR (e.g. 2) to widen all budgets on a machine with different font rendering (CI default: 2).
 */

const BUDGET_FACTOR = Number(process.env.E2E_VISUAL_BUDGET_FACTOR ?? (process.env.CI ? 2 : 1));

type World = SeededWorld;

interface Screen {
  slug: string;
  reference: string;
  theme: 'light' | 'dark';
  /** Wall-clock time (Europe/Zurich, on the seeded "today") the page believes it is. */
  clock: string;
  masks?: Mask[];
  /** Arrange the seeded data (SQL), navigate and wait until the screen is ready. */
  open: (page: Page, world: World) => Promise<void>;
}

const HOME_TILE_ORDER = [
  'Milch',
  'Kaffee',
  'Olivenöl',
  'Nespresso Kapseln',
  'Batterien AA',
  'Spülmittel',
  'Küchenpapier',
  'Reis',
];
const LIST_ORDER = [
  'Nespresso Kapseln',
  'Olivenöl',
  'Batterien AA',
  'Milch',
  'Kaffee',
  'Spülmittel',
  'Küchenpapier',
  'Reis',
];
// screen 01 previews "Eier, Butter, Spülmittel" while screen 03 lists "Milch, Eier, Spülmittel, …": two different
// orders in the design, so the open items are re-ordered per screen.
const HOME_SHOPPING_ORDER = ['Eier', 'Butter', 'Spülmittel', 'Milch', 'Reis', 'Küchenpapier', 'Tomaten', 'Bananen'];
const LIST_SHOPPING_ORDER = ['Milch', 'Eier', 'Spülmittel', 'Reis', 'Butter', 'Küchenpapier', 'Tomaten', 'Bananen'];

async function settle(page: Page, extraMs = 400): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => [...document.images].every((image) => image.complete)), { timeout: 15_000 })
    .toBe(true);
  await page.waitForTimeout(extraMs);
}

async function openHome(page: Page, world: World): Promise<void> {
  await setInventoryOrder(world.householdId, HOME_TILE_ORDER);
  await setShoppingOrder(world.householdId, HOME_SHOPPING_ORDER);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dein Zuhause.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Milch 3 Stück/ })).toBeVisible();
  await settle(page);
}

async function openInventory(page: Page, world: World): Promise<void> {
  await setInventoryOrder(world.householdId, LIST_ORDER);
  await page.goto('/inventar');
  await expect(page.getByRole('link', { name: /^Nespresso Kapseln/ })).toBeVisible();
  await settle(page);
}

async function openDetail(page: Page, world: World): Promise<void> {
  await page.goto(`/inventar/${world.itemIds['Nespresso Kapseln']}`);
  await expect(page.getByRole('heading', { name: 'Nespresso Kapseln' })).toBeVisible();
  await settle(page);
}

async function openNewItem(page: Page): Promise<void> {
  await page.goto('/inventar/neu');
  const sheet = page.getByRole('dialog', { name: 'Artikel hinzufügen' });
  await sheet.waitFor();
  await sheet
    .locator('input[type="file"]:not([capture])')
    .first()
    .setInputFiles(path.join(PRODUCT_IMAGE_DIR, 'oil.png'));
  await sheet.getByLabel('Artikelname').fill('Olivenöl');
  await sheet.getByLabel('Kategorie', { exact: true }).selectOption({ label: 'Küche' });
  await sheet.getByLabel('Einheit', { exact: true }).selectOption({ label: 'Flasche' });
  await sheet.getByRole('button', { name: 'Menge erhöhen' }).click();
  await sheet.getByLabel('Preis pro Einheit', { exact: true }).fill('8.50');
  await expect(sheet.getByRole('button', { name: 'Artikel hinzufügen' })).toBeEnabled({ timeout: 20_000 });
  // let the keyboard-free layout, the photo and the sheet transition settle; blur the field like the design
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await settle(page, 900);
}

async function openShopping(page: Page, world: World): Promise<void> {
  await setShoppingOrder(world.householdId, LIST_SHOPPING_ORDER);
  await page.goto('/einkauf');
  await expect(page.getByRole('checkbox', { name: /^Milch/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Erledigt · 4/ })).toBeVisible();
  await settle(page);
}

async function openChats(page: Page): Promise<void> {
  await page.goto('/chats');
  await expect(page.getByRole('link', { name: /^Lisa/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Max/ })).toBeVisible();
  await settle(page);
}

async function openChatWithLisa(page: Page, world: World): Promise<void> {
  // Screen 08 shows the conversation before Lisa's newest message (which only screen 04 previews).
  await deleteMessage(world.conversations.lisa, 'Kannst du noch Milch mitbringen?');
  await page.goto(`/chats/${world.conversations.lisa}`);
  await expect(page.getByText('Zur Einkaufsliste hinzugefügt')).toBeVisible();
  await expect(page.getByText('Gelesen')).toBeVisible();
  await settle(page, 700);
}

async function openHousehold(page: Page): Promise<void> {
  await page.goto('/haushalt');
  await expect(page.getByRole('heading', { name: 'Unser Zuhause' })).toBeVisible();
  await expect(page.getByText('3 Mitglieder · 128 Artikel')).toBeVisible();
  await settle(page);
}

const PHOTO_MASK: Mask = { label: 'photo (design stretches, app crops)', x: 20, y: 134, w: 353, h: 200 };

const SCREENS: Screen[] = [
  { slug: '01-home', reference: 'light/01-home.png', theme: 'light', clock: '09:41', open: openHome },
  { slug: '02-inventar', reference: 'light/02-inventar.png', theme: 'light', clock: '09:41', open: openInventory },
  {
    slug: '05-artikel-details',
    reference: 'light/05-artikel-details.png',
    theme: 'light',
    clock: '09:41',
    open: openDetail,
  },
  {
    slug: '06-neuer-artikel-ausgefuellt',
    reference: 'light/06-neuer-artikel-ausgefuellt.png',
    theme: 'light',
    clock: '09:41',
    masks: [PHOTO_MASK],
    open: (page) => openNewItem(page),
  },
  {
    slug: '03-einkaufsliste',
    reference: 'light/03-einkaufsliste.png',
    theme: 'light',
    clock: '09:41',
    open: openShopping,
  },
  {
    slug: '04-chats',
    reference: 'light/04-chats.png',
    theme: 'light',
    clock: '15:00',
    open: (page) => openChats(page),
  },
  {
    slug: '04-chats-dark',
    reference: 'dark/04-chats-dark.png',
    theme: 'dark',
    clock: '15:00',
    open: (page) => openChats(page),
  },
  {
    slug: '09-haushalt-profil',
    reference: 'light/09-haushalt-profil.png',
    theme: 'light',
    clock: '09:41',
    open: (page) => openHousehold(page),
  },
  { slug: '01-home-dark', reference: 'dark/01-home-dark.png', theme: 'dark', clock: '09:41', open: openHome },
  {
    slug: '02-inventar-dark',
    reference: 'dark/02-inventar-dark.png',
    theme: 'dark',
    clock: '09:41',
    open: openInventory,
  },
  {
    slug: '03-einkaufsliste-dark',
    reference: 'dark/03-einkaufsliste-dark.png',
    theme: 'dark',
    clock: '09:41',
    open: openShopping,
  },
  {
    slug: '05-artikel-details-dark',
    reference: 'dark/05-artikel-details-dark.png',
    theme: 'dark',
    clock: '09:41',
    open: openDetail,
  },
  {
    slug: '06-neuer-artikel-dark',
    reference: 'dark/06-neuer-artikel-dark.png',
    theme: 'dark',
    clock: '09:41',
    masks: [PHOTO_MASK],
    open: (page) => openNewItem(page),
  },
  // Screen 08 must come after both 04 variants: it removes Lisa's newest message (see openChatWithLisa).
  { slug: '08-chat-lisa', reference: 'light/08-chat-lisa.png', theme: 'light', clock: '15:00', open: openChatWithLisa },
  { slug: '08-chat-dark', reference: 'dark/08-chat-dark.png', theme: 'dark', clock: '15:00', open: openChatWithLisa },
];

/**
 * Budgets: max. allowed mismatch in % of the compared pixels, per screen (same for both browsers).
 * Measured (3 identical runs each, the renderings are deterministic) on Windows 11, Chromium 1248 / WebKit 2370:
 *
 *   screen                        chromium  webkit   budget   why it is not 0
 *   01-home                         1.80     1.20      3.0     Inter/text rasterisation, 1 px text baseline offsets, "CHF 2’485.50" uses a
 *                                                              typographic apostrophe (formatCHF) where the design has "2'485.50", glass shadows
 *   02-inventar                     2.10     1.32      3.4     many text rows (every glyph edge differs slightly), glass toolbar/tab bar
 *   05-artikel-details              0.72     0.61      1.4     few text rows, hero image/glass rasterisation
 *   06-neuer-artikel-ausgefuellt    1.15     0.46      2.0     text only (the 353×200 px photo is masked, see below)
 *   03-einkaufsliste                0.89     0.47      1.6     text rows, checkbox rings
 *   04-chats                        0.79     0.41      1.5     text rows, avatar glyphs
 *   09-haushalt-profil              1.20     0.27      2.1     text rows, icon tiles
 *   08-chat-lisa                    1.88     1.02      3.1     bubble text + the coffee emoji (Windows emoji font vs the design's), glass composer
 *   dark variants                   same screens, same noise (budget = light budget ±0.1)
 *
 * budget = ceil10(max(chromium, webkit) × 1.5 + 0.25): the 1.5× covers the font/AA variation between machines
 * and Chromium/WebKit builds, the constant covers tiny absolute noise. Anything beyond that is a real layout,
 * colour or content regression (a moved row alone already costs > 3 %).
 *
 * Masks: 06 masks the photo area (x 20–373, y 134–334): the design stretches the 400×400 product photo into the
 * 353×200 field while the app crops it (object-fit: cover) – an intended difference that otherwise costs ≈ 9.6 %.
 */
const BUDGET_PCT: Record<string, number> = {
  '01-home': 3.0,
  '02-inventar': 3.4,
  '05-artikel-details': 1.4,
  '06-neuer-artikel-ausgefuellt': 2.0,
  '03-einkaufsliste': 1.6,
  '04-chats': 1.5,
  '04-chats-dark': 1.5,
  '09-haushalt-profil': 2.1,
  '01-home-dark': 2.9,
  '02-inventar-dark': 3.4,
  '03-einkaufsliste-dark': 1.7,
  '05-artikel-details-dark': 1.6,
  '06-neuer-artikel-dark': 2.0,
  '08-chat-lisa': 3.1,
  '08-chat-dark': 3.1,
};

const rows: VisualRow[] = [];

test.describe.configure({ mode: 'serial' });

let world: World;

test.beforeAll(() => {
  // Julian is "Du" and "Verwaltung" (ADMIN) like on screen 09.
  world = seedWorld({ designRoles: true });
});

test.afterAll(() => {
  const project = test.info().project.name;
  writeResults(project, rows);
  console.log(`\nVisual mismatch (${project}):`);
  for (const row of rows) {
    console.log(
      `  ${row.screen.padEnd(32)} ${row.mismatchPct.toFixed(2).padStart(6)} %  (budget ${row.budgetPct.toFixed(2)} %)`,
    );
  }
});

for (const screen of SCREENS) {
  test(`${screen.slug} matches the design`, async ({ page, context }, testInfo) => {
    await context.addCookies([{ name: 'homi_session', value: world.julian.sessionCookie, url: BASE_URL }]);
    await context.addInitScript(() => {
      const apply = () => {
        const style = document.createElement('style');
        style.textContent = ':root{--safe-top:54px!important;--safe-bottom:34px!important}';
        document.head.append(style);
      };
      if (document.head) apply();
      else document.addEventListener('DOMContentLoaded', apply);
    });
    await page.emulateMedia({ colorScheme: screen.theme, reducedMotion: 'reduce' });
    await page.clock.setFixedTime(zurichInstant(world.today, screen.clock));

    await screen.open(page, world);

    const actual = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
    const masks = [...SYSTEM_MASKS, ...(screen.masks ?? [])];
    const comparison = compareImages(actual, screen.reference, masks);
    writeArtifacts(testInfo.project.name, screen.slug, comparison, actual);
    const budgetPct = BUDGET_PCT[screen.slug];
    if (budgetPct === undefined) throw new Error(`no budget for ${screen.slug}`);
    const budget = budgetPct * BUDGET_FACTOR;
    rows.push({
      project: testInfo.project.name,
      screen: screen.slug,
      mismatchPct: comparison.mismatchPct,
      budgetPct: budget,
      maskedPixels: comparison.maskedPixels,
      masks: masks.slice(SYSTEM_MASKS.length).map((mask) => mask.label),
    });
    expect(
      comparison.mismatchPct,
      `${screen.slug}: ${comparison.mismatchPct.toFixed(2)} % of ${comparison.comparedPixels} px differ (budget ${budget.toFixed(2)} %) – see e2e/.artifacts/visual/${testInfo.project.name}/${screen.slug}.compare.png`,
    ).toBeLessThanOrEqual(budget);
  });
}
