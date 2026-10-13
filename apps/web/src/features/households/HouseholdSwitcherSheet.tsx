import { HomiBottomSheet, Icon, showToast } from '@/components';
import { useActiveHousehold } from '@/hooks/useActiveHousehold';
import { haptic } from '@/lib/haptics';
import { memberCountLabel, roleLabel } from './roles';
import './households.css';

export interface HouseholdSwitcherSheetProps {
  open: boolean;
  onClose: () => void;
  /** "Neuen Haushalt erstellen" – the caller opens the name sheet. */
  onCreateNew: () => void;
}

/**
 * "Haushalt wechseln" (Home household switcher): every membership as an option row with the
 * role/member count, a check on the active one, and "Neuen Haushalt erstellen".
 */
export function HouseholdSwitcherSheet({ open, onClose, onCreateNew }: HouseholdSwitcherSheetProps) {
  const { householdId, households, switchHousehold } = useActiveHousehold();

  const select = (id: string, name: string): void => {
    onClose();
    if (id === householdId) return;
    haptic('selection');
    switchHousehold(id).catch(() => {
      showToast({ message: `Wechsel zu «${name}» fehlgeschlagen`, tone: 'error' });
    });
  };

  return (
    <HomiBottomSheet
      open={open}
      variant="action"
      title="Haushalt wechseln"
      cancelLabel="Abbrechen"
      onClose={onClose}
      className="households-sheet"
    >
      <div className="homi-sheet-options">
        {/* Only the households form the radio group – the create action is a plain button after it. */}
        <div className="homi-sheet-options" role="radiogroup" aria-label="Haushalte">
          {households.map((household) => {
            const active = household.id === householdId;
            return (
              <button
                key={household.id}
                type="button"
                role="radio"
                aria-checked={active}
                className="homi-sheet-option households-option"
                onClick={() => select(household.id, household.name)}
              >
                <span className="homi-sheet-option__icon" aria-hidden="true">
                  <Icon name="house" size={24} strokeWidth={1.8} />
                </span>
                <span className="households-option__text">
                  <span className="households-option__title">{household.name}</span>
                  <span className="households-option__subtitle">
                    {roleLabel(household.role)} · {memberCountLabel(household.memberCount)}
                  </span>
                </span>
                {active ? <Icon name="check" size={20} strokeWidth={2.6} className="households-option__check" /> : null}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="homi-sheet-option"
          onClick={() => {
            onClose();
            onCreateNew();
          }}
        >
          <span className="homi-sheet-option__icon" aria-hidden="true">
            <Icon name="plus" size={24} strokeWidth={1.8} />
          </span>
          <span className="homi-sheet-option__label">Neuen Haushalt erstellen</span>
        </button>
      </div>
    </HomiBottomSheet>
  );
}
