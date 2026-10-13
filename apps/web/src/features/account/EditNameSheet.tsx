import { useRef, useState, type FormEvent } from 'react';
import { LIMITS, UpdateProfileRequestSchema } from '@homi/shared';
import { Button, HomiBottomSheet, SheetHeader, showToast, TextField } from '@/components';
import { mapSubmitError, validateFields } from '@/features/auth/formErrors';
import { useUpdateProfile } from './hooks';
import './account.css';

export interface EditNameSheetProps {
  open: boolean;
  currentName: string;
  onClose: () => void;
}

/**
 * Page sheet "Anzeigename" (design language of sheet 06): one text field and the primary
 * "Speichern" button pinned to the bottom of the sheet. Unsaved edits ask "Änderungen verwerfen?" before the sheet closes.
 * Mount it with a new `key` per opening so every opening starts from the current name.
 */
export function EditNameSheet({ open, currentName, onClose }: EditNameSheetProps) {
  const update = useUpdateProfile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const changed = name.trim() !== currentName;

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (update.isPending) return;
    const fieldErrors = validateFields<'displayName'>(UpdateProfileRequestSchema, { displayName: name });
    if (fieldErrors.displayName) {
      setError(fieldErrors.displayName);
      inputRef.current?.focus();
      return;
    }
    if (!changed) {
      onClose();
      return;
    }
    update.mutate(name.trim(), {
      onSuccess: () => {
        showToast({ message: 'Name gespeichert', tone: 'success' });
        onClose();
      },
      onError: (failure) => {
        const mapped = mapSubmitError(failure, ['displayName'] as const);
        setError(mapped.fieldErrors.displayName ?? mapped.formError);
      },
    });
  };

  return (
    <HomiBottomSheet
      open={open}
      dirty={name !== currentName && !update.isPending}
      onClose={onClose}
      aria-label="Anzeigename ändern"
    >
      <div className="account-sheet">
        <SheetHeader title="Anzeigename" />
        <form className="account-sheet-form" noValidate onSubmit={onSubmit}>
          <TextField
            ref={inputRef}
            label="Anzeigename"
            name="name"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="done"
            maxLength={LIMITS.displayName.max}
            placeholder="z. B. Julia"
            hint="So sehen dich die anderen Mitglieder deiner Haushalte."
            value={name}
            error={error}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
          <Button
            type="submit"
            fullWidth
            className="account-sheet-form__submit"
            loading={update.isPending}
            disabled={!changed || name.trim() === ''}
          >
            Speichern
          </Button>
        </form>
      </div>
    </HomiBottomSheet>
  );
}
