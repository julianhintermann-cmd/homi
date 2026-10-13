import { useState } from 'react';
import { Avatar, ConfirmDialog, GroupedList, ListRow, showToast } from '@/components';
import { useLogoutMutation } from '@/features/auth/session';
import { useMe } from '@/hooks/useAuth';
import { paths } from '@/routes/paths';
import { ChangePasswordSheet } from './ChangePasswordSheet';
import { EditNameSheet } from './EditNameSheet';
import './account.css';

type OpenSheet = 'name' | 'password' | null;

/**
 * Profile content (pushed screen `/profil`, laid out like screen 09): 72 px avatar, display name
 * (`title2`) and e-mail centred, then grouped cards with Settings Rows – edit the name (sheet),
 * change the password (sheet), links to Haushalt / Einstellungen and "Abmelden" (destructive,
 * confirmed). Logging out clears every cached query, disconnects the socket and the auth guard
 * continues to `/login`.
 */
export function ProfileView() {
  const { data: me } = useMe();
  const logout = useLogoutMutation();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  // A new key per opening remounts the sheet content with fresh fields (a closing sheet keeps its key).
  const [sheetKeys, setSheetKeys] = useState({ name: 0, password: 0 });
  const [confirmLogout, setConfirmLogout] = useState(false);

  if (!me) return null;
  const { user } = me;

  const openSheet = (next: Exclude<OpenSheet, null>): void => {
    setSheetKeys((keys) => ({ ...keys, [next]: keys[next] + 1 }));
    setSheet(next);
  };

  return (
    <>
      <section className="account-hero" aria-label="Dein Profil">
        <Avatar name={user.displayName} seed={user.id} self size={72} />
        <h2 className="account-hero__name">{user.displayName}</h2>
        <p className="account-hero__meta">{user.email}</p>
      </section>

      <div className="account-sections account-sections--after-hero">
        <GroupedList label="Konto">
          <ListRow
            variant="settings"
            icon="person"
            title="Anzeigename"
            value={user.displayName}
            className="account-name-row"
            onClick={() => openSheet('name')}
          />
          <ListRow variant="settings" icon="pencil" title="Passwort ändern" onClick={() => openSheet('password')} />
        </GroupedList>

        <GroupedList label="App">
          <ListRow variant="settings" icon="house" title="Haushalt" to={paths.household} />
          <ListRow variant="settings" icon="sliders" title="Einstellungen" to={paths.settings} />
        </GroupedList>

        <GroupedList aria-label="Abmelden">
          <ListRow
            variant="settings"
            icon="doorOut"
            title="Abmelden"
            tone="destructive"
            chevron={false}
            className="account-logout-row"
            onClick={() => setConfirmLogout(true)}
          />
        </GroupedList>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title="Abmelden?"
        message="Du wirst auf diesem Gerät abgemeldet. Deine Daten bleiben erhalten."
        confirmLabel="Abmelden"
        tone="destructive"
        busy={logout.isPending}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() =>
          logout.mutate(undefined, {
            onError: (error) => {
              setConfirmLogout(false);
              showToast({ message: error.message, tone: 'error' });
            },
          })
        }
      />

      <EditNameSheet
        key={`name-${sheetKeys.name}`}
        open={sheet === 'name'}
        currentName={user.displayName}
        onClose={() => setSheet(null)}
      />
      <ChangePasswordSheet
        key={`password-${sheetKeys.password}`}
        open={sheet === 'password'}
        email={user.email}
        onClose={() => setSheet(null)}
      />
    </>
  );
}
