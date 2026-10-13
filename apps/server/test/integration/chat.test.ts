import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConversationDto, MessageDto, MessagePage, ReadCursorResponse } from '@homi/shared';
import { buildTestApp, type TestApp } from '../helpers/app';
import { addMember, createHousehold, createLoggedInUser, type TestHousehold } from '../helpers/fixtures';
import type { TestClient } from '../helpers/http';

/*
 * Chat HTTP API (§5 "Chat"): membership enforcement, direct-chat uniqueness, idempotent sends,
 * ordering/pagination, unread counts, read cursors and SHOPPING_ITEM validation.
 */

interface Actor {
  id: string;
  client: TestClient;
}

interface World {
  household: TestHousehold;
  owner: Actor;
  lisa: Actor;
  max: Actor;
  /** Member of another household only. */
  eve: Actor;
  otherHousehold: TestHousehold;
}

const conversationsUrl = (hid: string) => `/api/households/${hid}/conversations`;
const messagesUrl = (hid: string, cid: string) => `/api/households/${hid}/conversations/${cid}/messages`;
const readUrl = (hid: string, cid: string) => `/api/households/${hid}/conversations/${cid}/read`;

function clientId(): string {
  return `c-${randomUUID()}`;
}

describe('chat HTTP API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function actor(displayName: string): Promise<Actor> {
    const { user, client } = await createLoggedInUser(t.app, { displayName });
    return { id: user.id, client };
  }

  async function world(name = 'Unser Zuhause'): Promise<World> {
    const owner = await actor('Julian');
    const lisa = await actor('Lisa');
    const max = await actor('Max');
    const eve = await actor('Eve');
    const household = await createHousehold(t.prisma, owner.id, name);
    await addMember(t.prisma, household, lisa.id);
    await addMember(t.prisma, household, max.id);
    const otherHousehold = await createHousehold(t.prisma, eve.id, 'Andere WG');
    return { household, owner, lisa, max, eve, otherHousehold };
  }

  async function direct(from: Actor, hid: string, userId: string): Promise<ConversationDto> {
    const response = await from.client.post(`${conversationsUrl(hid)}/direct`, { userId });
    expect([200, 201]).toContain(response.statusCode);
    return response.json<ConversationDto>();
  }

  async function send(from: Actor, hid: string, cid: string, content: string, id = clientId()): Promise<MessageDto> {
    const response = await from.client.post(messagesUrl(hid, cid), { clientId: id, content });
    expect(response.statusCode).toBe(201);
    return response.json<MessageDto>();
  }

  async function list(from: Actor, hid: string): Promise<ConversationDto[]> {
    const response = await from.client.get(conversationsUrl(hid));
    expect(response.statusCode).toBe(200);
    return response.json<ConversationDto[]>();
  }

  describe('conversations', () => {
    it('lists the household chat with the household name as title', async () => {
      const w = await world();
      const conversations = await list(w.owner, w.household.id);
      expect(conversations).toEqual([
        expect.objectContaining({
          id: w.household.conversationId,
          type: 'HOUSEHOLD',
          title: 'Unser Zuhause',
          lastMessage: null,
          unreadCount: 0,
        }),
      ]);
      expect(conversations[0]?.members.map((member) => member.displayName).sort()).toEqual(['Julian', 'Lisa', 'Max']);
    });

    it('requires a session and household membership (404 for strangers)', async () => {
      const w = await world();
      expect((await t.client().get(conversationsUrl(w.household.id))).statusCode).toBe(401);
      const stranger = await w.eve.client.get(conversationsUrl(w.household.id));
      expect(stranger.statusCode).toBe(404);
      expect(stranger.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
      expect((await w.owner.client.get(conversationsUrl('not-a-uuid'))).statusCode).toBe(404);
      // Eve only sees her own household's conversation.
      const own = await list(w.eve, w.otherHousehold.id);
      expect(own.map((conversation) => conversation.id)).toEqual([w.otherHousehold.conversationId]);
    });

    it('only lists conversations the caller is a member of', async () => {
      const w = await world();
      const chat = await direct(w.owner, w.household.id, w.lisa.id);
      const forMax = await list(w.max, w.household.id);
      expect(forMax.map((conversation) => conversation.id)).not.toContain(chat.id);
      const forLisa = await list(w.lisa, w.household.id);
      expect(forLisa.find((conversation) => conversation.id === chat.id)?.title).toBe('Julian');
    });

    it('orders by the latest message, conversations without messages last', async () => {
      const w = await world();
      const withLisa = await direct(w.owner, w.household.id, w.lisa.id);
      const withMax = await direct(w.owner, w.household.id, w.max.id);
      await send(w.owner, w.household.id, withMax.id, 'Hallo Max');
      await send(w.lisa, w.household.id, withLisa.id, 'Hallo Julian');
      const ids = (await list(w.owner, w.household.id)).map((conversation) => conversation.id);
      expect(ids).toEqual([withLisa.id, withMax.id, w.household.conversationId]);

      await send(w.max, w.household.id, w.household.conversationId, 'Neu in der Gruppe');
      const reordered = (await list(w.owner, w.household.id)).map((conversation) => conversation.id);
      expect(reordered).toEqual([w.household.conversationId, withLisa.id, withMax.id]);
    });
  });

  describe('direct conversations', () => {
    it('get-or-creates exactly one conversation per pair (both directions)', async () => {
      const w = await world();
      const first = await w.owner.client.post(`${conversationsUrl(w.household.id)}/direct`, { userId: w.lisa.id });
      expect(first.statusCode).toBe(201);
      const created = first.json<ConversationDto>();
      expect(created).toMatchObject({ type: 'DIRECT', title: 'Lisa', lastMessage: null, unreadCount: 0 });
      expect(created.members.map((member) => member.userId).sort()).toEqual([w.owner.id, w.lisa.id].sort());

      const again = await w.owner.client.post(`${conversationsUrl(w.household.id)}/direct`, { userId: w.lisa.id });
      expect(again.statusCode).toBe(200);
      expect(again.json<ConversationDto>().id).toBe(created.id);

      const reverse = await direct(w.lisa, w.household.id, w.owner.id.toUpperCase());
      expect(reverse.id).toBe(created.id);
      expect(reverse.title).toBe('Julian');

      const rows = await t.prisma.conversation.count({ where: { householdId: w.household.id, type: 'DIRECT' } });
      expect(rows).toBe(1);
    });

    it('creates one conversation under concurrent requests', async () => {
      const w = await world();
      const responses = await Promise.all([
        w.owner.client.post(`${conversationsUrl(w.household.id)}/direct`, { userId: w.max.id }),
        w.max.client.post(`${conversationsUrl(w.household.id)}/direct`, { userId: w.owner.id }),
        w.owner.client.post(`${conversationsUrl(w.household.id)}/direct`, { userId: w.max.id }),
      ]);
      const ids = new Set(responses.map((response) => response.json<ConversationDto>().id));
      expect(responses.every((response) => [200, 201].includes(response.statusCode))).toBe(true);
      expect(ids.size).toBe(1);
    });

    it('rejects yourself, non-members and strangers', async () => {
      const w = await world();
      const self = await w.owner.client.post(`${conversationsUrl(w.household.id)}/direct`, { userId: w.owner.id });
      expect(self.statusCode).toBe(400);
      const outsider = await w.owner.client.post(`${conversationsUrl(w.household.id)}/direct`, { userId: w.eve.id });
      expect(outsider.statusCode).toBe(404);
      const unknown = await w.owner.client.post(`${conversationsUrl(w.household.id)}/direct`, {
        userId: randomUUID(),
      });
      expect(unknown.statusCode).toBe(404);
      const stranger = await w.eve.client.post(`${conversationsUrl(w.household.id)}/direct`, { userId: w.lisa.id });
      expect(stranger.statusCode).toBe(404);
      const invalid = await w.owner.client.post(`${conversationsUrl(w.household.id)}/direct`, { userId: 'lisa' });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ error: { code: 'VALIDATION' } });
    });

    it('requires the CSRF header', async () => {
      const w = await world();
      const response = await w.owner.client.post(
        `${conversationsUrl(w.household.id)}/direct`,
        { userId: w.lisa.id },
        { csrf: false },
      );
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: 'CSRF' } });
    });

    it('keeps the partner name after they left the household', async () => {
      const w = await world();
      const chat = await direct(w.owner, w.household.id, w.lisa.id);
      await send(w.lisa, w.household.id, chat.id, 'Tschüss!');
      await t.prisma.conversationMember.deleteMany({ where: { userId: w.lisa.id } });
      await t.prisma.householdMember.deleteMany({ where: { userId: w.lisa.id, householdId: w.household.id } });
      const conversation = (await list(w.owner, w.household.id)).find((entry) => entry.id === chat.id);
      expect(conversation?.title).toBe('Lisa');
      expect(conversation?.members.map((member) => member.userId)).toEqual([w.owner.id]);
      // Lisa no longer has access.
      expect((await w.lisa.client.get(messagesUrl(w.household.id, chat.id))).statusCode).toBe(404);
    });
  });

  describe('messages', () => {
    it('stores a message and returns the DTO with a string seq', async () => {
      const w = await world();
      const id = clientId();
      const response = await w.owner.client.post(messagesUrl(w.household.id, w.household.conversationId), {
        clientId: id,
        content: '  Hey, haben wir noch Kaffee zuhause?  ',
      });
      expect(response.statusCode).toBe(201);
      const message = response.json<MessageDto>();
      expect(message).toMatchObject({
        conversationId: w.household.conversationId,
        sender: { id: w.owner.id, displayName: 'Julian' },
        kind: 'TEXT',
        content: 'Hey, haben wir noch Kaffee zuhause?',
        meta: null,
        clientId: id,
      });
      expect(message.seq).toMatch(/^\d+$/);
      const conversation = await t.prisma.conversation.findUniqueOrThrow({
        where: { id: w.household.conversationId },
      });
      expect(conversation.lastMessageAt?.toISOString()).toBe(message.createdAt);
    });

    it('is idempotent per (conversation, sender, clientId)', async () => {
      const w = await world();
      const id = clientId();
      const url = messagesUrl(w.household.id, w.household.conversationId);
      const first = await w.owner.client.post(url, { clientId: id, content: 'Einmal' });
      const retry = await w.owner.client.post(url, { clientId: id, content: 'Einmal (Wiederholung)' });
      expect(first.statusCode).toBe(201);
      expect(retry.statusCode).toBe(200);
      expect(retry.json<MessageDto>()).toEqual(first.json<MessageDto>());

      // Concurrent retries of one clientId still produce a single row.
      const concurrentId = clientId();
      const concurrent = await Promise.all(
        Array.from({ length: 4 }, () => w.owner.client.post(url, { clientId: concurrentId, content: 'Parallel' })),
      );
      expect(new Set(concurrent.map((response) => response.json<MessageDto>().id)).size).toBe(1);

      // The same clientId from another sender is a different message.
      const other = await w.lisa.client.post(url, { clientId: id, content: 'Von Lisa' });
      expect(other.statusCode).toBe(201);
      expect(other.json<MessageDto>().id).not.toBe(first.json<MessageDto>().id);

      const rows = await t.prisma.message.count({ where: { conversationId: w.household.conversationId } });
      expect(rows).toBe(3);
    });

    it('validates the body', async () => {
      const w = await world();
      const url = messagesUrl(w.household.id, w.household.conversationId);
      for (const body of [
        { clientId: clientId(), content: '   ' },
        { clientId: clientId(), content: 'x'.repeat(4001) },
        { clientId: 'kurz', content: 'Hallo' },
        { clientId: 'ungültig mit leerzeichen', content: 'Hallo' },
        { content: 'Hallo' },
        { clientId: clientId(), content: 'Hallo', kind: 'IMAGE' },
        // Regression (review): U+0000 cannot be stored by PostgreSQL and used to end in a 500.
        { clientId: clientId(), content: 'hallo\u0000welt' },
      ]) {
        const response = await w.owner.client.post(url, body);
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ error: { code: 'VALIDATION' } });
      }
      expect(await t.prisma.message.count({ where: { conversationId: w.household.conversationId } })).toBe(0);
    });

    it('enforces conversation membership on every route', async () => {
      const w = await world();
      const chat = await direct(w.owner, w.household.id, w.lisa.id);
      await send(w.owner, w.household.id, chat.id, 'Nur für Lisa');

      const attempts: Array<[Actor, string, string]> = [
        // household member, but not part of the direct chat
        [w.max, w.household.id, chat.id],
        // member of another household, using the real household id
        [w.eve, w.household.id, chat.id],
        // member of another household, using their own household id
        [w.eve, w.otherHousehold.id, chat.id],
        // conversation of another household under the caller's own household
        [w.owner, w.household.id, w.otherHousehold.conversationId],
        // malformed / unknown ids
        [w.owner, w.household.id, 'nope'],
        [w.owner, w.household.id, randomUUID()],
      ];
      for (const [who, hid, cid] of attempts) {
        const history = await who.client.get(messagesUrl(hid, cid));
        expect(history.statusCode, `GET ${hid}/${cid}`).toBe(404);
        const post = await who.client.post(messagesUrl(hid, cid), { clientId: clientId(), content: 'Hallo?' });
        expect(post.statusCode, `POST ${hid}/${cid}`).toBe(404);
        const read = await who.client.post(readUrl(hid, cid), { seq: '1' });
        expect(read.statusCode, `READ ${hid}/${cid}`).toBe(404);
        expect(post.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
      }
      expect(await t.prisma.message.count({ where: { conversationId: chat.id } })).toBe(1);
      expect(await t.prisma.message.count({ where: { conversationId: w.otherHousehold.conversationId } })).toBe(0);

      expect((await t.client().get(messagesUrl(w.household.id, chat.id))).statusCode).toBe(401);
    });

    it('pages through history in ascending order', async () => {
      const w = await world();
      const cid = w.household.conversationId;
      const sent: MessageDto[] = [];
      for (let index = 1; index <= 7; index += 1) {
        sent.push(await send(index % 2 ? w.owner : w.lisa, w.household.id, cid, `Nachricht ${index}`));
      }
      const seqs = sent.map((message) => BigInt(message.seq));
      expect([...seqs].sort((a, b) => (a < b ? -1 : 1))).toEqual(seqs);

      const newest = (
        await w.max.client.get(messagesUrl(w.household.id, cid), { query: { limit: '3' } })
      ).json<MessagePage>();
      expect(newest.messages.map((message) => message.content)).toEqual(['Nachricht 5', 'Nachricht 6', 'Nachricht 7']);
      expect(newest.hasMore).toBe(true);
      expect(newest.members.map((member) => member.userId).sort()).toEqual([w.owner.id, w.lisa.id, w.max.id].sort());

      const older = (
        await w.max.client.get(messagesUrl(w.household.id, cid), {
          query: { limit: '3', before: newest.messages[0]?.seq ?? '' },
        })
      ).json<MessagePage>();
      expect(older.messages.map((message) => message.content)).toEqual(['Nachricht 2', 'Nachricht 3', 'Nachricht 4']);
      expect(older.hasMore).toBe(true);

      const oldest = (
        await w.max.client.get(messagesUrl(w.household.id, cid), {
          query: { limit: '3', before: older.messages[0]?.seq ?? '' },
        })
      ).json<MessagePage>();
      expect(oldest.messages.map((message) => message.content)).toEqual(['Nachricht 1']);
      expect(oldest.hasMore).toBe(false);

      const after = (
        await w.max.client.get(messagesUrl(w.household.id, cid), {
          query: { limit: '2', after: sent[3]?.seq ?? '' },
        })
      ).json<MessagePage>();
      expect(after.messages.map((message) => message.content)).toEqual(['Nachricht 5', 'Nachricht 6']);
      expect(after.hasMore).toBe(true);

      const both = await w.max.client.get(messagesUrl(w.household.id, cid), { query: { before: '9', after: '1' } });
      expect(both.statusCode).toBe(400);
      const tooMany = await w.max.client.get(messagesUrl(w.household.id, cid), { query: { limit: '101' } });
      expect(tooMany.statusCode).toBe(400);
      const huge = await w.max.client.get(messagesUrl(w.household.id, cid), {
        query: { before: '9999999999999999999' },
      });
      expect(huge.statusCode).toBe(200);
      expect(huge.json<MessagePage>().messages).toHaveLength(7);
    });
  });

  describe('unread counts and read cursors', () => {
    it('counts messages of others after the read cursor', async () => {
      const w = await world();
      const chat = await direct(w.owner, w.household.id, w.lisa.id);
      const first = await send(w.lisa, w.household.id, chat.id, 'Kannst du noch Milch mitbringen?');
      const second = await send(w.lisa, w.household.id, chat.id, 'Und Brot?');

      const forOwner = (await list(w.owner, w.household.id)).find((conversation) => conversation.id === chat.id);
      expect(forOwner).toMatchObject({ unreadCount: 2, lastMessage: { id: second.id, content: 'Und Brot?' } });
      const forLisa = (await list(w.lisa, w.household.id)).find((conversation) => conversation.id === chat.id);
      expect(forLisa?.unreadCount).toBe(0);

      const read = await w.owner.client.post(readUrl(w.household.id, chat.id), { seq: first.seq });
      expect(read.statusCode).toBe(200);
      expect(read.json<ReadCursorResponse>()).toEqual({ conversationId: chat.id, userId: w.owner.id, seq: first.seq });
      expect((await list(w.owner, w.household.id)).find((c) => c.id === chat.id)?.unreadCount).toBe(1);

      // Replying moves the sender's cursor to their own message.
      const reply = await send(w.owner, w.household.id, chat.id, 'Bringe ich mit!');
      expect((await list(w.owner, w.household.id)).find((c) => c.id === chat.id)?.unreadCount).toBe(0);
      const page = (await w.owner.client.get(messagesUrl(w.household.id, chat.id))).json<MessagePage>();
      expect(page.members.find((member) => member.userId === w.owner.id)?.lastReadSeq).toBe(reply.seq);
      expect((await list(w.lisa, w.household.id)).find((c) => c.id === chat.id)?.unreadCount).toBe(1);
    });

    it('never moves the cursor backwards and clamps it to the newest message', async () => {
      const w = await world();
      const cid = w.household.conversationId;
      const first = await send(w.lisa, w.household.id, cid, 'Eins');
      const second = await send(w.lisa, w.household.id, cid, 'Zwei');

      const forward = await w.max.client.post(readUrl(w.household.id, cid), { seq: second.seq });
      expect(forward.json<ReadCursorResponse>().seq).toBe(second.seq);
      const backward = await w.max.client.post(readUrl(w.household.id, cid), { seq: first.seq });
      expect(backward.statusCode).toBe(200);
      expect(backward.json<ReadCursorResponse>().seq).toBe(second.seq);
      const zero = await w.max.client.post(readUrl(w.household.id, cid), { seq: '0' });
      expect(zero.json<ReadCursorResponse>().seq).toBe(second.seq);

      // A forged cursor beyond the newest message cannot pre-read future messages.
      const forged = await w.owner.client.post(readUrl(w.household.id, cid), { seq: '9223372036854775807' });
      expect(forged.json<ReadCursorResponse>().seq).toBe(second.seq);
      await send(w.lisa, w.household.id, cid, 'Drei');
      expect((await list(w.owner, w.household.id))[0]?.unreadCount).toBe(1);

      const invalid = await w.owner.client.post(readUrl(w.household.id, cid), { seq: 5 });
      expect(invalid.statusCode).toBe(400);
    });

    // Regression (review): new members started with cursor 0, so the whole history was unread.
    it('does not count the history from before joining as unread', async () => {
      const w = await world();
      const cid = w.household.conversationId;
      for (const content of ['Eins', 'Zwei', 'Drei']) await send(w.lisa, w.household.id, cid, content);
      const newest = await send(w.max, w.household.id, cid, 'Vier');

      const nora = await actor('Nora');
      await addMember(t.prisma, w.household, nora.id);
      const group = (await list(nora, w.household.id)).find((conversation) => conversation.id === cid);
      expect(group?.unreadCount).toBe(0);
      const page = (await nora.client.get(messagesUrl(w.household.id, cid))).json<MessagePage>();
      expect(page.messages).toHaveLength(4);
      expect(page.members.find((member) => member.userId === nora.id)?.lastReadSeq).toBe(newest.seq);
      // Long-standing members keep their real cursors.
      expect(page.members.find((member) => member.userId === w.owner.id)?.lastReadSeq).toBe('0');

      // Messages after joining are unread as usual.
      await send(w.lisa, w.household.id, cid, 'Willkommen, Nora!');
      expect((await list(nora, w.household.id)).find((conversation) => conversation.id === cid)?.unreadCount).toBe(1);
      expect((await list(w.owner, w.household.id)).find((conversation) => conversation.id === cid)?.unreadCount).toBe(
        5,
      );
    });

    it('starts a re-added direct chat participant at the newest message', async () => {
      const w = await world();
      const chat = await direct(w.owner, w.household.id, w.lisa.id);
      for (const content of ['Hallo', 'Bist du da?']) await send(w.owner, w.household.id, chat.id, content);
      const last = await send(w.owner, w.household.id, chat.id, 'Ok, bis später.');
      await w.lisa.client.post(readUrl(w.household.id, chat.id), { seq: last.seq });
      expect((await list(w.lisa, w.household.id)).find((c) => c.id === chat.id)?.unreadCount).toBe(0);

      // Lisa leaves the household (memberships deleted) and is added again.
      await t.prisma.conversationMember.deleteMany({ where: { userId: w.lisa.id } });
      await t.prisma.householdMember.deleteMany({ where: { userId: w.lisa.id, householdId: w.household.id } });
      const away = await send(w.owner, w.household.id, chat.id, 'Schade, dass du weg bist.');
      await addMember(t.prisma, w.household, w.lisa.id);

      const again = await direct(w.lisa, w.household.id, w.owner.id);
      expect(again.id).toBe(chat.id);
      expect(again.unreadCount).toBe(0);
      const stored = await t.prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: chat.id, userId: w.lisa.id } },
      });
      expect(stored?.lastReadSeq.toString()).toBe(away.seq);
      const page = (await w.lisa.client.get(messagesUrl(w.household.id, chat.id))).json<MessagePage>();
      expect(page.messages.map((message) => message.content)).toContain('Schade, dass du weg bist.');
      expect(page.members.find((member) => member.userId === w.lisa.id)?.lastReadSeq).toBe(away.seq);

      await send(w.owner, w.household.id, chat.id, 'Schön, dass du wieder da bist!');
      expect((await list(w.lisa, w.household.id)).find((c) => c.id === chat.id)?.unreadCount).toBe(1);
    });
  });

  describe('shopping item messages', () => {
    it('snapshots the shopping item of the same household', async () => {
      const w = await world();
      const item = await t.prisma.shoppingItem.create({
        data: {
          shoppingListId: w.household.shoppingListId,
          householdId: w.household.id,
          name: 'Milch',
          quantity: '2',
          unit: 'LITER',
        },
      });
      const response = await w.owner.client.post(messagesUrl(w.household.id, w.household.conversationId), {
        clientId: clientId(),
        content: 'Milch',
        kind: 'SHOPPING_ITEM',
        meta: { shoppingItemId: item.id, name: 'Gefälscht', quantity: '99' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json<MessageDto>()).toMatchObject({
        kind: 'SHOPPING_ITEM',
        content: 'Milch · 2 Liter',
        meta: { shoppingItemId: item.id, name: 'Milch', quantity: '2', unit: 'LITER' },
      });

      const plain = await t.prisma.shoppingItem.create({
        data: { shoppingListId: w.household.shoppingListId, householdId: w.household.id, name: 'Brot' },
      });
      const noQuantity = await w.owner.client.post(messagesUrl(w.household.id, w.household.conversationId), {
        clientId: clientId(),
        content: 'Brot',
        kind: 'SHOPPING_ITEM',
        meta: { shoppingItemId: plain.id },
      });
      expect(noQuantity.json<MessageDto>()).toMatchObject({
        content: 'Brot',
        meta: { shoppingItemId: plain.id, name: 'Brot', quantity: null, unit: null },
      });
    });

    it('rejects foreign, unknown or missing shopping items', async () => {
      const w = await world();
      const foreign = await t.prisma.shoppingItem.create({
        data: {
          shoppingListId: w.otherHousehold.shoppingListId,
          householdId: w.otherHousehold.id,
          name: 'Fremde Milch',
        },
      });
      const url = messagesUrl(w.household.id, w.household.conversationId);
      for (const body of [
        { clientId: clientId(), content: 'x', kind: 'SHOPPING_ITEM', meta: { shoppingItemId: foreign.id } },
        { clientId: clientId(), content: 'x', kind: 'SHOPPING_ITEM', meta: { shoppingItemId: randomUUID() } },
        { clientId: clientId(), content: 'x', kind: 'SHOPPING_ITEM' },
        { clientId: clientId(), content: 'x', kind: 'SHOPPING_ITEM', meta: { shoppingItemId: 'milch' } },
        { clientId: clientId(), content: 'x', kind: 'TEXT', meta: { shoppingItemId: foreign.id } },
      ]) {
        const response = await w.owner.client.post(url, body);
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ error: { code: 'VALIDATION' } });
      }
      expect(await t.prisma.message.count({ where: { conversationId: w.household.conversationId } })).toBe(0);
      const leaked = await t.prisma.message.findMany({ where: { content: { contains: 'Fremde' } } });
      expect(leaked).toHaveLength(0);
    });
  });
});

