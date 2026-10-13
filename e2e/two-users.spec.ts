import path from 'node:path';
import type { Page } from '@playwright/test';
import { BASE_URL, PRODUCT_IMAGE_DIR } from './support/env';
import { expect, goToTab, registerViaUi, test } from './support/fixtures';

/**
 * The core collaboration scenario with two independent browser contexts (own cookies, own client IP) against the
 * real production server, database and WebSocket connection. Nothing is mocked and no page is reloaded until the
 * persistence check at the end: everything in between must arrive live.
 */

const HOUSEHOLD_NAME = 'Unser Zuhause';
const OIL_IMAGE = path.join(PRODUCT_IMAGE_DIR, 'oil.png');

/** The completed section is collapsed by default: expand it and check the ticked item. */
async function expectMilkCompleted(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: /^Erledigt · 1/ });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.getByRole('checkbox', { name: /^Milch/ })).toBeChecked();
}

const isHouseholdId = (value: string | undefined): value is string => !!value && /^[0-9a-f-]{36}$/.test(value);

/** Every image of the page that points at the membership-checked image endpoint must really be decoded. */
async function expectServedImages(page: Page, minimum: number): Promise<string[]> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            [...document.images].filter(
              (image) => image.src.includes('/images/') && image.complete && image.naturalWidth > 0,
            ).length,
        ),
      { message: 'photos of the page are decoded', timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(minimum);
  const sources = await page.evaluate(() =>
    [...document.images].filter((image) => image.src.includes('/images/')).map((image) => image.src),
  );
  for (const src of sources) {
    const response = await page.request.get(src);
    expect(response.status(), `GET ${src}`).toBe(200);
    expect(response.headers()['content-type']).toBe('image/webp');
    expect((await response.body()).byteLength).toBeGreaterThan(500);
  }
  return sources;
}

