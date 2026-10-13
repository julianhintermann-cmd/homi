import { useRef, useState } from 'react';
import { ContextMenu, GlassToolbar, GlassToolbarItem, type AnchorRect, type ContextMenuItem } from '@/components';

export interface ShoppingToolbarProps {
  completedCount: number;
  completedExpanded: boolean;
  onToggleCompleted: () => void;
  onClearCompleted: () => void;
}

/**
 * Glass toolbar (design 03: Items=1, `ellipsis`) with the list menu:
 * "Erledigte ausblenden/anzeigen" and the destructive "Erledigte löschen".
 */
export function ShoppingToolbar({
  completedCount,
  completedExpanded,
  onToggleCompleted,
  onClearCompleted,
}: ShoppingToolbarProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);

  const items: ContextMenuItem[] = [
    {
      key: 'toggle-completed',
      label: completedExpanded ? 'Erledigte ausblenden' : 'Erledigte anzeigen',
      icon: 'checkCircle',
      disabled: completedCount === 0,
      onSelect: onToggleCompleted,
    },
    {
      key: 'clear-completed',
      label: 'Erledigte löschen',
      icon: 'trash',
      destructive: true,
      disabled: completedCount === 0,
      onSelect: onClearCompleted,
    },
  ];

  return (
    <>
      <GlassToolbar label="Einkaufsliste">
        <GlassToolbarItem
          ref={buttonRef}
          icon="ellipsis"
          label="Mehr"
          aria-haspopup="menu"
          aria-expanded={anchor !== null}
          onClick={() => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (!rect) return;
            setAnchor({
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              bottom: rect.bottom,
              right: rect.right,
            });
          }}
        />
      </GlassToolbar>
      <ContextMenu
        open={anchor !== null}
        anchorRect={anchor}
        items={items}
        label="Einkaufsliste"
        onClose={() => {
          setAnchor(null);
          buttonRef.current?.focus();
        }}
      />
    </>
  );
}
