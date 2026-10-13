import { useState } from 'react';
import { LIMITS } from '@homi/shared/core';
import type { CreatedInvitation, InvitationDto, InvitationRole } from '@homi/shared';
import {
  Button,
  ConfirmDialog,
  GroupedList,
  HomiBottomSheet,
  ListRow,
  SegmentedControl,
  SkeletonList,
  TextField,
  showToast,
} from '@/components';
import { formatDate } from '@/lib/format';
import { invitationCreatedLabel } from './invitationLink';
import { useCreateInvitation, useInvitations, useRevokeInvitation } from './queries';
import { roleDescription, roleLabel } from './roles';
import './households.css';

export interface InviteSheetProps {
  open: boolean;
  onClose: () => void;
  householdId: string;
  householdName: string;
}

const ROLE_OPTIONS = [
  { value: 'MEMBER', label: roleLabel('MEMBER') },
  { value: 'ADMIN', label: roleLabel('ADMIN') },
] as const satisfies ReadonlyArray<{ value: InvitationRole; label: string }>;

type Validity = '1' | '7' | '30';
const VALIDITY_OPTIONS = [
  { value: '1', label: '1 Tag' },
  { value: '7', label: '7 Tage' },
  { value: '30', label: '30 Tage' },
] as const satisfies ReadonlyArray<{ value: Validity; label: string }>;

/** `navigator.share` exists (iOS Safari, Android); desktop browsers often lack it. */
function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * "Mitglied einladen" (ADMIN+): choose role and validity → "Link erstellen" → the one-time link
 * with "Kopieren" / "Teilen", plus the active invitations with "Widerrufen". The raw link lives
 * only in this sheet's state and is gone once the sheet closes.
 */
export function InviteSheet({ open, onClose, householdId, householdName }: InviteSheetProps) {
  return (
    <HomiBottomSheet
      open={open}
      variant="action"
      title="Mitglied einladen"
      cancelLabel="Fertig"
      onClose={onClose}
      className="households-sheet"
    >
      <InviteSheetContent householdId={householdId} householdName={householdName} />
    </HomiBottomSheet>
  );
}

function InviteSheetContent({ householdId, householdName }: { householdId: string; householdName: string }) {
  const [role, setRole] = useState<InvitationRole>('MEMBER');
  const [validity, setValidity] = useState<Validity>(String(LIMITS.invitationExpiresInDays.default) as Validity);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const create = useCreateInvitation(householdId);
  const invitations = useInvitations(householdId, true);

  const onCreate = (): void => {
    create.mutate(
      { role, expiresInDays: Number(validity) },
      {
        onSuccess: (invitation) => setCreated(invitation),
        onError: (error) => showToast({ message: error.message, tone: 'error' }),
      },
    );
  };

  return (
    <div className="households-sheet__stack">
      {created ? (
        <CreatedLink invitation={created} householdName={householdName} onAnother={() => setCreated(null)} />
      ) : (
        <>
          <div>
            <p className="households-sheet__label">Rolle</p>
            <SegmentedControl
              label="Rolle"
              value={role}
              options={ROLE_OPTIONS}
              onValueChange={(next) => setRole(next)}
            />
            <p className="households-sheet__text households-sheet__hint">{roleDescription(role)}</p>
          </div>
          <div>
            <p className="households-sheet__label">Gültigkeit</p>
            <SegmentedControl
              label="Gültigkeit"
              value={validity}
              options={VALIDITY_OPTIONS}
              onValueChange={(next) => setValidity(next)}
            />
          </div>
          <Button fullWidth loading={create.isPending} onClick={onCreate}>
            Link erstellen
          </Button>
        </>
      )}
      <ActiveInvitations
        householdId={householdId}
        invitations={invitations.data}
        loading={invitations.isPending}
        hiddenId={created?.id}
      />
    </div>
  );
}

function CreatedLink({
  invitation,
  householdName,
  onAnother,
}: {
  invitation: CreatedInvitation;
  householdName: string;
  onAnother: () => void;
}) {
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(invitation.url);
      showToast({ message: 'Link kopiert' });
    } catch {
      showToast({ message: 'Kopieren nicht möglich – markiere den Link und kopiere ihn manuell.', tone: 'error' });
    }
  };

  const share = async (): Promise<void> => {
    try {
      await navigator.share({
        title: 'Einladung zu Homi',
        text: `Komm in unseren Haushalt «${householdName}» bei Homi.`,
        url: invitation.url,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return; // user cancelled
      void copy();
    }
  };

  return (
    <>
      <TextField
        label="Einladungslink"
        className="households-link-field"
        value={invitation.url}
        readOnly
        onFocus={(event) => event.currentTarget.select()}
        hint={`${roleLabel(invitation.role)} · gültig bis ${formatDate(invitation.expiresAt)} · nur einmal verwendbar`}
      />
      <div className="households-sheet__actions">
        <Button variant="secondary" onClick={() => void copy()}>
          Kopieren
        </Button>
        {canShare() ? <Button onClick={() => void share()}>Teilen</Button> : null}
      </div>
      <Button variant="plain" fullWidth onClick={onAnother}>
        Weiteren Link erstellen
      </Button>
    </>
  );
}

function ActiveInvitations({
  householdId,
  invitations,
  loading,
  hiddenId,
}: {
  householdId: string;
  invitations: readonly InvitationDto[] | undefined;
  loading: boolean;
  hiddenId: string | undefined;
}) {
  const revoke = useRevokeInvitation(householdId);
  const [confirming, setConfirming] = useState<InvitationDto | null>(null);
  const visible = (invitations ?? []).filter((invitation) => invitation.id !== hiddenId);

  if (loading) return <SkeletonList variant="settings" rows={1} label="Einladungen werden geladen …" />;
  if (visible.length === 0) return null;

  return (
    <>
      <GroupedList label="Aktive Einladungen" className="households-invitations">
        {visible.map((invitation) => (
          <ListRow
            key={invitation.id}
            title={`${roleLabel(invitation.role)} · bis ${formatDate(invitation.expiresAt)}`}
            subtitle={invitationCreatedLabel(invitation)}
            trailing={
              <button
                type="button"
                className="homi-text-button households-row-action"
                data-tone="destructive"
                onClick={() => setConfirming(invitation)}
              >
                Widerrufen
              </button>
            }
          />
        ))}
      </GroupedList>
      <ConfirmDialog
        open={confirming !== null}
        title="Einladung widerrufen?"
        message="Der Link funktioniert danach nicht mehr."
        confirmLabel="Widerrufen"
        busy={revoke.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (!confirming) return;
          revoke.mutate(confirming.id, {
            onSuccess: () => showToast({ message: 'Einladung widerrufen' }),
            onError: (error) => showToast({ message: error.message, tone: 'error' }),
            onSettled: () => setConfirming(null),
          });
        }}
      />
    </>
  );
}
