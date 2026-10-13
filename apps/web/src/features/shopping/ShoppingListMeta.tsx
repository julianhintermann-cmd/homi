import { AvatarStack, type AvatarStackPerson } from '@/components';
import { progressOffset } from './listModel';

export interface ShoppingListMetaProps {
  /** Household members sharing the list (self first). */
  members: readonly AvatarStackPerson[];
  householdName: string | null;
  stats: { done: number; total: number };
}

/**
 * Shared-list meta (design 03 / 18, y 184): 24 px member avatars, household name and
 * "4 von 12 erledigt" right-aligned, then the 4 px progress bar 10 px below. The fill is a
 * full-width rounded bar slid in with `transform: translateX` (compositor-animated, no layout
 * work): unlike `scaleX` it keeps its 2 px rounded end at every ratio; the track clips the rest.
 */
export function ShoppingListMeta({ members, householdName, stats }: ShoppingListMetaProps) {
  const label = `${stats.done} von ${stats.total} erledigt`;
  return (
    <>
      <div className="shopping-meta">
        {members.length > 0 ? <AvatarStack people={members} className="shopping-meta__stack" /> : null}
        {householdName ? <span className="shopping-meta__household">{householdName}</span> : null}
        <span className="shopping-meta__progress" aria-hidden="true">
          {label}
        </span>
      </div>
      <div
        className="shopping-progress"
        role="progressbar"
        aria-label="Einkaufsfortschritt"
        aria-valuemin={0}
        aria-valuemax={stats.total}
        aria-valuenow={stats.done}
        aria-valuetext={label}
      >
        <span className="shopping-progress__fill" style={{ transform: `translateX(${progressOffset(stats)})` }} />
      </div>
    </>
  );
}
