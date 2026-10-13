import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConversationDto } from '@homi/shared';
import { openDirectConversation } from '@/api/chat';
import { Avatar, BottomSheetOption, HomiBottomSheet, showToast } from '@/components';
import { paths } from '@/routes/paths';
import { rememberConversation } from './cache';

export interface NewChatSheetProps {
  open: boolean;
  onClose: () => void;
  householdId: string;
  householdName: string;
  myId: string;
  conversations: readonly ConversationDto[] | undefined;
}

/**
 * "Neuer Chat" action sheet: the household group chat plus every other household member.
 * Picking a member get-or-creates the direct conversation (`POST …/conversations/direct`) and
 * opens it (empty → design 08d).
 */
export function NewChatSheet({ open, onClose, householdId, householdName, myId, conversations }: NewChatSheetProps) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const group = conversations?.find((conversation) => conversation.type === 'HOUSEHOLD') ?? null;
  const people = (group?.members ?? [])
    .filter((member) => member.userId !== myId)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de-CH'));

  const open1on1 = useMutation({
    mutationFn: (userId: string) => openDirectConversation(householdId, userId),
    onMutate: (userId) => setPendingUserId(userId),
    onSuccess: (conversation) => {
      rememberConversation(client, householdId, conversation);
      onClose();
      void navigate(paths.conversation(conversation.id));
    },
    onError: (error) => {
      showToast({ tone: 'error', message: error.message || 'Der Chat konnte nicht geöffnet werden.' });
    },
    onSettled: () => setPendingUserId(null),
  });

  return (
    <HomiBottomSheet open={open} onClose={onClose} variant="action" title="Neuer Chat" cancelLabel="Abbrechen">
      <div className="homi-sheet-options chat-new-sheet" aria-busy={open1on1.isPending || undefined}>
        {group ? (
          <BottomSheetOption
            label={householdName}
            leading={<Avatar name={householdName} household size={28} />}
            onClick={() => {
              onClose();
              void navigate(paths.conversation(group.id));
            }}
          />
        ) : null}
        {people.map((person) => (
          <BottomSheetOption
            key={person.userId}
            label={pendingUserId === person.userId ? `${person.displayName} …` : person.displayName}
            leading={<Avatar name={person.displayName} seed={person.userId} size={28} />}
            onClick={() => {
              if (!open1on1.isPending) open1on1.mutate(person.userId);
            }}
          />
        ))}
        {conversations && people.length === 0 ? (
          <p className="chat-new-sheet__hint">
            Noch niemand sonst in {householdName}. Lade Mitglieder unter «Haushalt» ein.
          </p>
        ) : null}
      </div>
    </HomiBottomSheet>
  );
}
