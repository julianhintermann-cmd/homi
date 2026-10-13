/**
 * Demo / visual-test seed: creates the sample state of the Homi design ("Homi UI/UX MockUp") through the real
 * HTTP API of a running server (so passwords are hashed, images go through the real image pipeline and every
 * write is validated) and then adjusts timestamps with SQL where the API cannot (message times, activity dates).
 *
 *   npx tsx apps/server/scripts/seed-demo.ts [options]        (or: npm run seed:demo -- [options])
 *
 * What it creates (one new, independent "world" per run – nothing is deleted or truncated):
 *   - users Julian ("Du", the signed-in person of the design), Lisa and Max; household "Unser Zuhause"
 *     (Lisa and Max join through real invitation links)
 *   - 128 inventory items with total value CHF 2'485.50: the 8 items of the design screens (Nespresso Kapseln,
 *     Olivenöl, Batterien AA, Milch, Kaffee, Spülmittel, Küchenpapier, Reis – with their photos) plus 120 more
 *   - shopping list: 8 open + 4 completed items (screens 03 / 03b), the weekly trend "+ CHF 42.80" of screen 01
 *   - chats of screens 04 / 08: household group + direct chats with Lisa and Max, timestamps of the design
 *
 * Safety: refuses to run unless the database name contains "e2e" or "demo" (or --force is given). The database is
 * only used for the timestamp fix-ups; everything else goes through the server at --base-url, which MUST use that
 * same database.
 *
 * Options
 *   --base-url <url>      server to seed (default: $SEED_BASE_URL or http://localhost:4173)
 *   --database-url <url>  database of that server (default: $E2E_DATABASE_URL or $DATABASE_URL, else homi_e2e)
 *   --force               allow a database name without "e2e" / "demo"
 *   --password <pw>       password of the three users (default Sommer-Wiese-2026)
 *   --today <YYYY-MM-DD>  the day the sample messages belong to (default: today in Europe/Zurich)
 *   --design-roles        make Julian "Verwaltung" (ADMIN) like screen 09 – the household then has no owner
 *   --json                print only the result JSON (default: a summary line, then the JSON)
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PRODUCT_DIR = path.join(REPO_ROOT, 'design/assets/products');
const DEFAULT_DATABASE_URL = 'postgresql://homi:homi@localhost:5432/homi_e2e';
const HOUSEHOLD_NAME = 'Unser Zuhause';
const TARGET_ITEM_COUNT = 128;
const TARGET_TOTAL_CENTS = 248_550; // CHF 2'485.50
const TREND_CENTS = 4_280; // "+ CHF 42.80"

// ── CLI ──────────────────────────────────────────────────────────────────────

interface Options {
  baseUrl: string;
  databaseUrl: string;
  force: boolean;
  password: string;
  today: string;
  designRoles: boolean;
  jsonOnly: boolean;
}

function parseArgs(argv: string[]): Options {
  const flag = (name: string) => argv.includes(name);
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    baseUrl: (value('--base-url') ?? process.env.SEED_BASE_URL ?? 'http://localhost:4173').replace(/\/$/, ''),
    databaseUrl:
      value('--database-url') ?? process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    force: flag('--force'),
    password: value('--password') ?? 'Sommer-Wiese-2026',
    today: value('--today') ?? zurichDate(0),
    designRoles: flag('--design-roles'),
    jsonOnly: flag('--json'),
  };
}

export function assertSeedAllowed(databaseUrl: string, force: boolean): void {
  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!force && !/e2e|demo/i.test(name)) {
    throw new Error(
      `Refusing to seed database "${name}": its name must contain "e2e" or "demo" (pass --force to override).`,
    );
  }
}

// ── time helpers (Europe/Zurich, DST-aware) ───────────────────────────────────

const ZURICH = 'Europe/Zurich';

function zurichDate(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZURICH }).format(date);
}

function shiftDate(date: string, days: number): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function zurichOffsetMs(instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZURICH,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant at which the wall clock in Zurich shows `date` + `time` ("HH:MM" or "HH:MM:SS"). */
export function zurichInstant(date: string, time: string): Date {
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  const [h = 0, mi = 0, s = 0] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = wall - zurichOffsetMs(wall);
  return new Date(wall - zurichOffsetMs(first));
}