test('two people share one household: inventory, shopping list and chat stay in sync live', async ({ newPerson }) => {
  test.slow();
  const anna = await newPerson('Anna');
  const ben = await newPerson('Ben');

  // ── 1 A registers and creates the household ─────────────────────────────────
  await test.step('Anna registers and creates the household', async () => {
    await anna.page.goto('/registrieren');
    await registerViaUi(anna.page, anna);
    await anna.page.waitForURL('**/willkommen');
    await anna.page.getByLabel('Name des Haushalts').fill(HOUSEHOLD_NAME);
    await anna.page.getByRole('button', { name: /Haushalt erstellen/ }).click();
    await expect(anna.page.getByRole('heading', { name: 'Dein Zuhause.' })).toBeVisible();
    await expect(anna.page.getByRole('button', { name: new RegExp(`Haushalt: ${HOUSEHOLD_NAME}`) })).toBeVisible();
  });

  // ── 2 A creates an invitation link ──────────────────────────────────────────
  let invitationUrl = '';
  await test.step('Anna creates an invitation link', async () => {
    await anna.page.goto('/haushalt');
    await expect(anna.page.getByText('1 Mitglied')).toBeVisible();
    await anna.page.getByRole('button', { name: 'Mitglied einladen' }).click();
    await anna.page.getByRole('button', { name: 'Link erstellen' }).click();
    const field = anna.page.getByLabel('Einladungslink');
    await expect(field).toHaveValue(new RegExp(`^${BASE_URL}/einladung/[A-Za-z0-9_-]{20,}$`));
    invitationUrl = await field.inputValue();
    await anna.page.getByRole('button', { name: 'Fertig' }).click();
    await expect(anna.page.getByRole('dialog')).toBeHidden();
  });

  // ── 3 B registers through the link and joins; A sees the new member live ────
  await test.step('Ben registers through the link and joins', async () => {
    await ben.page.goto(invitationUrl);
    await expect(ben.page.getByRole('heading', { name: HOUSEHOLD_NAME })).toBeVisible();
    await expect(ben.page.getByText('Anna lädt dich in diesen Haushalt ein.')).toBeVisible();
    await ben.page.getByRole('link', { name: 'Konto erstellen' }).click();
    await ben.page.waitForURL((url) => url.pathname === '/registrieren' && url.searchParams.has('redirect'));
    await registerViaUi(ben.page, ben);
    await ben.page.waitForURL('**/einladung/*');
    await ben.page.getByRole('button', { name: 'Einladung annehmen' }).click();
    await expect(ben.page.getByRole('heading', { name: 'Dein Zuhause.' })).toBeVisible();
    await expect(ben.page.getByRole('button', { name: new RegExp(`Haushalt: ${HOUSEHOLD_NAME}`) })).toBeVisible();

    // Anna never reloaded: the member list of the open household screen updates through the socket.
    await expect(anna.page.getByText('2 Mitglieder')).toBeVisible();
    await expect(anna.page.getByRole('link', { name: /Ben/ })).toBeVisible();
    // The invitation is single use: the link is dead now.
    const preview = await ben.api.get(`/api/invitations/${invitationUrl.split('/').pop()}`);
    expect(preview.body.status).toBe('used');
  });

  // ── 4 A adds an inventory item with a photo; B sees it live ────────────────
  await anna.page.getByRole('button', { name: 'Zurück' }).click();
  await goToTab(anna.page, 'Home');
  await goToTab(anna.page, 'Inventar');
  await goToTab(ben.page, 'Inventar');
  await expect(ben.page.getByText('0 Artikel in deinem Haushalt')).toBeVisible();

  await test.step('Anna adds "Olivenöl" with a photo', async () => {
    await anna.page.getByRole('button', { name: 'Artikel hinzufügen' }).first().click();
    const sheet = anna.page.getByRole('dialog', { name: 'Artikel hinzufügen' });
    await sheet.waitFor();
    await sheet.locator('input[type="file"]:not([capture])').first().setInputFiles(OIL_IMAGE);
    await sheet.getByLabel('Artikelname').fill('Olivenöl');
    await sheet.getByLabel('Kategorie', { exact: true }).selectOption({ label: 'Küche' });
    await sheet.getByLabel('Einheit', { exact: true }).selectOption({ label: 'Flasche' });
    await sheet.getByRole('button', { name: 'Menge erhöhen' }).click();
    await expect(sheet.getByRole('spinbutton', { name: 'Menge' })).toHaveAttribute('aria-valuenow', '2');
    await sheet.getByLabel('Preis pro Einheit', { exact: true }).fill('8.50');
    const upload = sheet.getByRole('button', { name: 'Artikel hinzufügen' });
    await expect(upload).toBeEnabled({ timeout: 20_000 });
    await upload.click();
    await expect(sheet).toBeHidden();
    await expect(anna.page.getByRole('link', { name: /^Olivenöl, Küche · 2 Flaschen/ })).toBeVisible();
  });

  await test.step('Ben sees the new item and its photo without reloading', async () => {
    const row = ben.page.getByRole('link', { name: /^Olivenöl, Küche · 2 Flaschen, CHF 17\.00/ });
    await expect(row).toBeVisible();
    await expect(ben.page.getByText('1 Artikel in deinem Haushalt')).toBeVisible();
    await expectServedImages(ben.page, 1);
  });

  // ── 5 B changes the quantity; A sees it live ───────────────────────────────
  await test.step('Ben raises the quantity to 3, Anna sees it live', async () => {
    await ben.page.getByRole('link', { name: /^Olivenöl/ }).click();
    await ben.page.waitForURL(/\/inventar\/[0-9a-f-]{36}$/);
    const quantity = ben.page.getByRole('spinbutton', { name: 'Menge' });
    await expect(quantity).toHaveAttribute('aria-valuenow', '2');
    const request = ben.page.waitForResponse((r) => r.url().includes('/quantity') && r.ok());
    await ben.page.getByRole('button', { name: 'Menge erhöhen' }).click();
    await request;
    await expect(quantity).toHaveAttribute('aria-valuenow', '3');
    // Anna is still on the list: the row shows 3 bottles and the new total CHF 25.50.
    await expect(anna.page.getByRole('link', { name: /^Olivenöl, Küche · 3 Flaschen, CHF 25\.50/ })).toBeVisible();
  });

  // ── 6 A creates a shopping item; B completes it; both see the completed state ─
  await goToTab(anna.page, 'Einkauf');
  await expect(anna.page.getByRole('heading', { name: 'Einkaufsliste' })).toBeVisible();
  await ben.page.goto('/einkauf');
  await expect(ben.page.getByRole('heading', { name: 'Einkaufsliste' })).toBeVisible();

  await test.step('Anna adds "Milch" to the shopping list; Ben sees it live', async () => {
    const composer = anna.page.getByRole('textbox', { name: 'Artikel hinzufügen' });
    await composer.fill('Milch');
    await composer.press('Enter');
    await expect(anna.page.getByRole('checkbox', { name: /^Milch/ })).toBeVisible();
    await expect(ben.page.getByRole('checkbox', { name: /^Milch/ })).toBeVisible();
    await expect(ben.page.getByRole('checkbox', { name: /^Milch/ })).not.toBeChecked();
  });

  await test.step('Ben completes it; both see the completed state live', async () => {
    const done = ben.page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().includes('/shopping/items/') && r.ok(),
    );
    await ben.page.getByRole('checkbox', { name: /^Milch/ }).check();
    await done;
    for (const person of [ben, anna]) {
      await expect(person.page.getByRole('list', { name: 'Offene Artikel' })).toHaveCount(0);
      await expectMilkCompleted(person.page);
    }
    const state = await anna.api.get('/api/auth/me');
    const shopping = await anna.api.get(`/api/households/${state.body.activeHouseholdId}/shopping`);
    expect(shopping.body.stats).toEqual({ done: 1, total: 1 });
    expect(shopping.body.completed.map((item: { name: string }) => item.name)).toEqual(['Milch']);
  });

  // ── 7 Chat: A sends, B receives live (list badge, then thread); B replies, A receives ─
  await goToTab(ben.page, 'Chats');
  await expect(ben.page.getByRole('heading', { name: 'Noch keine Chats' })).toBeVisible();
  await goToTab(anna.page, 'Chats');

  await test.step('Anna writes in the household chat', async () => {
    await anna.page.getByRole('button', { name: 'Neuer Chat' }).first().click();
    await anna.page.getByRole('button', { name: HOUSEHOLD_NAME }).click();
    await anna.page.waitForURL(/\/chats\/[0-9a-f-]{36}$/);
    // Regression (e2e report): text filled into the composer while the "Neuer Chat" sheet was still animating out
    // (~300 ms) used to be pulled into the closing sheet on WebKit – no waiting for the sheet to disappear here.
    await expect(anna.page.getByRole('region', { name: `Neuer Chat mit ${HOUSEHOLD_NAME}` })).toBeVisible();
    const composer = anna.page.getByRole('textbox', { name: 'Nachricht' });
    await composer.fill('Hallo Ben, willkommen im Haushalt!');
    await anna.page.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(anna.page.getByText('Hallo Ben, willkommen im Haushalt!')).toBeVisible();
  });

  let conversationId = '';
  await test.step('Ben sees the conversation with an unread badge live', async () => {
    const row = ben.page.getByRole('link', { name: new RegExp(`^${HOUSEHOLD_NAME}`) }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Anna: Hallo Ben, willkommen im Haushalt!');
    await expect(row).toHaveAttribute('aria-label', /1 ungelesene Nachricht/);
    const conversations = await ben.api.get(
      `/api/households/${(await ben.api.get('/api/auth/me')).body.activeHouseholdId}/conversations`,
    );
    expect(conversations.body).toHaveLength(1);
    expect(conversations.body[0].unreadCount).toBe(1);
    conversationId = conversations.body[0].id;
    expect(isHouseholdId(conversationId)).toBe(true);
  });

  await test.step('Ben opens the chat (unread cleared) and replies; Anna receives it live', async () => {
    await ben.page
      .getByRole('link', { name: new RegExp(`^${HOUSEHOLD_NAME}`) })
      .first()
      .click();
    await ben.page.waitForURL(new RegExp(`/chats/${conversationId}$`));
    await expect(ben.page.getByText('Hallo Ben, willkommen im Haushalt!')).toBeVisible();
    const composer = ben.page.getByRole('textbox', { name: 'Nachricht' });
    await composer.fill('Hallo Anna, danke fürs Einladen!');
    await ben.page.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(ben.page.getByText('Hallo Anna, danke fürs Einladen!')).toBeVisible();
    // Anna's thread receives it without any reload
    await expect(anna.page.getByText('Hallo Anna, danke fürs Einladen!')).toBeVisible();
    // Anna reads along: Ben sees "Gelesen" under his message.
    await expect(ben.page.getByText('Gelesen')).toBeVisible();
  });

  // ── 8 Reload both: everything persists ─────────────────────────────────────
  await test.step('after a reload both still see everything', async () => {
    for (const person of [anna, ben]) {
      await person.page.reload();
      await expect(person.page.getByText('Hallo Ben, willkommen im Haushalt!')).toBeVisible();
      await expect(person.page.getByText('Hallo Anna, danke fürs Einladen!')).toBeVisible();
    }

    for (const person of [anna, ben]) {
      // chat list: preview of the last message, no unread badge left
      await person.page.goto('/chats');
      const row = person.page.getByRole('link', { name: new RegExp(`^${HOUSEHOLD_NAME}`) }).first();
      await expect(row).toContainText('Hallo Anna, danke fürs Einladen!');
      const household = (await person.api.get('/api/auth/me')).body.activeHouseholdId as string;
      const conversations = await person.api.get(`/api/households/${household}/conversations`);
      expect(conversations.body[0].unreadCount, `${person.displayName}: unread count`).toBe(0);

      // inventory: the item, its quantity and its photo
      await person.page.goto('/inventar');
      await expect(person.page.getByRole('link', { name: /^Olivenöl, Küche · 3 Flaschen, CHF 25\.50/ })).toBeVisible();
      await expect(person.page.getByText('1 Artikel in deinem Haushalt')).toBeVisible();
      const sources = await expectServedImages(person.page, 1);
      expect(sources[0]).toMatch(/\/api\/households\/[0-9a-f-]{36}\/images\/[0-9a-f-]{36}/);

      // detail screen: full-size photo too
      await person.page.getByRole('link', { name: /^Olivenöl/ }).click();
      await expect(person.page.getByRole('spinbutton', { name: 'Menge' })).toHaveAttribute('aria-valuenow', '3');
      await expectServedImages(person.page, 1);

      // shopping list: the completed item
      await person.page.goto('/einkauf');
      await expectMilkCompleted(person.page);
    }
  });
});
