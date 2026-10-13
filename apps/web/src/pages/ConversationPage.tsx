import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/api/client';
import { Avatar, Button, ChatComposer, EmptyState, Icon, InlineHeader, Screen, Spinner, showToast } from '@/components';
import { ChatIntro } from '@/features/chat/ChatIntro';
import { markConversationRead, retryChatMessage, sendChatMessage } from '@/features/chat/delivery';
import { MessageTimeline } from '@/features/chat/MessageTimeline';
import { selectPending, useOutboxStore } from '@/features/chat/outbox';
import { conversationsQueryOptions, useConversationMessages } from '@/features/chat/queries';
import { useChatRealtime, useTypingStore } from '@/features/chat/realtime';
import { ShoppingItemSheet } from '@/features/chat/ShoppingItemSheet';
import {
  buildTimeline,
  compareSeq,
  findUnreadMarker,
  reconcileMessages,
  type UnreadMarker,
} from '@/features/chat/timeline';
import { useChatScroll } from '@/features/chat/useChatScroll';
import { useDictation } from '@/features/chat/useDictation';
import { useTypingSignal } from '@/features/chat/useTypingSignal';
import { useActiveHousehold, useRequiredHouseholdId } from '@/hooks/useActiveHousehold';
import { useMe } from '@/hooks/useAuth';
import { useScrollContainer } from '@/hooks/useScrollMemory';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';
import '@/features/chat/chat.css';

/**
 * Conversation (design 08 / 08b / 08c / 08d): contact header, history with optimistic sends,
 * unread divider, read receipts and the composer (text, dictation, shopping-item card).
 */
