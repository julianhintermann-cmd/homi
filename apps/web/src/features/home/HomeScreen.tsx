import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { MemberRef } from '@homi/shared';
import {
  AvatarStack,
  Button,
  EmptyState,
  Icon,
  LargeTitleHeader,
  ProfileButton,
  Screen,
  showToast,
  type AvatarStackPerson,
} from '@/components';
import { CreateHouseholdSheet } from '@/features/households/CreateHouseholdSheet';
import { HouseholdSwitcherSheet } from '@/features/households/HouseholdSwitcherSheet';
import { useActiveHousehold, useRequiredHouseholdId } from '@/hooks/useActiveHousehold';
import { useMe } from '@/hooks/useAuth';
import { useOpenSheet } from '@/routes/navigation';
import { paths } from '@/routes/paths';
import { greetingFor, msUntilNextHour } from './greeting';
import { HomeInventorySection, HomeShoppingSection, HomeSkeleton, HomeSummaryCard } from './HomeSections';
import { useCompleteShoppingItem, useDashboard, useReopenShoppingItem } from './queries';
import './home.css';

/** Greeting by local time; re-evaluated at the top of every hour while Home stays open. */
function useGreeting(): string {
  const [greeting, setGreeting] = useState(() => greetingFor());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (): void => {
      timer = setTimeout(() => {
        setGreeting(greetingFor());
        schedule();
      }, msUntilNextHour());
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return greeting;
}

function toPeople(members: readonly MemberRef[], meId: string): AvatarStackPerson[] {
  // The current user first (sage "Du" avatar), like the design's J · L · M stack.
  const sorted = [...members].sort((a, b) => Number(b.userId === meId) - Number(a.userId === meId));
  return sorted.map((member) => ({ id: member.userId, name: member.displayName, self: member.userId === meId }));
}

interface HouseholdSwitcherButtonProps {
  name: string;
  people: AvatarStackPerson[];
  onPress: () => void;
}

/** Avatar stack + household name + chevD (design y 130); opens "Haushalt wechseln". */
function HouseholdSwitcherButton({ name, people, onPress }: HouseholdSwitcherButtonProps) {
  return (
    <button
      type="button"
      className="home-switcher"
      onClick={onPress}
      aria-haspopup="dialog"
      aria-label={`Haushalt: ${name}. Haushalt wechseln`}
    >
      {people.length > 0 ? <AvatarStack people={people} /> : null}
      <span className="home-switcher__name">{name}</span>
      <Icon name="chevD" size={14} strokeWidth={3.77} className="home-switcher__chevron" />
    </button>
  );
}

/**
 * Home (design 01): greeting + "Dein Zuhause.", household switcher, profile button (→ /haushalt),
 * value summary, the 3 latest items and the next open shopping items. Data: `GET …/dashboard`,
 * kept fresh by realtime `sync` events (no activity feed – not part of the design).
 */
export function HomeScreen() {
  const householdId = useRequiredHouseholdId();
  const { data: me } = useMe();
  const { household } = useActiveHousehold();
  const dashboard = useDashboard(householdId);
  const complete = useCompleteShoppingItem(householdId);
  const reopen = useReopenShoppingItem(householdId);
  const navigate = useNavigate();
  const openSheet = useOpenSheet();
  const greeting = useGreeting();
  const [sheet, setSheet] = useState<'switch' | 'create' | null>(null);

  const meId = me?.user.id ?? '';
  const displayName = me?.user.displayName ?? '';
  const people = dashboard.data
    ? toPeople(dashboard.data.members, meId)
    : me
      ? [{ id: me.user.id, name: me.user.displayName, self: true }]
      : [];

  const onComplete = (shoppingItemId: string): void => {
    const item = dashboard.data?.openShoppingItems.find((entry) => entry.id === shoppingItemId);
    complete.mutate(shoppingItemId, {
      onError: (error) => {
        showToast({ message: error.message || 'Konnte nicht abgehakt werden', tone: 'error' });
      },
      onSuccess: () => {
        if (!item) return;
        // An accidental tick must be easy to take back without leaving Home.
        showToast({
          message: `${item.name} erledigt`,
          actionLabel: 'Rückgängig',
          onAction: () => reopen.mutate(shoppingItemId),
        });
      },
    });
  };

  let content;
  if (dashboard.data) {
    content = (
      <>
        <HomeSummaryCard dashboard={dashboard.data} />
        <HomeInventorySection items={dashboard.data.recentItems} onAddItem={() => openSheet(paths.inventoryNew)} />
        <HomeShoppingSection
          items={dashboard.data.openShoppingItems}
          openCount={dashboard.data.openShoppingCount}
          onComplete={onComplete}
          onOpenList={() => void navigate(paths.shopping)}
        />
      </>
    );
  } else if (dashboard.isError) {
    content = (
      <EmptyState
        icon="tray"
        title="Übersicht nicht verfügbar"
        message={dashboard.error.message}
        action={
          <Button
            size="medium"
            variant="secondary"
            loading={dashboard.isFetching}
            onClick={() => void dashboard.refetch()}
          >
            Erneut versuchen
          </Button>
        }
      />
    );
  } else {
    content = <HomeSkeleton />;
  }

  return (
    <Screen
      withTabBar
      aria-labelledby="home-title"
      header={
        <LargeTitleHeader
          eyebrow={greeting}
          title="Dein Zuhause."
          titleId="home-title"
          trailing={<ProfileButton name={displayName} to={paths.household} label="Haushalt & Profil" />}
          accessory={
            <HouseholdSwitcherButton name={household?.name ?? ''} people={people} onPress={() => setSheet('switch')} />
          }
        />
      }
    >
      {content}
      <HouseholdSwitcherSheet
        open={sheet === 'switch'}
        onClose={() => setSheet((current) => (current === 'switch' ? null : current))}
        onCreateNew={() => setSheet('create')}
      />
      <CreateHouseholdSheet
        open={sheet === 'create'}
        onClose={() => setSheet((current) => (current === 'create' ? null : current))}
      />
    </Screen>
  );
}
