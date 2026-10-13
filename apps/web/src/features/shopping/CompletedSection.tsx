import { useId, type ReactNode } from 'react';
import { SHOPPING_LIMITS } from '@homi/shared';
import { Icon } from '@/components';

export interface CompletedSectionProps {
  count: number;
  expanded: boolean;
  onToggle: () => void;
  /** "Leeren" (asks for confirmation in the screen). */
  onClear: () => void;
  /** The completed rows (`ShoppingRow`s). */
  children: ReactNode;
}

/**
 * "Erledigt · n" disclosure (design 03: collapsed, chevron down; 03b: expanded with "Leeren", the
 * completed card and the 24-hour hint). The expanded state is remembered by the screen.
 */
export function CompletedSection({ count, expanded, onToggle, onClear, children }: CompletedSectionProps) {
  const listId = useId();
  const hours = SHOPPING_LIMITS.completedVisibleHours;
  return (
    <section className="shopping-completed" data-expanded={expanded || undefined} aria-label="Erledigte Artikel">
      <div className="shopping-completed__header">
        <button
          type="button"
          className="shopping-completed__toggle"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          onClick={onToggle}
        >
          <span>Erledigt · {count}</span>
          <Icon name="chevD" size={14} strokeWidth={3.77} className="shopping-completed__chevron" />
        </button>
        {expanded ? (
          <button type="button" className="shopping-completed__clear" onClick={onClear}>
            Leeren
          </button>
        ) : null}
      </div>
      {expanded ? (
        <>
          <ul id={listId} className="homi-card shopping-list" role="list">
            {children}
          </ul>
          <p className="shopping-completed__hint">
            Abgehakte Artikel werden nach {hours} Stunden automatisch ausgeblendet.
          </p>
        </>
      ) : null}
    </section>
  );
}