// ── tiny HTTP client with a cookie jar per person ─────────────────────────────

class Person {
  cookie = '';
  id = '';
  constructor(
    readonly name: string,
    readonly email: string,
    readonly ip: string,
    private readonly baseUrl: string,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API bodies are only inspected, not typed
  async request<T = any>(
    method: string,
    url: string,
    body?: unknown,
    expected: number[] = [200, 201, 204],
  ): Promise<T> {
    const headers: Record<string, string> = { 'X-Forwarded-For': this.ip, 'X-Homi-Request': '1' };
    if (this.cookie) headers.cookie = `homi_session=${this.cookie}`;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let response = await fetch(`${this.baseUrl}${url}`, { method, headers, body: payload });
    // The per-user write limits apply to the seed as well: wait as told and try again.
    for (let attempt = 0; response.status === 429 && !expected.includes(429) && attempt < 5; attempt += 1) {
      const waitSeconds = Number(response.headers.get('retry-after')) || 1;
      await response.arrayBuffer();
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitSeconds, 60) * 1000));
      response = await fetch(`${this.baseUrl}${url}`, { method, headers, body: payload });
    }
    for (const cookie of response.headers.getSetCookie()) {
      const match = /^homi_session=([^;]*)/.exec(cookie);
      if (match?.[1]) this.cookie = match[1];
    }
    const text = await response.text();
    if (!expected.includes(response.status)) {
      throw new Error(`${this.name}: ${method} ${url} → ${response.status} ${text.slice(0, 300)}`);
    }
    return (text ? JSON.parse(text) : null) as T;
  }
}

function randomIp(): string {
  const [a = 1, b = 1, c = 1] = randomBytes(3);
  return `10.${a}.${b}.${(c % 253) + 1}`;
}

/** FNV-1a – the same hash as `apps/web/src/components/utils.ts` (decides the avatar tint of other people). */
function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// ── sample data ────────────────────────────────────────────────────────────────

interface NamedItem {
  name: string;
  category: 'KUECHE' | 'TECHNIK';
  quantity: string;
  unit: 'STUECK' | 'FLASCHE' | 'PACKUNG' | 'ROLLE';
  unitPrice: string;
  image: string;
}

/** Display order of screen 02 (top → bottom). They are created in reverse so "Zuletzt geändert" lists them like this. */
const NAMED_ITEMS: NamedItem[] = [
  {
    name: 'Nespresso Kapseln',
    category: 'KUECHE',
    quantity: '24',
    unit: 'STUECK',
    unitPrice: '0.54',
    image: 'caps.png',
  },
  { name: 'Olivenöl', category: 'KUECHE', quantity: '2', unit: 'FLASCHE', unitPrice: '8.50', image: 'oil.png' },
  { name: 'Batterien AA', category: 'TECHNIK', quantity: '8', unit: 'STUECK', unitPrice: '0.75', image: 'batt4.png' },
  { name: 'Milch', category: 'KUECHE', quantity: '3', unit: 'STUECK', unitPrice: '1.55', image: 'milk.png' },
  { name: 'Kaffee', category: 'KUECHE', quantity: '2', unit: 'PACKUNG', unitPrice: '7.95', image: 'coffee.png' },
  { name: 'Spülmittel', category: 'KUECHE', quantity: '1', unit: 'FLASCHE', unitPrice: '3.20', image: 'soap4.png' },
  { name: 'Küchenpapier', category: 'KUECHE', quantity: '4', unit: 'ROLLE', unitPrice: '1.45', image: 'towel.png' },
  { name: 'Reis', category: 'KUECHE', quantity: '1', unit: 'PACKUNG', unitPrice: '2.95', image: 'rice.png' },
];

