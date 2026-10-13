import { useState } from 'react';
import { HomiBottomSheet, showToast } from '@/components';
import { CreateHouseholdForm } from './CreateHouseholdForm';
import './households.css';

export interface CreateHouseholdSheetProps {
  open: boolean;
  onClose: () => void;
}

/** "Neuer Haushalt": name → `POST /households` → the new household becomes active. */
export function CreateHouseholdSheet({ open, onClose }: CreateHouseholdSheetProps) {
  const [dirty, setDirty] = useState(false);
  return (
    <HomiBottomSheet
      open={open}
      variant="action"
      title="Neuer Haushalt"
      cancelLabel="Abbrechen"
      dirty={dirty}
      onClose={() => {
        setDirty(false);
        onClose();
      }}
      className="households-sheet"
    >
      <div className="households-sheet__stack">
        <p className="households-sheet__text" data-align="center">
          Du wirst Inhaber:in des neuen Haushalts und kannst danach Mitglieder einladen.
        </p>
        <CreateHouseholdForm
          autoFocus
          onDirtyChange={setDirty}
          onCreated={(household) => {
            setDirty(false);
            onClose();
            showToast({ message: `«${household.name}» erstellt` });
          }}
        />
      </div>
    </HomiBottomSheet>
  );
}
