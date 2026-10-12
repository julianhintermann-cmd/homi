// PLACEHOLDER – replaced by the account feature team
import { GlassButton } from '@/components/GlassButton';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { useThemeStore, type Appearance } from '@/lib/theme';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';

const APPEARANCE_OPTIONS: ReadonlyArray<{ value: Appearance; label: string }> = [
  { value: 'system', label: 'Automatisch' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

export function SettingsPage() {
  const goBack = useGoBack(paths.home);
  const appearance = useThemeStore((s) => s.appearance);
  const reduceTransparency = useThemeStore((s) => s.reduceTransparency);
  const setAppearance = useThemeStore((s) => s.setAppearance);
  const setReduceTransparency = useThemeStore((s) => s.setReduceTransparency);

  return (
    <Screen
      header={
        <LargeTitleHeader
          title="Einstellungen"
          leading={<GlassButton icon="chevL" label="Zurück" onClick={goBack} />}
        />
      }
    >
      <fieldset>
        <legend>Darstellung</legend>
        {APPEARANCE_OPTIONS.map((option) => (
          <label key={option.value} style={{ display: 'block' }}>
            <input
              type="radio"
              name="appearance"
              value={option.value}
              checked={appearance === option.value}
              onChange={() => setAppearance(option.value)}
            />{' '}
            {option.label}
          </label>
        ))}
      </fieldset>
      <label>
        <input
          type="checkbox"
          checked={reduceTransparency}
          onChange={(event) => setReduceTransparency(event.target.checked)}
        />{' '}
        Transparenz reduzieren
      </label>
    </Screen>
  );
}
