import { useReducedMotion } from 'motion/react';
import { GroupedList, ListRow, SegmentedControl, Switch, type SegmentedOption } from '@/components';
import { useThemeStore, type Appearance } from '@/lib/theme';
import { paths } from '@/routes/paths';
import { APP_VERSION } from './appVersion';
import './account.css';

const APPEARANCE_OPTIONS: readonly SegmentedOption<Appearance>[] = [
  { value: 'system', label: 'Automatisch' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

/**
 * Settings content (pushed screen `/einstellungen`): grouped cards with Settings Rows (30 px icon
 * tiles, r 8) like screen 09 – Erscheinungsbild (Automatisch / Hell / Dunkel), "Transparenz
 * reduzieren", the system "Bewegung reduzieren" status, links to Profil / Haushalt and the app
 * version. Appearance preferences are stored on the device (lib/theme).
 */
export function SettingsView() {
  const appearance = useThemeStore((state) => state.appearance);
  const reduceTransparency = useThemeStore((state) => state.reduceTransparency);
  const setAppearance = useThemeStore((state) => state.setAppearance);
  const setReduceTransparency = useThemeStore((state) => state.setReduceTransparency);
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <div className="account-sections">
      <GroupedList
        label="Erscheinungsbild"
        as="group"
        footer="«Automatisch» folgt der Darstellung deines Geräts. Gilt nur auf diesem Gerät."
      >
        <div className="homi-row-item account-segment-row">
          <SegmentedControl
            label="Erscheinungsbild"
            value={appearance}
            options={APPEARANCE_OPTIONS}
            onValueChange={setAppearance}
          />
        </div>
        <ListRow
          variant="settings"
          wrapper="div"
          icon="stack"
          title="Transparenz reduzieren"
          trailing={
            <Switch
              label="Transparenz reduzieren"
              checked={reduceTransparency}
              onCheckedChange={setReduceTransparency}
            />
          }
        />
      </GroupedList>

      <GroupedList
        label="Bewegung"
        footer="Homi folgt der Systemeinstellung «Bewegung reduzieren» (iOS: Bedienungshilfen › Bewegung). Ist sie aktiv, werden Übergänge zu ruhigen Überblendungen."
      >
        <ListRow variant="settings" icon="arrowR" title="Bewegung reduzieren" value={reducedMotion ? 'Aktiv' : 'Aus'} />
      </GroupedList>

      <GroupedList label="Konto & Haushalt">
        <ListRow variant="settings" icon="personCircle" title="Profil" to={paths.profile} />
        <ListRow variant="settings" icon="house" title="Haushalt" to={paths.household} />
      </GroupedList>

      <GroupedList label="Info">
        <ListRow variant="settings" icon="tag" title="App-Version" value={APP_VERSION} />
      </GroupedList>
    </div>
  );
}