export function ConversationPage() {
  const { cid = '' } = useParams();
  const householdId = useRequiredHouseholdId();
  const { household } = useActiveHousehold();
  const me = useMe().data?.user ?? null;
  const client = useQueryClient();
  const goBack = useGoBack(paths.chats);
  const container = useScrollContainer();
  useChatRealtime();

  const conversations = useQuery(conversationsQueryOptions(householdId));
  const conversation = conversations.data?.find((entry) => entry.id === cid) ?? null;
  // A chat created elsewhere (e.g. "Nachricht senden" on a member page) can be missing from a
  // cached list that is still fresh: refetch once before concluding that the chat does not exist.
  const missingFromList = conversations.isSuccess && !conversation;
  const refetchConversations = conversations.refetch;
  const [listCheckedFor, setListCheckedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!missingFromList) return undefined;
    let cancelled = false;
    void refetchConversations().finally(() => {
      if (!cancelled) setListCheckedFor(cid);
    });
    return () => {
      cancelled = true;
    };
  }, [missingFromList, refetchConversations, cid]);
  const history = useConversationMessages(householdId, cid);
  const outbox = useOutboxStore((state) => state.entries);
  const pending = useMemo(() => selectPending(outbox, cid), [outbox, cid]);
  const myId = me?.id ?? '';
  const myName = me?.displayName ?? 'Du';
  const householdName = household?.name ?? 'Haushalt';

  // ── Header ──
  const partner = conversation?.type === 'DIRECT' ? conversation.members.find((m) => m.userId !== myId) : undefined;
  const title = conversation?.title ?? '';
  const isGroup = conversation?.type === 'HOUSEHOLD';
  const headerAvatar = (size: number) =>
    isGroup ? (
      <Avatar name={title} household size={size} />
    ) : (
      <Avatar name={title || '?'} seed={partner?.userId ?? cid} size={size} />
    );
  const contactLink = isGroup ? paths.household : partner ? paths.member(partner.userId) : undefined;
  const header = (
    <InlineHeader
      onBack={goBack}
      contact={{
        name: title || ' ',
        avatar: headerAvatar(48),
        to: contactLink,
        label: isGroup ? `Haushalt ${title}` : `Profil von ${title}`,
      }}
    />
  );

  // ── Timeline ──
  const display = useMemo(
    () => (me ? reconcileMessages(history.messages, pending, { id: me.id, displayName: myName }) : []),
    [history.messages, pending, me, myName],
  );

  // The unread divider is placed once, when the history first arrives (it stays while open).
  const [unread, setUnread] = useState<UnreadMarker | null | undefined>(undefined);
  if (unread === undefined && history.isSuccess && me) {
    const cursor = history.members.find((member) => member.userId === me.id)?.lastReadSeq ?? null;
    const marker = findUnreadMarker(history.messages, me.id, cursor);
    // Unread messages beyond the first history page still count ("12 neue Nachrichten").
    setUnread(marker ? { ...marker, count: Math.max(marker.count, conversation?.unreadCount ?? 0) } : null);
  }
  const loaded = history.isSuccess && Boolean(me) && unread !== undefined && conversation !== null;

  const memberNames = useMemo(
    () => new Map((conversation?.members ?? []).map((member) => [member.userId, member.displayName])),
    [conversation?.members],
  );
  const rows = useMemo(
    () =>
      buildTimeline(display, {
        myId,
        conversationType: conversation?.type ?? 'DIRECT',
        members: history.members,
        memberNames,
        unread: unread ?? null,
      }),
    [display, myId, conversation?.type, history.members, memberNames, unread],
  );
  const newest = display.at(-1);
  const timelineRef = useRef<HTMLDivElement>(null);
  // The timeline is in the DOM (scroll positioning and observers attach to it).
  const ready = loaded && display.length > 0;
  const scroll = useChatScroll({
    containerRef: container,
    contentRef: timelineRef,
    ready,
    newestKey: newest?.key ?? null,
    newestIsMine: newest?.senderId === myId,
    oldestKey: display[0]?.key ?? null,
    hasOlder: Boolean(history.hasNextPage),
    loadingOlder: history.isFetchingNextPage,
    loadOlder: () => void history.fetchNextPage(),
  });

  // ── Read cursor: whenever the bottom is visible ──
  const newestConfirmedSeq = history.messages.at(-1)?.seq ?? null;
  const myCursor = history.members.find((member) => member.userId === myId)?.lastReadSeq ?? '0';
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (!ready || !visible || !scroll.positioned || !scroll.atBottom || !newestConfirmedSeq) return;
    if (compareSeq(newestConfirmedSeq, myCursor) <= 0) return;
    markConversationRead(client, householdId, cid, newestConfirmedSeq);
  }, [ready, visible, scroll.positioned, scroll.atBottom, newestConfirmedSeq, myCursor, client, householdId, cid]);

  // ── Composer ──
  const draft = useOutboxStore((state) => state.drafts[cid] ?? '');
  const setDraft = useCallback((text: string) => useOutboxStore.getState().setDraft(cid, text), [cid]);
  const typing = useTypingSignal(cid);
  const dictation = useDictation(setDraft, (message) => showToast({ tone: 'error', message }));
  const [itemSheetOpen, setItemSheetOpen] = useState(false);

  const onValueChange = (text: string) => {
    setDraft(text);
    typing.onInput(text);
  };
  const onSend = (text: string) => {
    if (!me) return;
    dictation.stop();
    typing.stop();
    setDraft('');
    sendChatMessage(client, { householdId, conversationId: cid, content: text });
  };
  const onRetry = useCallback((clientId: string) => retryChatMessage(client, clientId), [client]);

  const typingUsers = useTypingStore((state) => state.byConversation[cid]);
  const typingLabel = useMemo(() => {
    const names = Object.entries(typingUsers ?? {})
      .filter(([userId]) => userId !== myId)
      .map(([, entry]) => entry.displayName);
    if (names.length === 0) return null;
    return names.length === 1 ? `${names[0]} schreibt …` : `${names.join(', ')} schreiben …`;
  }, [typingUsers, myId]);
  useEffect(() => {
    if (!typingLabel) return undefined;
    const timer = window.setInterval(() => useTypingStore.getState().prune(), 2_000);
    return () => window.clearInterval(timer);
  }, [typingLabel]);

  // ── States ──
  const notFound =
    (missingFromList && listCheckedFor === cid && !conversations.isFetching) ||
    (history.isError && isApiError(history.error) && history.error.status === 404);
  let body;
  if (notFound) {
    body = (
      <EmptyState
        className="chat-state"
        icon="bubbles"
        title="Chat nicht gefunden"
        message="Dieser Chat existiert nicht oder du bist kein Mitglied mehr."
        action={
          <Button size="medium" variant="secondary" onClick={goBack}>
            Zu den Chats
          </Button>
        }
      />
    );
  } else if (history.isError || (conversations.isError && !conversation)) {
    const error = history.error ?? conversations.error;
    body = (
      <EmptyState
        className="chat-state"
        icon="bubbles"
        title="Verlauf nicht verfügbar"
        message={error?.message}
        action={
          <Button
            size="medium"
            variant="secondary"
            onClick={() => {
              void history.refetch();
              void conversations.refetch();
            }}
          >
            Erneut versuchen
          </Button>
        }
      />
    );
  } else if (!loaded || !conversation) {
    body = (
      <div key="loading" className="chat-state" role="status" aria-label="Verlauf wird geladen …">
        <Spinner />
      </div>
    );
  } else if (display.length === 0) {
    body = (
      <ChatIntro
        avatar={headerAvatar(80)}
        title={title}
        subtitle={isGroup ? `${conversation.members.length} Mitglieder` : `Mitglied von ${householdName}`}
        hint={isGroup ? 'Schreib deinem Haushalt die erste Nachricht.' : `Schreib ${title} die erste Nachricht.`}
      />
    );
  } else {
    // Own key: React must not reuse the spinner's node (its padding would still be transitioning
    // out under Reduce Motion while the initial scroll position is measured).
    body = (
      <div key="timeline" ref={timelineRef}>
        {history.hasNextPage ? (
          <div className="chat-older" aria-hidden={!history.isFetchingNextPage}>
            {history.isFetchingNextPage ? <Spinner size={18} /> : null}
          </div>
        ) : null}
        <MessageTimeline rows={rows} onRetry={onRetry} typingLabel={typingLabel} />
      </div>
    );
  }

  const canWrite = Boolean(conversation) && !notFound;

  return (
    <Screen
      withComposer={canWrite}
      gutter={false}
      className="chat-screen"
      header={header}
      aria-label={title ? `Chat mit ${title}` : 'Chat'}
    >
      {body}
      {canWrite ? (
        <ChatComposer
          value={draft}
          onValueChange={onValueChange}
          onSend={onSend}
          onAttach={() => setItemSheetOpen(true)}
          onMic={
            dictation.supported ? () => (dictation.listening ? dictation.stop() : dictation.start(draft)) : undefined
          }
          hideMic={!dictation.supported}
          micActive={dictation.listening}
          disabled={!me}
        />
      ) : null}
      {scroll.showNewPill ? (
        <button
          type="button"
          className="glass glass--pressable homi-contact-pill chat-new-pill"
          onClick={() => scroll.scrollToBottom(true)}
        >
          <span className="homi-contact-pill__name">Neue Nachrichten</span>
          <Icon name="chevD" size={13} strokeWidth={4.06} className="homi-contact-pill__chevron" />
        </button>
      ) : null}
      {canWrite ? (
        <ShoppingItemSheet
          open={itemSheetOpen}
          onClose={() => setItemSheetOpen(false)}
          householdId={householdId}
          conversationId={cid}
        />
      ) : null}
    </Screen>
  );
}
