// PLACEHOLDER – replaced by the inventory feature team
import { GlassButton } from '@/components/GlassButton';
import { LargeTitleHeader } from '@/components/LargeTitleHeader';
import { Screen } from '@/components/Screen';
import { useOpenSheet } from '@/routes/navigation';
import { paths } from '@/routes/paths';

export function InventoryPage() {
  const openSheet = useOpenSheet();
  return (
    <Screen
      withTabBar
      header={
        <LargeTitleHeader
          title="Inventar"
          trailing={
            <GlassButton icon="plus" label="Artikel hinzufügen" onClick={() => openSheet(paths.inventoryNew)} />
          }
        />
      }
    >
      <p>Die Inventarliste folgt.</p>
    </Screen>
  );
}
