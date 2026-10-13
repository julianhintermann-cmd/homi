import { useState } from 'react';
import type { HouseholdDetail } from '@homi/shared';
import {
  Avatar,
  Button,
  EmptyState,
  GroupedList,
  InlineHeader,
  ListRow,
  Screen,
  Skeleton,
  SkeletonList,
} from '@/components';
import { useRequiredHouseholdId } from '@/hooks/useActiveHousehold';
import { useMe } from '@/hooks/useAuth';
import { formatNumber } from '@/lib/format';
import { useThemeStore, type Appearance } from '@/lib/theme';
import { useGoBack } from '@/routes/navigation';
import { paths } from '@/routes/paths';
import { InviteSheet } from './InviteSheet';
import { ManageHouseholdSheet } from './ManageHouseholdSheet';
import { useHouseholdDetail } from './queries';
import { householdPermissions, itemCountLabel, memberCountLabel, roleLabel, sortMembersSelfFirst } from './roles';
import './households.css';

const APPEARANCE_LABELS: Readonly<Record<Appearance, string>> = {
  system: 'Automatisch',
  light: 'Hell',
  dark: 'Dunkel',
};

/**
 * `/haushalt` (design 09 "Haushalt & Profil"): household avatar, name and counts; members
 * (current user first as "Du") with the invite row for ADMIN+; settings rows (manage household,
 * appearance, profile, settings).
 */
export function HouseholdScreen() {
  const householdId = useRequiredHouseholdId();
  const goBack = useGoBack(paths.home);
  const { data: me } = useMe();
  const detail = useHouseholdDetail(householdId);

  let content;
  if (detail.data && me) {
    content = <HouseholdContent household={detail.data} meId={me.user.id} />;
  } else if (detail.isError) {
    content = (
      <div className="household-state">
        <EmptyState
          icon="house"
          title="Haushalt nicht verfügbar"
          message={detail.error.message}
          action={
            <Button size="medium" variant="secondary" loading={detail.isFetching} onClick={() => void detail.refetch()}>
              Erneut versuchen
            </Button>
          }
        />
      </div>
    );
  } else {
    content = <HouseholdSkeleton />;
  }

  return (
    <Screen
      aria-labelledby="household-title"
      header={<InlineHeader title="Haushalt" titleId="household-title" onBack={goBack} />}
    >
      {content}
    </Screen>
  );
}

function HouseholdContent({ household, meId }: { household: HouseholdDetail; meId: string }) {
  const [sheet, setSheet] = useState<'invite' | 'manage' | null>(null);
  const appearance = useThemeStore((state) => state.appearance);
  const permissions = householdPermissions(household);
  const members = sortMembersSelfFirst(household.members, meId);

  return (
    <>
      <div className="household-hero">
        <Avatar name={household.name} household size={72} />
        <h2 className="household-hero__name">{household.name}</h2>
        <p className="household-hero__meta">
          {memberCountLabel(household.members.length)} · {itemCountLabel(household.stats.itemCount, formatNumber)}
        </p>
      </div>

      <div className="household-sections">
        <GroupedList label="Mitglieder">
          {members.map((member) => {
            const self = member.userId === meId;
            return (
              <ListRow
                key={member.userId}
                variant="member"
                title={self ? 'Du' : member.displayName}
                subtitle={roleLabel(member.role)}
                leading={<Avatar name={member.displayName} seed={member.userId} self={self} size={36} />}
                to={paths.member(member.userId)}
                aria-label={`${self ? `Du (${member.displayName})` : member.displayName}, ${roleLabel(member.role)}`}
              />
            );
          })}
          {permissions.canInvite ? (
            <ListRow variant="action" icon="personPlus" title="Mitglied einladen" onClick={() => setSheet('invite')} />
          ) : null}
        </GroupedList>

        <GroupedList label="Einstellungen">
          <ListRow variant="settings" icon="house" title="Haushalt verwalten" onClick={() => setSheet('manage')} />
          <ListRow
            variant="settings"
            icon="appearance"
            title="Erscheinungsbild"
            value={APPEARANCE_LABELS[appearance]}
            to={paths.settings}
          />
          <ListRow variant="settings" icon="personCircle" title="Profil" to={paths.profile} />
          <ListRow variant="settings" icon="sliders" title="Einstellungen" to={paths.settings} />
        </GroupedList>
      </div>

      {permissions.canInvite ? (
        <InviteSheet
          open={sheet === 'invite'}
          onClose={() => setSheet(null)}
          householdId={household.id}
          householdName={household.name}
        />
      ) : null}
      <ManageHouseholdSheet
        open={sheet === 'manage'}
        onClose={() => setSheet(null)}
        household={household}
        meId={meId}
      />
    </>
  );
}

function HouseholdSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Haushalt wird geladen …">
      <div className="household-hero">
        <Skeleton shape="circle" height={72} />
        <Skeleton shape="text" width={160} height={22} style={{ marginTop: 14 }} />
        <Skeleton shape="text" width={140} height={13} style={{ marginTop: 8 }} />
      </div>
      <div className="household-sections">
        <SkeletonList variant="settings" rows={3} label="Mitglieder werden geladen …" />
        <SkeletonList variant="settings" rows={4} label="Einstellungen werden geladen …" />
      </div>
    </div>
  );
}
