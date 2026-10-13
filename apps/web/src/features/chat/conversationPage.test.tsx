import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ConversationDto, MeResponse, MessagePage } from '@homi/shared';
import { queryKeys } from '@/api/queryKeys';
import { createQueryClient } from '@/lib/queryClient';
import { ConversationPage } from '@/pages/ConversationPage';

/*
 * Review regression: a direct chat created outside the chat screens ("Nachricht senden" on a
 * member page) is missing from a cached, still fresh conversation list. The page showed
 * "Chat nicht gefunden" instead of fetching the list again.
 */

const HOUSEHOLD_ID = '5b0c2f5e-6c0b-4c55-9d43-0d3f3c2b1a10';
const ME_ID = '8e0a1c0e-1d7b-4a43-8f5e-2f0c9b7d6a11';
const NORA_ID = '1f2e3d4c-5b6a-4987-8a6b-5c4d3e2f1a00';
const GROUP_ID = '0c9b8a7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const NEW_CHAT_ID = '7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';

const ME: MeResponse = {
  user: { id: ME_ID, displayName: 'Julian', email: 'julian@example.ch', createdAt: '2026-10-01T08:00:00.000Z' },
  households: [{ id: HOUSEHOLD_ID, name: 'Unser Zuhause', role: 'OWNER', memberCount: 2 }],
  activeHouseholdId: HOUSEHOLD_ID,
};

const GROUP: ConversationDto = {
  id: GROUP_ID,
  type: 'HOUSEHOLD',
  title: 'Unser Zuhause',
  members: [
    { userId: ME_ID, displayName: 'Julian' },
    { userId: NORA_ID, displayName: 'Nora' },
  ],
  lastMessage: null,
  unreadCount: 0,
  updatedAt: '2026-10-13T08:00:00.000Z',
};

const NEW_CHAT: ConversationDto = {
  id: NEW_CHAT_ID,
  type: 'DIRECT',
  title: 'Nora',
  members: GROUP.members,
  lastMessage: null,
  unreadCount: 0,
  updatedAt: '2026-10-13T09:00:00.000Z',
};

const EMPTY_PAGE: MessagePage = {
  messages: [],
  hasMore: false,
  members: [
    { userId: ME_ID, lastReadSeq: '0' },
    { userId: NORA_ID, lastReadSeq: '0' },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderConversation(cachedList: ConversationDto[]) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } });
  client.setQueryData(queryKeys.me, ME);
  // Fresh cache from an earlier visit of /chats (would not refetch on its own).
  client.setQueryData(queryKeys.conversations(HOUSEHOLD_ID), cachedList);
  const router = createMemoryRouter([{ path: '/chats/:cid', Component: ConversationPage }], {
    initialEntries: [`/chats/${NEW_CHAT_ID}`],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('ConversationPage – conversation lookup', () => {
  let listResponse: ConversationDto[];
  let listRequests = 0;

  beforeEach(() => {
    listRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes(`/conversations/${NEW_CHAT_ID}/messages`)) return json(EMPTY_PAGE);
        if (url.endsWith(`/households/${HOUSEHOLD_ID}/conversations`)) {
          listRequests += 1;
          return json(listResponse);
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refetches a stale list instead of reporting a just-created chat as missing', async () => {
    listResponse = [NEW_CHAT, GROUP];
    renderConversation([GROUP]);
    expect(screen.queryByText('Chat nicht gefunden')).toBeNull();

    expect(await screen.findByText('Schreib Nora die erste Nachricht.')).toBeInTheDocument();
    expect(screen.queryByText('Chat nicht gefunden')).toBeNull();
    expect(listRequests).toBe(1);
  });

  it('reports a chat as missing only after a fresh list confirms it (once)', async () => {
    listResponse = [GROUP];
    renderConversation([GROUP]);
    expect(screen.queryByText('Chat nicht gefunden')).toBeNull();

    expect(await screen.findByText('Chat nicht gefunden')).toBeInTheDocument();
    await waitFor(() => expect(listRequests).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listRequests).toBe(1);
  });
});
