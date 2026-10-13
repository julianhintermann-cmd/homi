import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { LIMITS, RenameHouseholdRequestSchema, type HouseholdDetail } from '@homi/shared';
import { Button, ConfirmDialog, HomiBottomSheet, Icon, TextField, showToast } from '@/components';
import { paths } from '@/routes/paths';
import { useDeleteHousehold, useLeaveHousehold, useRenameHousehold } from './queries';
import { householdPermissions } from './roles';
import './households.css';

export interface ManageHouseholdSheetProps {
  open: boolean;
  onClose: () => void;
  household: HouseholdDetail;
  meId: string;
}

/**
 * "Haushalt verwalten": rename (ADMIN+), leave (blocked with an explanation for the last OWNER)
 * and delete (OWNER, typed confirmation). The server enforces the same rules.
 */
export function ManageHouseholdSheet({ open, onClose, household, meId }: ManageHouseholdSheetProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <HomiBottomSheet
      open={open}
      variant="action"
      title="Haushalt verwalten"
      cancelLabel="Abbrechen"
      dirty={dirty}
      onClose={() => {
        setDirty(false);
        onClose();
      }}
      className="households-sheet"
    >
      <ManageHouseholdContent household={household} meId={meId} onDirtyChange={setDirty} onClose={onClose} />
    </HomiBottomSheet>
  );
}

function ManageHouseholdContent({
  household,
  meId,
  onDirtyChange,
  onClose,
}: {
  household: HouseholdDetail;
  meId: string;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const permissions = householdPermissions(household);
  const [name, setName] = useState(household.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'leave' | 'delete' | null>(null);
  const [typed, setTyped] = useState('');
  const rename = useRenameHousehold(household.id);
  // Toast + navigation run in the hook callbacks: this screen unmounts once the household is gone.
  const goHome = (message: string) => {
    onClose();
    showToast({ message });
    void navigate(paths.home, { replace: true });
  };
  const leave = useLeaveHousehold(household.id, meId, {
    onGone: () => goHome(`Du hast «${household.name}» verlassen`),
  });
  const remove = useDeleteHousehold(household.id, { onGone: () => goHome(`«${household.name}» gelöscht`) });

  const trimmed = name.trim();
  const changed = trimmed !== household.name;

  const onRename = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const parsed = RenameHouseholdRequestSchema.safeParse({ name });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'Bitte gib einen Namen ein.');
      return;
    }
    if (!changed) return;
    rename.mutate(parsed.data.name, {
      onSuccess: (detail) => {
        onDirtyChange(false);
        setName(detail.name);
        showToast({ message: 'Name gespeichert' });
      },
      onError: (error) => setNameError(error.message),
    });
  };

  return (
    <div className="households-sheet__stack">
      {permissions.canRename ? (
        <form className="households-form" onSubmit={onRename} noValidate>
          <TextField
            label="Name des Haushalts"
            value={name}
            maxLength={LIMITS.householdName.max}
            autoComplete="off"
            enterKeyHint="done"
            error={nameError}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
              onDirtyChange(event.target.value.trim() !== household.name);
            }}
          />
          <Button type="submit" variant="secondary" fullWidth loading={rename.isPending} disabled={!changed}>
            Namen speichern
          </Button>
        </form>
      ) : (
        <p className="households-sheet__text" data-align="center">
          Den Namen können Inhaber:innen und die Verwaltung ändern.
        </p>
      )}

      <div className="homi-sheet-options">
        <button
          type="button"
          className="homi-sheet-option"
          data-tone="destructive"
          disabled={!permissions.canLeave}
          aria-describedby={permissions.canLeave ? undefined : 'household-leave-blocked'}
          onClick={() => setDialog('leave')}
        >
          <span className="homi-sheet-option__icon" aria-hidden="true">
            <Icon name="doorOut" size={24} strokeWidth={1.8} />
          </span>
          <span className="homi-sheet-option__label">Haushalt verlassen</span>
        </button>
        {permissions.canLeave ? null : (
          <p id="household-leave-blocked" className="households-sheet__text households-sheet__hint">
            Du bist die einzige Inhaberin bzw. der einzige Inhaber. Ernenne zuerst ein anderes Mitglied zur Inhaber:in –
            oder lösche den Haushalt.
          </p>
        )}
        {permissions.canDelete ? (
          <button
            type="button"
            className="homi-sheet-option"
            data-tone="destructive"
            onClick={() => {
              setTyped('');
              setDialog('delete');
            }}
          >
            <span className="homi-sheet-option__icon" aria-hidden="true">
              <Icon name="trash" size={24} strokeWidth={1.8} />
            </span>
            <span className="homi-sheet-option__label">Haushalt löschen</span>
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={dialog === 'leave'}
        title="Haushalt verlassen?"
        message={`Du verlierst den Zugriff auf Inventar, Einkaufsliste und Chats von «${household.name}».`}
        confirmLabel="Verlassen"
        busy={leave.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          leave.mutate(undefined, {
            onError: (error) => {
              setDialog(null);
              showToast({ message: error.message, tone: 'error' });
            },
          })
        }
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Haushalt löschen?"
        message={`Alle Artikel, Fotos, Einkaufslisten und Chats von «${household.name}» werden für alle Mitglieder endgültig gelöscht. Gib zur Bestätigung den Namen ein.`}
        confirmLabel="Löschen"
        busy={remove.isPending}
        confirmDisabled={typed.trim() !== household.name.trim()}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onError: (error) => {
              setDialog(null);
              showToast({ message: error.message, tone: 'error' });
            },
          })
        }
      >
        <TextField
          label={`Name zur Bestätigung: ${household.name}`}
          hideLabel
          value={typed}
          placeholder={household.name}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(event) => setTyped(event.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
