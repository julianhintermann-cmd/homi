import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { HouseholdDetail, HouseholdRole, MemberDto } from '@homi/shared';
import {
  Avatar,
  Button,
  ConfirmDialog,
  EmptyState,
  GroupedList,
  HomiBottomSheet,
  Icon,
  InlineHeader,
  ListRow,
  Screen,
  Skeleton,
  SkeletonList,
  showToast,
} from '@/components';
import { openDirectConversation } from '@/api/households';
import { rememberConversation } from '@/features/chat/cache';
import { useRequiredHouseholdId } from '@/hooks/useActiveHousehold';
import { useMe } from '@/hooks/useAuth';
import { formatDate } from '@/lib/format';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';
import { useChangeMemberRole, useHouseholdDetail, useLeaveHousehold, useRemoveMember } from './queries';
import { ROLE_CHOICES, memberActions, roleDescription, roleLabel } from './roles';
import './households.css';

/**
 * `/haushalt/mitglieder/:userId`: avatar, name, role and join date with the actions the current
 * user is allowed to take – message (direct chat), change role (OWNER), remove / leave.
 */
export function MemberScreen({ userId }: { userId: string }) {
  const householdId = useRequiredHouseholdId();
  const goBack = useGoBack(paths.household);
  const { data: me } = useMe();
  const detail = useHouseholdDetail(householdId);
  const member = detail.data?.members.find((entry) => entry.userId === userId);

  let content;
  if (detail.data && me && member) {
    content = <MemberContent household={detail.data} member={member} meId={me.user.id} />;
  } else if (detail.data || detail.isError) {
    content = (
      <div className="household-state">
        <EmptyState
          icon="person"
          title="Mitglied nicht gefunden"
          message={detail.isError ? detail.error.message : 'Diese Person gehört nicht (mehr) zu deinem Haushalt.'}
          action={
            <Button size="medium" variant="secondary" onClick={goBack}>
              Zurück zum Haushalt
            </Button>
          }
        />
      </div>
    );
  } else {
    content = (
      <div role="status" aria-busy="true" aria-label="Mitglied wird geladen …">
        <div className="household-hero">
          <Skeleton shape="circle" height={72} />
          <Skeleton shape="text" width={140} height={22} style={{ marginTop: 14 }} />
        </div>
        <div className="household-sections">
          <SkeletonList variant="settings" rows={2} />
        </div>
      </div>
    );
  }

  return (
    <Screen
      aria-labelledby="member-title"
      header={<InlineHeader title="Mitglied" titleId="member-title" onBack={goBack} />}
    >
      {content}
    </Screen>
  );
}

