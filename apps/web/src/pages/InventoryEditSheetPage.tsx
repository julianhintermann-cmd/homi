// PLACEHOLDER – replaced by the inventory feature team
import { useParams } from 'react-router';
import { Button } from '@/components/Button';
import { useCloseSheet } from '@/routes/navigation';

export interface InventoryEditSheetPageProps {
  /** `new`: /inventar/neu – `edit`: /inventar/:id/bearbeiten */
  mode: 'new' | 'edit';
}

export function InventoryEditSheetPage({ mode }: InventoryEditSheetPageProps) {
  const { id } = useParams<{ id: string }>();
  const closeSheet = useCloseSheet();
  return (
    <div style={{ padding: 'var(--space-20) var(--screen-gutter)' }}>
      <h2 style={{ font: 'var(--type-title3)', margin: 0 }}>
        {mode === 'new' ? 'Neuer Artikel' : 'Artikel bearbeiten'}
      </h2>
      {mode === 'edit' && id ? <p>Artikel {id}</p> : null}
      <Button variant="secondary" onClick={() => closeSheet()}>
        Abbrechen
      </Button>
    </div>
  );
}