const OPEN_SHOPPING = [
  ['Milch', '2', 'LITER'],
  ['Eier', '12', 'STUECK'],
  ['Spülmittel', '1', 'FLASCHE'],
  ['Reis', '1', 'PACKUNG'],
  ['Butter', '250', 'GRAMM'],
  ['Küchenpapier', '1', 'PACKUNG'],
  ['Tomaten', '500', 'GRAMM'],
  ['Bananen', '6', 'STUECK'],
] as const;

const COMPLETED_SHOPPING = [
  ['Brot', '1', 'STUECK'],
  ['Joghurt', '4', 'BECHER'],
  ['Äpfel', '1', 'KILOGRAMM'],
  ['Zahnpasta', '1', 'TUBE'],
] as const;

const FILLER_BASES: Array<[string, 'KUECHE' | 'BAD' | 'WOHNZIMMER' | 'TECHNIK' | 'SONSTIGES']> = [
  ['Salz', 'KUECHE'],
  ['Pfeffer', 'KUECHE'],
  ['Zucker', 'KUECHE'],
  ['Mehl', 'KUECHE'],
  ['Teigwaren', 'KUECHE'],
  ['Haferflocken', 'KUECHE'],
  ['Tee', 'KUECHE'],
  ['Honig', 'KUECHE'],
  ['Konfitüre', 'KUECHE'],
  ['Alufolie', 'KUECHE'],
  ['Backpapier', 'KUECHE'],
  ['Schwamm', 'KUECHE'],
  ['Zahnbürste', 'BAD'],
  ['Shampoo', 'BAD'],
  ['Seife', 'BAD'],
  ['Toilettenpapier', 'BAD'],
  ['Wattestäbchen', 'BAD'],
  ['Handtuch', 'BAD'],
  ['Kerzen', 'WOHNZIMMER'],
  ['Zündhölzer', 'WOHNZIMMER'],
  ['Pflanzendünger', 'WOHNZIMMER'],
  ['Glühbirne', 'WOHNZIMMER'],
  ['Kissenbezug', 'WOHNZIMMER'],
  ['USB-Kabel', 'TECHNIK'],
  ['HDMI-Kabel', 'TECHNIK'],
  ['Steckdosenleiste', 'TECHNIK'],
  ['Ladegerät', 'TECHNIK'],
  ['Klebeband', 'SONSTIGES'],
  ['Briefumschläge', 'SONSTIGES'],
  ['Kehrichtsäcke', 'SONSTIGES'],
];
const FILLER_SUFFIXES = ['', ' (Vorrat)', ' (gross)', ' (klein)'];

const cents = (value: number) => (value / 100).toFixed(2);

// ── seeding ────────────────────────────────────────────────────────────────────

export interface SeedResult {
  baseUrl: string;
  password: string;
  today: string;
  householdId: string;
  householdName: string;
  users: Record<'julian' | 'lisa' | 'max', { id: string; email: string; displayName: string; sessionCookie: string }>;
  itemIds: Record<string, string>;
  shoppingIds: Record<string, string>;
  conversations: { group: string; lisa: string; max: string };
  inventoryCount: number;
  inventoryTotal: string;
  weeklyDelta: string;
}

