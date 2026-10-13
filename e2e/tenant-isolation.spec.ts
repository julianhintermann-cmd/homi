import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { test as base, expect, type PlaywrightWorkerArgs } from '@playwright/test';
import { ApiClient, CSRF_HEADERS, registerApiPerson, type ApiPerson, type HttpMethod } from './support/api';

type Playwright = PlaywrightWorkerArgs['playwright'];
import { BASE_URL } from './support/env';

/**
 * Tenant isolation against the real server: a signed-in stranger (C, owner of an unrelated household) must never
 * read, change or even confirm the existence of anything that belongs to household A – over HTTP and over the
 * WebSocket. Non-members get 404 (never 403/200), role-limited members get 403, anonymous callers 401, and
 * mutations without the CSRF header 403. A's data must be untouched at the end.
 */

const SECRET_NAME = 'Geheimes Olivenöl 9d3f';
const SECRET_HOUSEHOLD = 'Haushalt Alpha 9d3f';
const SECRET_SHOPPING = 'Geheime Milch 9d3f';
const SECRET_MESSAGE = 'Geheime Nachricht 9d3f';

interface World {
  a: ApiPerson; // owner of household A
  m: ApiPerson; // plain member of household A
  c: ApiPerson; // stranger, owner of household C
  hidA: string;
  hidC: string;
  itemA: string;
  imageA: string;
  shoppingA: string;
  completedA: string;
  conversationA: string;
  messageA: string;
  invitationA: string;
  itemC: string;
  imageC: string;
  conversationC: string;
}

const test = base.extend<{ world: World }>({
  world: [
    async ({ playwright }, use) => {
      const world = await buildWorld(playwright);
      await use(world);
      await Promise.all([world.a.dispose(), world.m.dispose(), world.c.dispose()]);
    },
    { scope: 'test' },
  ],
});

async function buildWorld(playwright: Playwright): Promise<World> {
  const [a, m, c] = await Promise.all([
    registerApiPerson(playwright, 'Alpha'),
    registerApiPerson(playwright, 'Mitglied'),
    registerApiPerson(playwright, 'Fremd'),
  ]);

  const householdA = await a.api.post('/api/households', { name: SECRET_HOUSEHOLD });
  expect(householdA.status).toBe(201);
  const hidA: string = householdA.body.id;
  const invite = await a.api.post(`/api/households/${hidA}/invitations`, { role: 'MEMBER' });
  expect(invite.status).toBe(201);
  const accepted = await m.api.post(`/api/invitations/${invite.body.url.split('/').pop()}/accept`);
  expect(accepted.status).toBe(200);
  const pending = await a.api.post(`/api/households/${hidA}/invitations`, { role: 'MEMBER' });
  expect(pending.status).toBe(201);

  const imageA = await a.api.uploadImage(hidA, 'oil.png');
  expect(imageA.status).toBe(201);
  const itemA = await a.api.post(`/api/households/${hidA}/items`, {
    name: SECRET_NAME,
    category: 'KUECHE',
    quantity: '2',
    unit: 'FLASCHE',
    unitPrice: '8.50',
    imageId: imageA.body.id,
  });
  expect(itemA.status).toBe(201);
  const shoppingA = await a.api.post(`/api/households/${hidA}/shopping/items`, { name: SECRET_SHOPPING });
  expect(shoppingA.status).toBe(201);
  const completedA = await a.api.post(`/api/households/${hidA}/shopping/items`, { name: 'Erledigt 9d3f' });
  await a.api.patch(`/api/households/${hidA}/shopping/items/${completedA.body.id}`, { completed: true });
  const conversationsA = await a.api.get(`/api/households/${hidA}/conversations`);
  const conversationA: string = conversationsA.body[0].id;
  const messageA = await a.api.post(`/api/households/${hidA}/conversations/${conversationA}/messages`, {
    clientId: randomUUID(),
    content: SECRET_MESSAGE,
  });
  expect(messageA.status).toBe(201);

  const householdC = await c.api.post('/api/households', { name: 'Haushalt Charlie' });
  expect(householdC.status).toBe(201);
  const hidC: string = householdC.body.id;
  const imageC = await c.api.uploadImage(hidC, 'milk.png');
  const itemC = await c.api.post(`/api/households/${hidC}/items`, {
    name: 'Milch von C',
    category: 'KUECHE',
    quantity: '1',
    unit: 'STUECK',
    unitPrice: null,
    imageId: imageC.body.id,
  });
  expect(itemC.status).toBe(201);
  const conversationsC = await c.api.get(`/api/households/${hidC}/conversations`);

  return {
    a,
    m,
    c,
    hidA,
    hidC,
    itemA: itemA.body.id,
    imageA: imageA.body.id,
    shoppingA: shoppingA.body.id,
    completedA: completedA.body.id,
    conversationA,
    messageA: messageA.body.id,
    invitationA: pending.body.id,
    itemC: itemC.body.id,
    imageC: imageC.body.id,
    conversationC: conversationsC.body[0].id,
  };
}

