import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ConversationDto } from '@homi/shared';
import {
  Avatar,
  Button,
  ConversationRow,
  EmptyState,
  GlassToolbar,
  GlassToolbarItem,
  HomiSearchField,
  LargeTitleHeader,
  Screen,
  SkeletonList,
} from '@/components';
import { NewChatSheet } from '@/features/chat/NewChatSheet';
import { conversationsQueryOptions } from '@/features/chat/queries';
import { useChatRealtime } from '@/features/chat/realtime';
import { conversationPreview, filterConversations } from '@/features/chat/timeline';
import { useActiveHousehold, useRequiredHouseholdId } from '@/hooks/useActiveHousehold';
import { useMe } from '@/hooks/useAuth';
import { formatChatTimestamp } from '@/lib/format';
import { paths } from '@/routes/paths';
import '@/features/chat/chat.css';

/**
 * Chats tab (design 04, empty state 12): conversations of the active household with messages,
 * newest first; search filters title and preview locally. "Neuer Chat" opens the member picker.
 */
export function ChatsPage() {
  const householdId = useRequiredHouseholdId();
  const { household } = useActiveHousehold();
  const me = useMe().data?.user ?? null;
  const myId = me?.id ?? '';
  const householdName = household?.name ?? 'Haushalt';
  useChatRealtime();

  const conversations = useQuery(conversationsQueryOptions(householdId));
  const [search, setSearch] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);

  // A chat appears in the list once it has a message (empty direct chats stay hidden, design 12).
  const active = useMemo(
    () => (conversations.data ?? []).filter((conversation) => conversation.lastMessage !== null),
    [conversations.data],
  );
  const visible = useMemo(() => filterConversations(active, search, myId), [active, search, myId]);
  const openNewChat = () => setNewChatOpen(true);

  const toolbar = (
    <GlassToolbar label="Chat-Aktionen">
      <GlassToolbarItem icon="compose" label="Neuer Chat" onClick={openNewChat} />
    </GlassToolbar>
  );

  let body;
  if (conversations.isPending) {
    body = <SkeletonList variant="conversation" rows={3} className="chats-loading" label="Chats werden geladen …" />;
  } else if (conversations.isError) {
    body = (
      <EmptyState
        className="chats-empty"
        icon="bubbles"
        title="Chats nicht verfügbar"
        message={conversations.error.message}
        action={
          <Button size="medium" variant="secondary" onClick={() => void conversations.refetch()}>
            Erneut versuchen
          </Button>
        }
      />
    );
  } else if (active.length === 0) {
    body = (
      <EmptyState
        className="chats-empty"
        icon="bubbles"
        title="Noch keine Chats"
        message="Starte eine Unterhaltung mit deinem Haushalt."
        action={
          <Button size="medium" variant="secondary" onClick={openNewChat}>
            Neuer Chat
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        <HomiSearchField className="chats-search" value={search} onValueChange={setSearch} placeholder="Suchen" />
        {visible.length > 0 ? (
          <ul className="chats-list" aria-label="Chats">
            {visible.map((conversation) => (
              <ConversationListItem key={conversation.id} conversation={conversation} myId={myId} />
            ))}
          </ul>
        ) : (
          <EmptyState
            className="chats-no-results"
            title="Keine Treffer"
            message={`Kein Chat passt zu «${search.trim()}».`}
          />
        )}
      </>
    );
  }

  return (
    <Screen withTabBar header={<LargeTitleHeader title="Chats" trailing={toolbar} />}>
      {body}
      <NewChatSheet
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        householdId={householdId}
        householdName={householdName}
        myId={myId}
        conversations={conversations.data}
      />
    </Screen>
  );
}

function ConversationListItem({ conversation, myId }: { conversation: ConversationDto; myId: string }) {
  const partner = conversation.members.find((member) => member.userId !== myId);
  const avatar =
    conversation.type === 'HOUSEHOLD' ? (
      <Avatar name={conversation.title} household size={54} />
    ) : (
      <Avatar name={conversation.title} seed={partner?.userId ?? conversation.id} size={54} />
    );
  return (
    <ConversationRow
      title={conversation.title}
      avatar={avatar}
      time={conversation.lastMessage ? formatChatTimestamp(conversation.lastMessage.createdAt) : undefined}
      preview={conversationPreview(conversation, myId)}
      unreadCount={conversation.unreadCount}
      to={paths.conversation(conversation.id)}
    />
  );
}