describe('chat HTTP rate limiting', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await buildTestApp({ rateLimit: true });
  });

  afterAll(async () => {
    await t.close();
  });

  it('allows 20 new messages per 10 s and user; retries stay idempotent', async () => {
    const { user, client } = await createLoggedInUser(t.app, { displayName: 'Schnell' });
    const household = await createHousehold(t.prisma, user.id);
    const url = messagesUrl(household.id, household.conversationId);
    const ids = Array.from({ length: 20 }, () => clientId());
    for (const id of ids) {
      expect((await client.post(url, { clientId: id, content: 'Spam?' })).statusCode).toBe(201);
    }
    const limited = await client.post(url, { clientId: clientId(), content: 'Zu viel' });
    expect(limited.statusCode).toBe(429);
    const body = limited.json<{ error: { code: string; details: { retryAfterSeconds: number } } }>();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.error.details.retryAfterSeconds).toBeLessThanOrEqual(10);

    // A retry of an already stored message is answered from the database.
    const retry = await client.post(url, { clientId: ids[0], content: 'Spam?' });
    expect(retry.statusCode).toBe(200);

    // Other users are not affected.
    const other = await createLoggedInUser(t.app, { displayName: 'Geduldig' });
    await addMember(t.prisma, household, other.user.id);
    expect((await other.client.post(url, { clientId: clientId(), content: 'Hallo' })).statusCode).toBe(201);
    expect(await t.prisma.message.count({ where: { conversationId: household.conversationId } })).toBe(21);
  });
});