/** Snapshot of everything A owns, used to prove that none of the attacks changed anything. */
async function snapshotOfA(w: World): Promise<unknown> {
  const { a, hidA, itemA, conversationA } = w;
  const [household, items, item, shopping, messages, conversations, dashboard, invitations] = await Promise.all([
    a.api.get(`/api/households/${hidA}`),
    a.api.get(`/api/households/${hidA}/items`),
    a.api.get(`/api/households/${hidA}/items/${itemA}`),
    a.api.get(`/api/households/${hidA}/shopping`),
    a.api.get(`/api/households/${hidA}/conversations/${conversationA}/messages`),
    a.api.get(`/api/households/${hidA}/conversations`),
    a.api.get(`/api/households/${hidA}/dashboard`),
    a.api.get(`/api/households/${hidA}/invitations`),
  ]);
  const strip = (body: unknown) => JSON.parse(JSON.stringify(body));
  return strip({
    household: household.body,
    items: items.body,
    item: item.body,
    shopping: shopping.body,
    messages: messages.body,
    conversations: conversations.body,
    dashboard: dashboard.body,
    invitations: invitations.body,
  });
}

const LEAKS = [SECRET_NAME, SECRET_HOUSEHOLD, SECRET_SHOPPING, SECRET_MESSAGE, 'Erledigt 9d3f', 'Alpha'];

function expectNoLeak(label: string, body: unknown): void {
  const text = typeof body === 'string' ? body : Buffer.isBuffer(body) ? '' : JSON.stringify(body);
  for (const secret of LEAKS) expect(text, `${label} leaks "${secret}"`).not.toContain(secret);
}

interface Attempt {
  label: string;
  method: HttpMethod;
  url: string;
  data?: unknown;
}

