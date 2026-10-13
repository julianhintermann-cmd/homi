import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Button, GroupedList, LargeTitleHeader, Screen, TextField, showToast } from '@/components';
import { useLogout, useMe } from '@/hooks/useAuth';
import { paths } from '@/routes/paths';
import { CreateHouseholdForm } from './CreateHouseholdForm';
import { invitationTokenFromInput } from './invitationLink';
import './households.css';

/**
 * `/willkommen` – first run without a household: create one ("Haushalt erstellen") or join via an
 * invitation link (pasted here, since links from messages often open in the browser, not the PWA).
 * Users who already belong to a household (e.g. Back after joining, or a bookmark) go Home.
 */
export function WelcomeScreen() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const logout = useLogout();
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  // Decided once on entry: creating a household here fills `me.households` before the form's
  // success callback runs – redirecting then would unmount the form and drop its toast.
  const [hasHousehold] = useState(() => (me?.households.length ?? 0) > 0);
  const firstName = me?.user.displayName.trim().split(/\s+/)[0] ?? '';

  if (hasHousehold) return <Navigate to={paths.home} replace />;

  const openInvitation = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const token = invitationTokenFromInput(link);
    if (!token) {
      setLinkError('Das ist kein gültiger Einladungslink.');
      return;
    }
    void navigate(paths.invitation(token));
  };

  return (
    <Screen
      aria-labelledby="welcome-title"
      header={
        <LargeTitleHeader
          eyebrow={firstName ? `Hallo ${firstName}` : 'Hallo'}
          title="Willkommen."
          titleId="welcome-title"
        />
      }
    >
      <p className="households-intro">
        Inventar, Einkaufsliste und Chat für alle, die zusammen wohnen. Lege deinen Haushalt an – oder tritt einem
        bestehenden bei.
      </p>

      <div className="households-block">
        <GroupedList label="Neuer Haushalt" as="group">
          <div className="households-card-body">
            <CreateHouseholdForm
              onCreated={(household) => {
                showToast({ message: `«${household.name}» erstellt` });
                void navigate(paths.home, { replace: true });
              }}
            />
          </div>
        </GroupedList>

        <GroupedList
          label="Einladung erhalten?"
          as="group"
          footer="Öffne den Einladungslink, den du von einem Mitglied bekommen hast – oder füge ihn hier ein."
        >
          <div className="households-card-body">
            <form className="households-form" onSubmit={openInvitation} noValidate>
              <TextField
                label="Einladungslink"
                placeholder="https://…/einladung/…"
                value={link}
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                error={linkError}
                onChange={(event) => {
                  setLink(event.target.value);
                  setLinkError(null);
                }}
              />
              <Button type="submit" variant="secondary" fullWidth disabled={link.trim().length === 0}>
                Einladung öffnen
              </Button>
            </form>
          </div>
        </GroupedList>
      </div>

      <div className="households-footer-actions">
        <Button variant="plain" loading={logout.isPending} onClick={() => logout.mutate()}>
          Abmelden
        </Button>
      </div>
    </Screen>
  );
}