export async function seedDemo(options: Options): Promise<SeedResult> {
  assertSeedAllowed(options.databaseUrl, options.force);
  const log = (message: string) => {
    if (!options.jsonOnly) console.error(`[seed-demo] ${message}`);
  };
  const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 2 });
  try {
    const health = await fetch(`${options.baseUrl}/api/health`).catch(() => null);
    if (!health?.ok) throw new Error(`The server at ${options.baseUrl} is not reachable (GET /api/health failed).`);

    const suffix = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
    const register = async (name: string, wantedTone?: 'sand' | 'mist'): Promise<Person> => {
      // The avatar tint of "the others" derives from the user id (sand/mist): re-register until it is the
      // design's colour for that person (Lisa = sand, Max = mist). Rejected accounts are deleted again.
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const person = new Person(
          name,
          `${name.toLowerCase()}-${suffix}${attempt || ''}@homi.test`,
          randomIp(),
          options.baseUrl,
        );
        const me = await person.request('POST', '/api/auth/register', {
          displayName: name,
          email: person.email,
          password: options.password,
        });
        person.id = me.user.id;
        const tone = (['sand', 'mist'] as const)[stableHash(person.id) % 2];
        if (!wantedTone || tone === wantedTone) return person;
        await pool.query('DELETE FROM "User" WHERE id = $1', [person.id]);
      }
      throw new Error(`could not create a user with avatar tone ${wantedTone}`);
    };

    const julian = await register('Julian');
    const lisa = await register('Lisa', 'sand');
    const max = await register('Max', 'mist');
    log('users created');

    // ── household + invitations ──
    const household = await julian.request('POST', '/api/households', { name: HOUSEHOLD_NAME });
    const hid: string = household.id;
    for (const member of [lisa, max]) {
      const invitation = await julian.request('POST', `/api/households/${hid}/invitations`, { role: 'MEMBER' });
      await member.request('POST', `/api/invitations/${String(invitation.url).split('/').pop()}/accept`);
    }
    if (options.designRoles) {
      await pool.query('UPDATE "HouseholdMember" SET role = \'ADMIN\' WHERE "householdId" = $1 AND "userId" = $2', [
        hid,
        julian.id,
      ]);
    }
    log(`household ${hid} with 3 members`);

    // ── photos through the real image pipeline ──
    const imageIds = new Map<string, string>();
    for (const file of new Set(NAMED_ITEMS.map((item) => item.image))) {
      const form = new FormData();
      form.append('file', new Blob([await readFile(path.join(PRODUCT_DIR, file))], { type: 'image/png' }), file);
      const uploaded = await julian.request('POST', `/api/households/${hid}/images`, form);
      imageIds.set(file, uploaded.id);
    }

    // ── inventory ──
    const namedCents = NAMED_ITEMS.reduce(
      (sum, item) => sum + Math.round(Number(item.quantity) * Number(item.unitPrice) * 100),
      0,
    );
    // "Duschgel" carries the weekly trend: created with 5 pieces, then +20 pieces (= + CHF 42.80 in the last 7 days).
    const trendPrice = 214;
    const trendTotal = 25 * trendPrice;
    const fillerCount = TARGET_ITEM_COUNT - NAMED_ITEMS.length - 1;
    const fillerBudget = TARGET_TOTAL_CENTS - namedCents - trendTotal;
    const baseCents = Math.floor(fillerBudget / fillerCount);
    const lastCents = fillerBudget - baseCents * (fillerCount - 1);

    const itemIds: Record<string, string> = {};
    const createItem = async (
      name: string,
      category: string,
      quantity: string,
      unit: string,
      unitPrice: string,
      imageId: string | null,
    ) => {
      const item = await julian.request('POST', `/api/households/${hid}/items`, {
        name,
        category,
        quantity,
        unit,
        unitPrice,
        imageId,
      });
      itemIds[name] = item.id;
      return item;
    };
    const trend = await createItem('Duschgel', 'BAD', '5', 'FLASCHE', cents(trendPrice), null);
    await julian.request('POST', `/api/households/${hid}/items/${trend.id}/quantity`, { delta: '20' });

    const fillers: Array<{ name: string; category: string; price: number }> = [];
    for (let index = 0; fillers.length < fillerCount; index += 1) {
      const [base, category] = FILLER_BASES[index % FILLER_BASES.length] ?? FILLER_BASES[0]!;
      const variant = FILLER_SUFFIXES[Math.floor(index / FILLER_BASES.length) % FILLER_SUFFIXES.length] ?? '';
      const round = Math.floor(index / (FILLER_BASES.length * FILLER_SUFFIXES.length));
      fillers.push({
        name: `${base}${variant}${round > 0 ? ` ${round + 1}` : ''}`,
        category,
        price: fillers.length === fillerCount - 1 ? lastCents : baseCents,
      });
    }
    for (let start = 0; start < fillers.length; start += 6) {
      await Promise.all(
        fillers
          .slice(start, start + 6)
          .map((filler) => createItem(filler.name, filler.category, '1', 'STUECK', cents(filler.price), null)),
      );
    }
    for (const item of [...NAMED_ITEMS].reverse()) {
      await createItem(
        item.name,
        item.category,
        item.quantity,
        item.unit,
        item.unitPrice,
        imageIds.get(item.image) ?? null,
      );
    }
    // The activities of the setup are older than a week, only the quantity change of "Duschgel" is "this week".
    await pool.query(
      `UPDATE "HouseholdActivity" SET "createdAt" = (now() AT TIME ZONE 'UTC') - interval '10 days'
       WHERE "householdId" = $1 AND type <> 'ITEM_QUANTITY_CHANGED'`,
      [hid],
    );
    log(`inventory: ${Object.keys(itemIds).length} items`);

    // ── shopping list ──
    const shoppingIds: Record<string, string> = {};
    for (const [name, quantity, unit] of OPEN_SHOPPING) {
      const created = await julian.request('POST', `/api/households/${hid}/shopping/items`, { name, quantity, unit });
      shoppingIds[name] = created.id;
    }
    for (const [name, quantity, unit] of COMPLETED_SHOPPING) {
      const created = await julian.request('POST', `/api/households/${hid}/shopping/items`, { name, quantity, unit });
      await julian.request('PATCH', `/api/households/${hid}/shopping/items/${created.id}`, { completed: true });
      shoppingIds[name] = created.id;
    }
    log('shopping list: 8 open + 4 completed');

    // ── chats ──
    const conversations = await julian.request<Array<{ id: string; type: string }>>(
      'GET',
      `/api/households/${hid}/conversations`,
    );
    const group = conversations.find((conversation) => conversation.type === 'HOUSEHOLD')?.id ?? '';
    const withLisa = (await julian.request('POST', `/api/households/${hid}/conversations/direct`, { userId: lisa.id }))
      .id as string;
    const withMax = (await julian.request('POST', `/api/households/${hid}/conversations/direct`, { userId: max.id }))
      .id as string;
    const today = options.today;
    const yesterday = shiftDate(today, -1);
    const stamps: Array<{ id: string; at: Date }> = [];
    const say = async (
      from: Person,
      conversationId: string,
      content: string,
      at: Date,
      extra: { kind?: 'SHOPPING_ITEM'; meta?: unknown } = {},
    ): Promise<{ id: string; seq: string }> => {
      const message = await from.request('POST', `/api/households/${hid}/conversations/${conversationId}/messages`, {
        clientId: randomUUID(),
        content,
        ...extra,
      });
      stamps.push({ id: message.id, at });
      return message;
    };
    const read = (who: Person, conversationId: string, seq: string) =>
      who.request('POST', `/api/households/${hid}/conversations/${conversationId}/read`, { seq });
    const at = (date: string, time: string) => zurichInstant(date, time);

    // screen 08: the conversation with Lisa
    await say(lisa, withLisa, 'Hey, haben wir noch Kaffee zuhause?', at(today, '08:12'));
    await say(julian, withLisa, 'Ja, wir haben noch zwei Packungen ☕', at(today, '08:13'));
    await say(lisa, withLisa, 'Perfekt! Dann brauchen wir nur noch Milch.', at(today, '08:14'));
    await say(julian, withLisa, 'Ich setze sie auf die Einkaufsliste.', at(today, '08:15'));
    const card = await say(julian, withLisa, 'Milch · 2 Liter', at(today, '08:15:30'), {
      kind: 'SHOPPING_ITEM',
      meta: { shoppingItemId: shoppingIds.Milch },
    });
    await read(lisa, withLisa, card.seq); // "Gelesen"
    // screen 04: Lisa's newest message (read by Du)
    const newest = await say(lisa, withLisa, 'Kannst du noch Milch mitbringen?', at(today, '13:48'));
    await read(julian, withLisa, newest.seq);
    // Max: yesterday
    await say(julian, withMax, 'Ich habe den Müll rausgebracht.', at(yesterday, '18:40'));
    const thanks = await say(max, withMax, 'Perfekt, danke!', at(yesterday, '18:42'));
    await read(julian, withMax, thanks.seq);
    // household chat: two unread messages from Lisa
    const mine = await say(julian, group, 'Wer geht heute einkaufen?', at(today, '14:05'));
    await read(julian, group, mine.seq);
    await say(lisa, group, 'Ich gehe nachher.', at(today, '14:20'));
    await say(lisa, group, 'Ich habe die Einkaufsliste aktualisiert.', at(today, '14:32'));

    for (const stamp of stamps) {
      // Prisma stores UTC in `timestamp(3)` columns: hand over a zone-less UTC string, not a Date (node-pg would
      // serialise it with the local offset, which PostgreSQL silently drops for `timestamp`).
      await pool.query('UPDATE "Message" SET "createdAt" = $2 WHERE id = $1', [
        stamp.id,
        stamp.at.toISOString().slice(0, 23),
      ]);
    }
    await pool.query(
      `UPDATE "Conversation" c SET "lastMessageAt" = (SELECT max(m."createdAt") FROM "Message" m WHERE m."conversationId" = c.id)
       WHERE c."householdId" = $1`,
      [hid],
    );
    // Everybody has been in these conversations for a month, so the (backdated) messages are not "before joining".
    // (staggered by a day so the member order – Julian, Lisa, Max – is deterministic)
    for (const [index, person] of [julian, lisa, max].entries()) {
      const joined = `(now() AT TIME ZONE 'UTC') - interval '${30 - index} days'`;
      await pool.query(
        `UPDATE "ConversationMember" SET "joinedAt" = ${joined}
         WHERE "userId" = $2 AND "conversationId" IN (SELECT id FROM "Conversation" WHERE "householdId" = $1)`,
        [hid, person.id],
      );
      await pool.query(
        `UPDATE "HouseholdMember" SET "joinedAt" = ${joined} WHERE "householdId" = $1 AND "userId" = $2`,
        [hid, person.id],
      );
    }
    log('chats created');

    // ── verification against the design numbers ──
    const dashboard = await julian.request('GET', `/api/households/${hid}/dashboard`);
    if (dashboard.itemCount !== TARGET_ITEM_COUNT || dashboard.inventoryValue !== cents(TARGET_TOTAL_CENTS)) {
      throw new Error(`unexpected totals: ${dashboard.itemCount} items, CHF ${dashboard.inventoryValue}`);
    }
    if (dashboard.weeklyValueDelta !== cents(TREND_CENTS) || dashboard.openShoppingCount !== 8) {
      throw new Error(`unexpected trend/open count: ${dashboard.weeklyValueDelta} / ${dashboard.openShoppingCount}`);
    }

    const user = (person: Person) => ({
      id: person.id,
      email: person.email,
      displayName: person.name,
      sessionCookie: person.cookie,
    });
    return {
      baseUrl: options.baseUrl,
      password: options.password,
      today,
      householdId: hid,
      householdName: HOUSEHOLD_NAME,
      users: { julian: user(julian), lisa: user(lisa), max: user(max) },
      itemIds,
      shoppingIds,
      conversations: { group, lisa: withLisa, max: withMax },
      inventoryCount: dashboard.itemCount,
      inventoryTotal: dashboard.inventoryValue,
      weeklyDelta: dashboard.weeklyValueDelta,
    };
  } finally {
    await pool.end();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const options = parseArgs(process.argv.slice(2));
  seedDemo(options)
    .then((result) => {
      if (!options.jsonOnly) {
        console.error(
          `[seed-demo] done: household ${result.householdId}, ${result.inventoryCount} items, CHF ${result.inventoryTotal}, ` +
            `trend +CHF ${result.weeklyDelta}. Sign in as ${result.users.julian.email} / ${result.password}`,
        );
      }
      console.log(JSON.stringify(result));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