test.describe('tenant isolation (HTTP)', () => {
  test('a stranger gets 404 for every endpoint of a household it does not belong to', async ({ world: w }) => {
    const before = await snapshotOfA(w);
    const hA = `/api/households/${w.hidA}`;
    const attempts: Attempt[] = [
      { label: 'household detail', method: 'get', url: hA },
      { label: 'rename household', method: 'patch', url: hA, data: { name: 'Gekapert' } },
      { label: 'delete household', method: 'delete', url: hA },
      { label: 'list invitations', method: 'get', url: `${hA}/invitations` },
      { label: 'create invitation', method: 'post', url: `${hA}/invitations`, data: { role: 'ADMIN' } },
      { label: 'revoke invitation', method: 'delete', url: `${hA}/invitations/${w.invitationA}` },
      { label: 'change member role', method: 'patch', url: `${hA}/members/${w.m.userId}`, data: { role: 'OWNER' } },
      { label: 'remove member', method: 'delete', url: `${hA}/members/${w.m.userId}` },
      { label: 'remove owner', method: 'delete', url: `${hA}/members/${w.a.userId}` },
      { label: 'dashboard', method: 'get', url: `${hA}/dashboard` },
      { label: 'items list', method: 'get', url: `${hA}/items` },
      { label: 'items search', method: 'get', url: `${hA}/items?search=Oliven&sort=value` },
      {
        label: 'item create',
        method: 'post',
        url: `${hA}/items`,
        data: {
          name: 'Eingeschleust',
          category: 'KUECHE',
          quantity: '1',
          unit: 'STUECK',
          unitPrice: null,
          imageId: null,
        },
      },
      { label: 'item detail', method: 'get', url: `${hA}/items/${w.itemA}` },
      { label: 'item patch', method: 'patch', url: `${hA}/items/${w.itemA}`, data: { name: 'Gekapert', version: 1 } },
      { label: 'item quantity', method: 'post', url: `${hA}/items/${w.itemA}/quantity`, data: { delta: '-2' } },
      { label: 'item delete', method: 'delete', url: `${hA}/items/${w.itemA}` },
      { label: 'image thumb', method: 'get', url: `${hA}/images/${w.imageA}?variant=thumb` },
      { label: 'image full', method: 'get', url: `${hA}/images/${w.imageA}?variant=full` },
      { label: 'image default', method: 'get', url: `${hA}/images/${w.imageA}` },
      { label: 'image delete', method: 'delete', url: `${hA}/images/${w.imageA}` },
      { label: 'shopping list', method: 'get', url: `${hA}/shopping` },
      { label: 'shopping create', method: 'post', url: `${hA}/shopping/items`, data: { name: 'Eingeschleust' } },
      {
        label: 'shopping patch',
        method: 'patch',
        url: `${hA}/shopping/items/${w.shoppingA}`,
        data: { completed: true },
      },
      { label: 'shopping delete', method: 'delete', url: `${hA}/shopping/items/${w.shoppingA}` },
      { label: 'shopping clear', method: 'post', url: `${hA}/shopping/clear-completed`, data: {} },
      { label: 'conversations', method: 'get', url: `${hA}/conversations` },
      {
        label: 'direct chat with member',
        method: 'post',
        url: `${hA}/conversations/direct`,
        data: { userId: w.a.userId },
      },
      { label: 'messages GET', method: 'get', url: `${hA}/conversations/${w.conversationA}/messages` },
      { label: 'messages GET after', method: 'get', url: `${hA}/conversations/${w.conversationA}/messages?after=0` },
      {
        label: 'messages POST',
        method: 'post',
        url: `${hA}/conversations/${w.conversationA}/messages`,
        data: { clientId: randomUUID(), content: 'Eingeschleust' },
      },
      {
        label: 'mark read',
        method: 'post',
        url: `${hA}/conversations/${w.conversationA}/read`,
        data: { seq: '999999' },
      },
      {
        label: 'active household PUT',
        method: 'put',
        url: '/api/account/active-household',
        data: { householdId: w.hidA },
      },
    ];

    for (const attempt of attempts) {
      const result = await w.c.api.send(attempt.method, attempt.url, attempt.data);
      expect(result.status, `${attempt.method.toUpperCase()} ${attempt.label}`).toBe(404);
      expectNoLeak(attempt.label, result.body);
    }

    // The stranger's own session must be untouched by the PUT: its active household is still its own.
    const me = await w.c.api.get('/api/auth/me');
    expect(me.body.activeHouseholdId).toBe(w.hidC);
    expect(me.body.households.map((h: { id: string }) => h.id)).toEqual([w.hidC]);

    expect(await snapshotOfA(w), 'household A is unchanged after every attempt').toEqual(before);
  });

  test("ids of household A are useless inside the stranger's own household", async ({ world: w }) => {
    const before = await snapshotOfA(w);
    const hC = `/api/households/${w.hidC}`;
    const attempts: Attempt[] = [
      { label: 'item detail', method: 'get', url: `${hC}/items/${w.itemA}` },
      { label: 'item patch', method: 'patch', url: `${hC}/items/${w.itemA}`, data: { name: 'Gekapert', version: 1 } },
      { label: 'item quantity', method: 'post', url: `${hC}/items/${w.itemA}/quantity`, data: { delta: '5' } },
      { label: 'item delete', method: 'delete', url: `${hC}/items/${w.itemA}` },
      { label: 'image GET', method: 'get', url: `${hC}/images/${w.imageA}?variant=full` },
      { label: 'image DELETE', method: 'delete', url: `${hC}/images/${w.imageA}` },
      {
        label: 'shopping patch',
        method: 'patch',
        url: `${hC}/shopping/items/${w.shoppingA}`,
        data: { completed: true },
      },
      { label: 'shopping delete', method: 'delete', url: `${hC}/shopping/items/${w.shoppingA}` },
      { label: 'messages GET', method: 'get', url: `${hC}/conversations/${w.conversationA}/messages` },
      {
        label: 'messages POST',
        method: 'post',
        url: `${hC}/conversations/${w.conversationA}/messages`,
        data: { clientId: randomUUID(), content: 'Eingeschleust' },
      },
      { label: 'mark read', method: 'post', url: `${hC}/conversations/${w.conversationA}/read`, data: { seq: '1' } },
      { label: 'revoke invitation', method: 'delete', url: `${hC}/invitations/${w.invitationA}` },
      { label: 'member role', method: 'patch', url: `${hC}/members/${w.m.userId}`, data: { role: 'ADMIN' } },
      { label: 'remove member', method: 'delete', url: `${hC}/members/${w.m.userId}` },
    ];
    for (const attempt of attempts) {
      const result = await w.c.api.send(attempt.method, attempt.url, attempt.data);
      expect(result.status, `${attempt.method.toUpperCase()} ${attempt.label} via own household`).toBe(404);
      expectNoLeak(attempt.label, result.body);
    }

    // Writing A's ids INTO C's household must fail without creating anything.
    const withForeignImage = await w.c.api.post(`${hC}/items`, {
      name: 'Mit fremdem Bild',
      category: 'KUECHE',
      quantity: '1',
      unit: 'STUECK',
      unitPrice: null,
      imageId: w.imageA,
    });
    expect(withForeignImage.status, 'item referencing a foreign image').toBeGreaterThanOrEqual(400);
    expect(withForeignImage.status).toBeLessThan(500);
    const fromForeignSource = await w.c.api.post(`${hC}/shopping/items`, { sourceItemId: w.itemA });
    expect(fromForeignSource.status, 'shopping item from a foreign inventory item').toBeGreaterThanOrEqual(400);
    expect(fromForeignSource.status).toBeLessThan(500);
    expectNoLeak('shopping from foreign source', fromForeignSource.body);
    const foreignCard = await w.c.api.post(`${hC}/conversations/${w.conversationC}/messages`, {
      clientId: randomUUID(),
      content: 'x',
      kind: 'SHOPPING_ITEM',
      meta: { shoppingItemId: w.shoppingA },
    });
    expect(foreignCard.status, 'shopping card of a foreign item').toBeGreaterThanOrEqual(400);
    expect(foreignCard.status).toBeLessThan(500);
    expectNoLeak('foreign shopping card', foreignCard.body);

    const ownItems = await w.c.api.get(`${hC}/items`);
    expect(ownItems.body.items.map((i: { name: string }) => i.name)).toEqual(['Milch von C']);
    const ownShopping = await w.c.api.get(`${hC}/shopping`);
    expect(ownShopping.body.open).toEqual([]);
    expect(await snapshotOfA(w)).toEqual(before);
  });

  test('a plain member can use household A but not its administration (403, never data)', async ({ world: w }) => {
    const hA = `/api/households/${w.hidA}`;
    // allowed: it is a member
    expect((await w.m.api.get(`${hA}/items/${w.itemA}`)).status).toBe(200);
    expect((await w.m.api.get(`${hA}/images/${w.imageA}?variant=thumb`)).status).toBe(200);

    const forbidden: Attempt[] = [
      { label: 'rename', method: 'patch', url: hA, data: { name: 'Gekapert' } },
      { label: 'delete household', method: 'delete', url: hA },
      { label: 'list invitations', method: 'get', url: `${hA}/invitations` },
      { label: 'create invitation', method: 'post', url: `${hA}/invitations`, data: { role: 'MEMBER' } },
      { label: 'revoke invitation', method: 'delete', url: `${hA}/invitations/${w.invitationA}` },
      { label: 'promote self', method: 'patch', url: `${hA}/members/${w.m.userId}`, data: { role: 'OWNER' } },
      { label: 'remove owner', method: 'delete', url: `${hA}/members/${w.a.userId}` },
    ];
    for (const attempt of forbidden) {
      const result = await w.m.api.send(attempt.method, attempt.url, attempt.data);
      expect(result.status, `member: ${attempt.label}`).toBe(403);
      expect(JSON.stringify(result.body)).not.toContain('"url"');
    }
    const household = await w.a.api.get(hA);
    expect(household.body.name).toBe(SECRET_HOUSEHOLD);
    expect(household.body.members.find((x: { userId: string }) => x.userId === w.m.userId).role).toBe('MEMBER');
  });

  test('anonymous requests get 401, mutations without the CSRF header get 403', async ({ world: w, playwright }) => {
    const anonymous = new ApiClient(await playwright.request.newContext({ baseURL: BASE_URL }));
    const hA = `/api/households/${w.hidA}`;
    for (const url of [
      '/api/auth/me',
      '/api/households',
      hA,
      `${hA}/items`,
      `${hA}/items/${w.itemA}`,
      `${hA}/images/${w.imageA}?variant=thumb`,
      `${hA}/shopping`,
      `${hA}/conversations`,
      `${hA}/conversations/${w.conversationA}/messages`,
      `${hA}/dashboard`,
    ]) {
      const result = await anonymous.get(url);
      expect(result.status, `anonymous GET ${url}`).toBe(401);
      expectNoLeak(url, result.body);
    }
    // with the CSRF header the session check answers 401 …
    for (const [method, url, data] of [
      [
        'post',
        `${hA}/items`,
        { name: 'x', category: 'KUECHE', quantity: '1', unit: 'STUECK', unitPrice: null, imageId: null },
      ],
      ['patch', `${hA}/items/${w.itemA}`, { name: 'x', version: 1 }],
      ['delete', `${hA}/items/${w.itemA}`, undefined],
      ['post', `${hA}/shopping/items`, { name: 'x' }],
      ['post', `${hA}/conversations/${w.conversationA}/messages`, { clientId: randomUUID(), content: 'x' }],
      ['put', '/api/account/active-household', { householdId: w.hidA }],
    ] as const) {
      const result = await anonymous.send(method, url, data);
      expect(result.status, `anonymous ${method.toUpperCase()} ${url}`).toBe(401);
    }
    // … and without it the CSRF guard answers 403 first – for anonymous callers and for the owner alike.
    const noHeader = {} as Record<string, string>;
    expect((await anonymous.post(`${hA}/shopping/items`, { name: 'x' }, noHeader)).status).toBe(403);
    const mutations: Array<[HttpMethod, string, unknown]> = [
      [
        'post',
        `${hA}/items`,
        { name: 'x', category: 'KUECHE', quantity: '1', unit: 'STUECK', unitPrice: null, imageId: null },
      ],
      ['patch', `${hA}/items/${w.itemA}`, { name: 'Gekapert', version: 1 }],
      ['post', `${hA}/items/${w.itemA}/quantity`, { delta: '-1' }],
      ['delete', `${hA}/items/${w.itemA}`, undefined],
      ['post', `${hA}/shopping/items`, { name: 'x' }],
      ['patch', `${hA}/shopping/items/${w.shoppingA}`, { completed: true }],
      ['delete', `${hA}/shopping/items/${w.shoppingA}`, undefined],
      ['post', `${hA}/conversations/${w.conversationA}/messages`, { clientId: randomUUID(), content: 'x' }],
      ['post', `${hA}/conversations/${w.conversationA}/read`, { seq: '1' }],
      ['patch', hA, { name: 'Gekapert' }],
      ['delete', hA, undefined],
      ['post', `${hA}/invitations`, { role: 'MEMBER' }],
      ['put', '/api/account/active-household', { householdId: w.hidA }],
      ['post', '/api/auth/logout', undefined],
    ];
    for (const [method, url, data] of mutations) {
      const result = await w.a.api.send(method, url, data, noHeader);
      expect(result.status, `owner without CSRF header: ${method.toUpperCase()} ${url}`).toBe(403);
      expect(result.body.error?.code).toBe('CSRF');
    }
    // a foreign Origin or a cross-site fetch is rejected even with the header
    const evil = await w.a.api.post(
      `${hA}/shopping/items`,
      { name: 'x' },
      { ...CSRF_HEADERS, Origin: 'http://evil.example' },
    );
    expect(evil.status).toBe(403);
    const crossSite = await w.a.api.post(
      `${hA}/shopping/items`,
      { name: 'x' },
      { ...CSRF_HEADERS, 'Sec-Fetch-Site': 'cross-site' },
    );
    expect(crossSite.status).toBe(403);

    // Still signed in, and nothing changed.
    expect((await w.a.api.get('/api/auth/me')).status).toBe(200);
    const shopping = await w.a.api.get(`${hA}/shopping`);
    expect(shopping.body.open.map((i: { name: string }) => i.name)).toEqual([SECRET_SHOPPING]);
    const item = await w.a.api.get(`${hA}/items/${w.itemA}`);
    expect(item.body.name).toBe(SECRET_NAME);
    expect(item.body.quantity).toBe('2');
    await anonymous.request.dispose();
  });
});