function MemberContent({ household, member, meId }: { household: HouseholdDetail; member: MemberDto; meId: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const actions = memberActions(household, meId, member);
  const [dialog, setDialog] = useState<'remove' | 'role' | null>(null);
  const [opening, setOpening] = useState(false);
  // Navigation + toast happen in the hook callbacks: this screen unmounts once the member is gone.
  const removeMember = useRemoveMember(household.id, {
    onRemoved: () => {
      showToast({ message: `${member.displayName} entfernt` });
      void navigate(paths.household, { replace: true });
    },
  });
  const leave = useLeaveHousehold(household.id, meId, {
    onGone: () => {
      showToast({ message: `Du hast «${household.name}» verlassen` });
      void navigate(paths.home, { replace: true });
    },
  });
  const changeRole = useChangeMemberRole(household.id);
  const name = actions.isSelf ? `${member.displayName} (Du)` : member.displayName;

  const sendMessage = async (): Promise<void> => {
    setOpening(true);
    try {
      const conversation = await openDirectConversation(household.id, member.userId);
      rememberConversation(client, household.id, conversation);
      void navigate(paths.conversation(conversation.id));
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : 'Der Chat konnte nicht geöffnet werden.',
        tone: 'error',
      });
      setOpening(false);
    }
  };

  const confirmRemove = (): void => {
    if (actions.isSelf) {
      leave.mutate(undefined, {
        onError: (error) => {
          setDialog(null);
          showToast({ message: error.message, tone: 'error' });
        },
      });
      return;
    }
    removeMember.mutate(member.userId, {
      onError: (error) => {
        setDialog(null);
        showToast({ message: error.message, tone: 'error' });
      },
    });
  };

  const selectRole = (role: HouseholdRole): void => {
    if (role === member.role) {
      setDialog(null);
      return;
    }
    changeRole.mutate(
      { userId: member.userId, role },
      {
        onSuccess: (updated) => {
          setDialog(null);
          showToast({
            message: `${actions.isSelf ? 'Du bist' : `${member.displayName} ist`} jetzt ${roleLabel(updated.role)}`,
          });
        },
        onError: (error) => showToast({ message: error.message, tone: 'error' }),
      },
    );
  };

  const hasActions =
    !actions.isSelf || actions.roleOptions.length > 0 || actions.canRemove || actions.blockedByLastOwner;
  return (
    <>
      <div className="household-hero">
        <Avatar name={member.displayName} seed={member.userId} self={actions.isSelf} size={72} />
        <h2 className="household-hero__name">{name}</h2>
        <p className="household-hero__meta">{roleLabel(member.role)}</p>
        <p className="household-hero__meta household-hero__meta--role">Mitglied seit {formatDate(member.joinedAt)}</p>
      </div>

      {hasActions ? (
        <div className="household-sections">
          <GroupedList
            aria-label="Aktionen"
            footer={
              actions.blockedByLastOwner
                ? 'Als einzige Inhaberin bzw. einziger Inhaber kannst du den Haushalt nicht verlassen. Ernenne zuerst ein anderes Mitglied zur Inhaber:in oder lösche den Haushalt.'
                : undefined
            }
          >
            {actions.isSelf ? null : (
              <ListRow
                variant="settings"
                icon="bubble"
                title="Nachricht senden"
                onClick={() => void sendMessage()}
                disabled={opening}
              />
            )}
            {actions.roleOptions.length > 0 ? (
              <ListRow
                variant="settings"
                icon="personCircle"
                title="Rolle ändern"
                value={roleLabel(member.role)}
                onClick={() => setDialog('role')}
              />
            ) : null}
            {actions.canRemove ? (
              <ListRow
                title={actions.isSelf ? 'Haushalt verlassen' : 'Aus dem Haushalt entfernen'}
                tone="destructive"
                chevron={false}
                onClick={() => setDialog('remove')}
              />
            ) : null}
          </GroupedList>
        </div>
      ) : null}

      <ConfirmDialog
        open={dialog === 'remove'}
        title={actions.isSelf ? 'Haushalt verlassen?' : `${member.displayName} entfernen?`}
        message={
          actions.isSelf
            ? `Du verlierst den Zugriff auf Inventar, Einkaufsliste und Chats von «${household.name}».`
            : `${member.displayName} verliert den Zugriff auf «${household.name}» und verlässt alle Chats des Haushalts.`
        }
        confirmLabel={actions.isSelf ? 'Verlassen' : 'Entfernen'}
        busy={removeMember.isPending || leave.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={confirmRemove}
      />

      <HomiBottomSheet
        open={dialog === 'role'}
        variant="action"
        title="Rolle ändern"
        cancelLabel="Abbrechen"
        onClose={() => setDialog(null)}
        className="households-sheet"
      >
        <div className="homi-sheet-options" role="radiogroup" aria-label={`Rolle von ${member.displayName}`}>
          {ROLE_CHOICES.map((role) => {
            const current = role === member.role;
            const allowed = current || actions.roleOptions.includes(role);
            return (
              <button
                key={role}
                type="button"
                role="radio"
                aria-checked={current}
                disabled={!allowed || changeRole.isPending}
                className="homi-sheet-option households-option"
                onClick={() => selectRole(role)}
              >
                <span className="households-option__text">
                  <span className="households-option__title">{roleLabel(role)}</span>
                  <span className="households-option__subtitle">{roleDescription(role)}</span>
                </span>
                {current ? (
                  <Icon name="check" size={20} strokeWidth={2.6} className="households-option__check" />
                ) : null}
              </button>
            );
          })}
          {member.role === 'OWNER' && !actions.roleOptions.includes('ADMIN') ? (
            <p className="households-sheet__text households-sheet__hint">
              Ein Haushalt braucht mindestens eine Inhaberin bzw. einen Inhaber. Ernenne zuerst ein anderes Mitglied zur
              Inhaber:in.
            </p>
          ) : null}
        </div>
      </HomiBottomSheet>
    </>
  );
}
