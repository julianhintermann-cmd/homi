import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { InvitationPreview } from '@homi/shared';
import { Avatar, Button, Card, EmptyState, InlineHeader, Screen, Skeleton, showToast } from '@/components';
import { isApiError } from '@/api/client';
import { useMe } from '@/hooks/useAuth';
import { formatDate } from '@/lib/format';
import { paths } from '@/routes/paths';
import { invitationStateFromError, signInLinkFor, type InvitationViewState } from './invitationLink';
import { useAcceptInvitation, useInvitationPreview } from './queries';
import { roleLabel } from './roles';
import './households.css';

const STATE_COPY: Record<Exclude<InvitationViewState, 'valid'>, { title: string; message: string }> = {
  expired: {
    title: 'Einladung abgelaufen',
    message: 'Dieser Einladungslink ist nicht mehr gültig. Bitte frag nach einem neuen Link.',
  },
  revoked: {
    title: 'Einladung widerrufen',
    message: 'Diese Einladung wurde zurückgezogen. Bitte frag nach einem neuen Link.',
  },
  used: {
    title: 'Einladung bereits verwendet',
    message: 'Jeder Einladungslink funktioniert nur einmal. Bitte frag nach einem neuen Link.',
  },
  invalid: {
    title: 'Einladung ungültig',
    message: 'Dieser Link ist ungültig. Prüfe, ob du ihn vollständig kopiert hast.',
  },
};

/**
 * `/einladung/:token` (public): preview card (household, inviter, role, expiry) → "Einladung
 * annehmen" when signed in, otherwise "Anmelden" / "Konto erstellen" returning here afterwards.
 * Expired, revoked, used and invalid links get their own explanation.
 */
export function InvitationScreen({ token }: { token: string }) {
  const navigate = useNavigate();
  const me = useMe();
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation(token);
  const loggedIn = Boolean(me.data);
  // Until the session is known, offering "Anmelden" to a signed-in user would be misleading.
  const sessionPending = me.data === undefined && me.isPending;
  const acceptState = invitationStateFromError(accept.error);

  const onAccept = (): void => {
    accept.mutate(undefined, {
      onSuccess: () => {
        showToast({ message: `Willkommen in «${preview.data?.householdName ?? 'deinem Haushalt'}»` });
        void navigate(paths.home, { replace: true });
      },
      onError: (error) => {
        if (!invitationStateFromError(error)) showToast({ message: error.message, tone: 'error' });
      },
    });
  };

  let state: InvitationViewState | 'loading' | 'error';
  if (acceptState) state = acceptState;
  else if (preview.data) state = sessionPending ? 'loading' : preview.data.status;
  else if (preview.isError) state = isApiError(preview.error) && preview.error.status === 404 ? 'invalid' : 'error';
  else state = 'loading';

  let content;
  if (state === 'loading') {
    content = <InvitationSkeleton />;
  } else if (state === 'error') {
    content = (
      <EmptyState
        fill
        icon="personPlus"
        title="Einladung nicht erreichbar"
        message={preview.error?.message}
        action={
          <Button size="medium" variant="secondary" loading={preview.isFetching} onClick={() => void preview.refetch()}>
            Erneut versuchen
          </Button>
        }
      />
    );
  } else if (state === 'valid' && preview.data) {
    content = (
      <InvitationCard
        preview={preview.data}
        actions={
          loggedIn ? (
            <>
              <Button fullWidth loading={accept.isPending} onClick={onAccept}>
                Einladung annehmen
              </Button>
              <Button variant="plain" onClick={() => void navigate(paths.home, { replace: true })}>
                Nicht jetzt
              </Button>
            </>
          ) : (
            <>
              <Link
                to={signInLinkFor(paths.login, token)}
                className="homi-button homi-button--full"
                data-variant="primary"
                data-size="large"
              >
                Anmelden
              </Link>
              <Link
                to={signInLinkFor(paths.register, token)}
                className="homi-button homi-button--full"
                data-variant="secondary"
                data-size="large"
              >
                Konto erstellen
              </Link>
            </>
          )
        }
      />
    );
  } else {
    const copy = STATE_COPY[state === 'valid' ? 'invalid' : state];
    content = (
      <EmptyState
        fill
        icon="personPlus"
        title={copy.title}
        message={copy.message}
        action={
          <Link
            to={loggedIn ? paths.home : paths.login}
            className="homi-button"
            data-variant="secondary"
            data-size="medium"
          >
            {loggedIn ? 'Zur Übersicht' : 'Zur Anmeldung'}
          </Link>
        }
      />
    );
  }

  return (
    <Screen aria-labelledby="invitation-title" header={<InlineHeader title="Einladung" titleId="invitation-title" />}>
      {content}
    </Screen>
  );
}

function InvitationCard({ preview, actions }: { preview: InvitationPreview; actions: ReactNode }) {
  const role = roleLabel(preview.role);
  // The server names the household only while the link is valid (the only state shown here).
  const householdName = preview.householdName ?? 'Haushalt';
  return (
    <Card padded className="households-invite-card households-block">
      <Avatar name={householdName} household size={72} />
      <p className="households-invite-card__eyebrow">Du wurdest eingeladen</p>
      <h2 className="households-invite-card__title">{householdName}</h2>
      {preview.inviterName ? (
        <p className="households-invite-card__text">{`${preview.inviterName} lädt dich in diesen Haushalt ein.`}</p>
      ) : null}
      {/* Role as a label, not inside the sentence ("lädt dich als Verwaltung ein" reads badly). */}
      <p className="households-invite-card__meta">{`Deine Rolle: ${role} · gültig bis ${formatDate(preview.expiresAt)}`}</p>
      <div className="households-invite-card__actions">{actions}</div>
    </Card>
  );
}

function InvitationSkeleton() {
  return (
    <Card
      padded
      className="households-invite-card households-block"
      role="status"
      aria-busy="true"
      aria-label="Einladung wird geladen …"
    >
      <Skeleton shape="circle" height={72} />
      <Skeleton shape="text" width={140} height={13} style={{ marginTop: 16 }} />
      <Skeleton shape="text" width={180} height={22} />
      <Skeleton shape="text" width={220} height={13} style={{ marginTop: 8 }} />
    </Card>
  );
}