// ── WebSocket ────────────────────────────────────────────────────────────────

interface Recorded {
  event: string;
  payload: unknown;
}

function connect(cookie: string | null): Promise<{ socket: Socket; events: Recorded[] }> {
  const events: Recorded[] = [];
  const socket = io(BASE_URL, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: { ...(cookie ? { cookie: `homi_session=${cookie}` } : {}), origin: BASE_URL },
  });
  socket.onAny((event: string, payload: unknown) => events.push({ event, payload }));
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve({ socket, events }));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.describe('tenant isolation (WebSocket)', () => {
  test('a stranger never receives sync or chat events of household A', async ({ world: w }) => {
    const sockets: Socket[] = [];
    try {
      const a = await connect(w.a.sessionCookie);
      const c = await connect(w.c.sessionCookie);
      sockets.push(a.socket, c.socket);

      // A acts: inventory, shopping, household, chat (a message in the group conversation).
      const hA = `/api/households/${w.hidA}`;
      const created = await w.a.api.post(`${hA}/items`, {
        name: 'Live Artikel 9d3f',
        category: 'BAD',
        quantity: '1',
        unit: 'STUECK',
        unitPrice: '1.00',
        imageId: null,
      });
      expect(created.status).toBe(201);
      await w.a.api.post(`${hA}/items/${created.body.id}/quantity`, { delta: '2' });
      const shopping = await w.a.api.post(`${hA}/shopping/items`, { name: 'Live Einkauf 9d3f' });
      await w.a.api.patch(`${hA}/shopping/items/${shopping.body.id}`, { completed: true });
      await w.a.api.patch(hA, { name: `${SECRET_HOUSEHOLD} live` });
      const sent = await w.a.api.post(`${hA}/conversations/${w.conversationA}/messages`, {
        clientId: randomUUID(),
        content: 'Live Nachricht 9d3f',
      });
      expect(sent.status).toBe(201);
      await w.a.api.post(`${hA}/conversations/${w.conversationA}/read`, { seq: sent.body.seq });
      await w.a.api.delete(`${hA}/items/${created.body.id}`);

      // C acts in its own household – proves C's socket really works (control).
      await w.c.api.post(`/api/households/${w.hidC}/shopping/items`, { name: 'Eigener Einkauf' });

      await expect
        .poll(() => a.events.filter((e) => e.event === 'sync').length, { message: 'A receives its own sync events' })
        .toBeGreaterThanOrEqual(5);
      await expect
        .poll(() => a.events.some((e) => e.event === 'chat:message'), { message: 'A gets the chat message' })
        .toBe(true);
      await expect
        .poll(() => c.events.some((e) => e.event === 'sync'), {
          message: 'C receives sync events of its own household',
        })
        .toBe(true);
      await wait(1500); // anything wrongly routed to C would have arrived by now

      const dump = JSON.stringify(c.events);
      for (const secret of [w.hidA, w.conversationA, w.a.userId, 'Live', SECRET_MESSAGE, SECRET_HOUSEHOLD]) {
        expect(dump, `C's socket saw "${secret}"`).not.toContain(secret);
      }
      for (const event of c.events) {
        const payload = event.payload as { householdId?: string } | undefined;
        if (payload && typeof payload === 'object' && 'householdId' in payload) {
          expect(payload.householdId, `event ${event.event} for another household`).toBe(w.hidC);
        }
      }
      expect(c.events.some((e) => e.event === 'chat:message' || e.event === 'chat:read')).toBe(false);

      // C may not talk into A's conversation over the socket either.
      const ack = await new Promise<{ ok: boolean; error?: unknown }>((resolve) => {
        c.socket
          .timeout(5000)
          .emit(
            'chat:send',
            { conversationId: w.conversationA, clientId: randomUUID(), content: 'Eingeschleust per Socket' },
            (error: Error | null, response: { ok: boolean; error?: unknown }) =>
              resolve(error ? { ok: false, error } : response),
          );
      });
      expect(ack.ok, 'chat:send into a foreign conversation').toBe(false);
      c.socket.emit('chat:read', { conversationId: w.conversationA, seq: '99999999' });
      c.socket.emit('chat:typing', { conversationId: w.conversationA, typing: true });
      await wait(1000);
      expect(
        a.events.some((e) => e.event === 'chat:typing'),
        'A never sees C typing',
      ).toBe(false);
      expect(a.events.filter((e) => e.event === 'chat:message')).toHaveLength(1);
      const messages = await w.a.api.get(`${hA}/conversations/${w.conversationA}/messages`);
      expect(messages.body.messages.map((m: { content: string }) => m.content)).toEqual([
        SECRET_MESSAGE,
        'Live Nachricht 9d3f',
      ]);
      const membersState = messages.body.members as Array<{ userId: string; lastReadSeq: string }>;
      expect(membersState.find((m) => m.userId === w.c.userId)).toBeUndefined();
    } finally {
      for (const socket of sockets) socket.close();
    }
  });

  test('sockets without a valid session are refused; a removed member stops receiving events', async ({ world: w }) => {
    await expect(connect(null)).rejects.toThrow(/UNAUTHORIZED/);
    await expect(connect('not-a-session')).rejects.toThrow(/UNAUTHORIZED/);

    const member = await connect(w.m.sessionCookie);
    try {
      const hA = `/api/households/${w.hidA}`;
      await w.a.api.post(`${hA}/shopping/items`, { name: 'Vor dem Entfernen' });
      await expect.poll(() => member.events.some((e) => e.event === 'sync')).toBe(true);

      const removed = await w.a.api.delete(`${hA}/members/${w.m.userId}`);
      expect(removed.status).toBe(204);
      await wait(800);
      member.events.length = 0;
      await w.a.api.post(`${hA}/shopping/items`, { name: 'Nach dem Entfernen' });
      const sent = await w.a.api.post(`${hA}/conversations/${w.conversationA}/messages`, {
        clientId: randomUUID(),
        content: 'Nach dem Entfernen',
      });
      expect(sent.status).toBe(201);
      await wait(1500);
      const dump = JSON.stringify(member.events.filter((e) => e.event === 'sync' || e.event === 'chat:message'));
      expect(dump).not.toContain(w.hidA);
      expect(dump).not.toContain('Nach dem Entfernen');
      // and the HTTP API agrees
      expect((await w.m.api.get(`${hA}/items`)).status).toBe(404);
    } finally {
      member.socket.close();
    }
  });
});
