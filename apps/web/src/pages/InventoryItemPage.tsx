// PLACEHOLDER – replaced by the inventory feature team
import { useParams } from 'react-router';
import { Button } from '@/components/Button';
import { GlassButton } from '@/components/GlassButton';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { useGoBack, useOpenSheet } from '@/routes/navigation';
import { paths } from '@/routes/paths';

export function InventoryItemPage() {
  const { id = '' } = useParams<{ id: string }>();
  const goBack = useGoBack(paths.inventory);
  const openSheet = useOpenSheet();
  return (
    <Screen
      header={
        <LargeTitleHeader title="Artikel" leading={<GlassButton icon="chevL" label="Zurück" onClick={goBack} />} />
      }
    >
      <Button variant="secondary" onClick={() => openSheet(paths.inventoryEdit(id))}>
        Bearbeiten
      </Button>
    </Screen>
  );
}
