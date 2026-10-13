import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodeItemCursor } from '../../src/modules/inventory/list';
import { buildTestApp, type TestApp } from '../helpers/app';
import { createHousehold, createLoggedInUser, type TestHousehold } from '../helpers/fixtures';
import type { TestClient } from '../helpers/http';

/*
 * Integration-phase regressions that cut across feature modules:
 *  - percent-encoded `/api` prefixes must not skip the global CSRF / session hooks (lib/api-path.ts);
 *  - NUL and other control characters in free text are a 400, never a 500 (shared schemas + the
 *    PostgreSQL 22021 mapping in plugins/errors.ts).
 */

describe('cross-cutting request hygiene', () => {
  let t: TestApp;
  let client: TestClient;
  let household: TestHousehold;
  let userId: string;

  beforeAll(async () => {
    t = await buildTestApp();
    const owner = await createLoggedInUser(t.app);
    client = owner.client;
    userId = owner.user.id;
    household = await createHousehold(t.prisma, owner.user.id, 'WG Basel');
  });
  afterAll(() => t.close());

  describe('percent-encoded /api prefix (all modules, not only auth/account)', () => {
    it('answers 403 CSRF without the header and 404 with it – the route never runs', async () => {
      const foreign = { csrf: false, origin: 'https://sibling.example', headers: { 'sec-fetch-site': 'same-site' } };
      const noHeader = await client.post('/%61pi/households', { name: 'Fremd' }, foreign);
      expect(noHeader.statusCode).toBe(403);
      expect(noHeader.json()).toMatchObject({ error: { code: 'CSRF' } });

      expect((await client.post('/%61pi/households', { name: 'Kodiert' })).statusCode).toBe(404);
      expect(
        (await client.post(`/a%70i/households/${household.id}/shopping/items`, { name: 'Milch' })).statusCode,
      ).toBe(404);
      expect((await client.get('/%61pi/households')).statusCode).toBe(404);
      expect((await client.get(`/%61pi/households/${household.id}/dashboard`)).statusCode).toBe(404);

      expect(await t.prisma.household.count({ where: { name: { in: ['Fremd', 'Kodiert'] } } })).toBe(0);
      expect(await t.prisma.shoppingItem.count({ where: { householdId: household.id } })).toBe(0);
      expect((await client.get('/api/households')).statusCode).toBe(200); // canonical path unaffected
    });
  });

  describe('NUL / control characters in free text', () => {
    const NUL = 'Ol\u0000ivenöl';

    function expectValidation(response: { statusCode: number; json: () => unknown }): void {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'VALIDATION' } });
    }

    it('household create / rename', async () => {
      expectValidation(await client.post('/api/households', { name: NUL }));
      expectValidation(await client.patch(`/api/households/${household.id}`, { name: 'WG\nBasel' }));
    });

    it('inventory item create / update and list search', async () => {
      const base = `/api/households/${household.id}/items`;
      expectValidation(await client.post(base, { name: NUL }));
      const created = await client.post(base, { name: 'Olivenöl' });
      expect(created.statusCode).toBe(201);
      const item = created.json() as { id: string; version: number };
      expectValidation(await client.patch(`${base}/${item.id}`, { name: NUL, version: item.version }));
      expectValidation(await client.get(base, { query: { search: 'Ol\u0000' } }));
    });

    it('a NUL smuggled into the opaque list cursor reaches PostgreSQL and is mapped to 400', async () => {
      const cursor = encodeItemCursor({ s: 'name', n: 'a\u0000b', id: household.id });
      const response = await client.get(`/api/households/${household.id}/items`, { query: { cursor } });
      expectValidation(response);
    });

    it('shopping item and chat message', async () => {
      expectValidation(await client.post(`/api/households/${household.id}/shopping/items`, { name: NUL }));
      const messages = `/api/households/${household.id}/conversations/${household.conversationId}/messages`;
      for (const content of ['hallo\u0000welt', 'hallo\u001Bwelt']) {
        // A valid clientId (8–64 chars), so the rejection is about the content.
        const response = await client.post(messages, { clientId: 'client-id-rejected', content });
        expectValidation(response);
        expect(response.json()).toMatchObject({ error: { details: { fieldErrors: { content: expect.any(String) } } } });
      }
      const multiLine = await client.post(messages, { clientId: 'client-id-accepted', content: 'Zeile 1\nZeile 2' });
      expect(multiLine.statusCode).toBe(201);
      expect(multiLine.json()).toMatchObject({ content: 'Zeile 1\nZeile 2' });
    });

    it('stored nothing for the rejected requests', async () => {
      const names = await t.prisma.inventoryItem.findMany({
        where: { householdId: household.id },
        select: { name: true },
      });
      expect(names).toEqual([{ name: 'Olivenöl' }]);
      expect(await t.prisma.household.count({ where: { members: { some: { userId } } } })).toBe(1);
    });
  });
});
