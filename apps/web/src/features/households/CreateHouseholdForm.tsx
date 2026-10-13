import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CreateHouseholdRequestSchema, LIMITS, type HouseholdDetail } from '@homi/shared';
import { Button, TextField } from '@/components';
import { useCreateHousehold } from './queries';
import './households.css';

export interface CreateHouseholdFormProps {
  /** Called after the household was created and made active. */
  onCreated: (household: HouseholdDetail) => void;
  /** Reports unsaved input (sheets ask before discarding it). */
  onDirtyChange?: (dirty: boolean) => void;
  autoFocus?: boolean;
  submitLabel?: string;
}

/**
 * "Name des Haushalts" + primary "Haushalt erstellen" (Welcome screen and the "Neuer Haushalt"
 * sheet). Validates with the shared schema before sending; server errors are shown inline.
 */
export function CreateHouseholdForm({
  onCreated,
  onDirtyChange,
  autoFocus = false,
  submitLabel = 'Haushalt erstellen',
}: CreateHouseholdFormProps) {
  const create = useCreateHousehold();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return undefined;
    // A sheet moves focus to its panel one frame after mounting (useModalLayer), which overrides a
    // plain autoFocus attribute: focus the field one frame later so it wins.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [autoFocus]);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (create.isPending) return;
    const parsed = CreateHouseholdRequestSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Bitte gib einen Namen für den Haushalt ein.');
      return;
    }
    setError(null);
    create.mutate(parsed.data.name, {
      onSuccess: (household) => {
        onDirtyChange?.(false);
        onCreated(household);
      },
    });
  };

  const serverError = create.error ? create.error.message : null;
  return (
    <form className="households-form" onSubmit={onSubmit} noValidate>
      <TextField
        label="Name des Haushalts"
        placeholder="z. B. Unser Zuhause"
        value={name}
        maxLength={LIMITS.householdName.max}
        autoComplete="off"
        autoCapitalize="sentences"
        enterKeyHint="done"
        ref={inputRef}
        error={error ?? serverError}
        onChange={(event) => {
          setName(event.target.value);
          if (error) setError(null);
          onDirtyChange?.(event.target.value.trim().length > 0);
        }}
      />
      <Button type="submit" fullWidth loading={create.isPending}>
        {submitLabel}
      </Button>
    </form>
  );
}
