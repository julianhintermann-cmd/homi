import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Icon, type IconName } from '@/icons/Icon';
import { Portal } from './Portal';
import { useModalLayer } from './useModalLayer';
import {
  menuGroupStarts,
  placeContextMenu,
  readSafeInsets,
  type AnchorRect,
  type MenuPlacement,
} from './overlayGeometry';
import { cx } from './utils';

export type { AnchorRect } from './overlayGeometry';

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: IconName;
  /** Destructive items are red and grouped after a 9 px band (FIDELITY §4.4). */
  destructive?: boolean;
  disabled?: boolean;
  /** Start a new group (9 px band) before this item. */
  separatorBefore?: boolean;
  /**
   * Single-choice menus (e.g. a sort order): when set, the item is a `menuitemradio` and its
   * state is announced (`aria-checked`); show the check icon on the selected one.
   */
  checked?: boolean;
  onSelect: () => void;
}

export interface ContextMenuProps {
  open: boolean;
  onClose: () => void;
  /** Box of the pressed element in viewport coordinates. */
  anchorRect: AnchorRect | null;
  items: readonly ContextMenuItem[];
  /** Lifted copy of the pressed element, drawn above the dim (r 18 + lifted shadow). */
  preview?: ReactNode;
  /** Accessible name of the menu. Default "Aktionen". */
  label?: string;
  /**
   * Render only the menu panel in place – no portal, dim, positioning or focus handling
   * (design gallery / documentation). `open` and `anchorRect` are ignored.
   */
  inline?: boolean;
}

/**
 * Freegma "Context Menu": 250 px near-opaque surface (97 %), glass edge + shadow, r 24,
 * 48 px items (`body` label at 18, 21 px icon on the right), hairlines between items and a 9 px
 * band before the destructive group. Opens over a 22 % dim with the lifted source element.
 * Keyboard: arrows/Home/End move, Enter/Space select, Escape closes.
 */
export function ContextMenu({
  open,
  onClose,
  anchorRect,
  items,
  preview,
  label = 'Aktionen',
  inline = false,
}: ContextMenuProps) {
  if (inline) {
    return (
      <div role="menu" aria-label={label} className="homi-context-menu" data-inline>
        <ContextMenuItems items={items} onClose={onClose} />
      </div>
    );
  }
  return (
    <AnimatePresence>
      {open && anchorRect ? (
        <ContextMenuOverlay
          key="context-menu"
          onClose={onClose}
          anchorRect={anchorRect}
          items={items}
          preview={preview}
          label={label}
        />
      ) : null}
    </AnimatePresence>
  );
}

interface OverlayProps {
  onClose: () => void;
  anchorRect: AnchorRect;
  items: readonly ContextMenuItem[];
  preview?: ReactNode;
  label: string;
}

function ContextMenuOverlay({ onClose, anchorRect, items, preview, label }: OverlayProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  /**
   * Only a press that started on the dim dismisses the menu. A long press opens the menu while the
   * finger is still down; the click the browser sends when it is lifted lands on the dim (mounted
   * under the finger) and must not close the menu again.
   */
  const dimPressed = useRef(false);
  const reducedMotion = useReducedMotion() ?? false;
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);

  useModalLayer({ container: menuRef, onEscape: onClose });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    setPlacement(
      placeContextMenu(
        anchorRect,
        menu.offsetHeight,
        { width: window.innerWidth, height: window.innerHeight },
        readSafeInsets(),
      ),
    );
  }, [anchorRect]);

  const focusItem = (direction: 1 | -1 | 'first' | 'last'): void => {
    const menu = menuRef.current;
    if (!menu) return;
    const entries = Array.from(
      menu.querySelectorAll<HTMLButtonElement>(':is([role="menuitem"], [role="menuitemradio"]):not([disabled])'),
    );
    if (entries.length === 0) return;
    const current = entries.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (direction === 'first') next = 0;
    else if (direction === 'last') next = entries.length - 1;
    else next = current === -1 ? 0 : (current + direction + entries.length) % entries.length;
    entries[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowDown') focusItem(1);
    else if (event.key === 'ArrowUp') focusItem(-1);
    else if (event.key === 'Home') focusItem('first');
    else if (event.key === 'End') focusItem('last');
    else return;
    event.preventDefault();
  };

  const fade = { duration: reducedMotion ? 0.01 : 0.2, ease: 'easeOut' } as const;
  const menuStyle: CSSProperties = placement
    ? {
        top: placement.top,
        left: placement.left,
        transformOrigin: placement.origin === 'top' ? 'top right' : 'bottom right',
      }
    : { top: anchorRect.bottom + 12, left: -9999 };
  const previewStyle: CSSProperties = {
    top: anchorRect.top,
    left: anchorRect.left,
    width: anchorRect.width,
    height: anchorRect.height,
  };
  return (
    <Portal>
      <div className="homi-context-menu-layer">
        <motion.div
          className="homi-overlay-dim"
          data-dim="menu"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
          onPointerDown={() => {
            dimPressed.current = true;
          }}
          onClick={() => {
            if (!dimPressed.current) return;
            dimPressed.current = false;
            onClose();
          }}
        />
        {preview ? (
          <motion.div
            className="homi-context-menu__preview"
            style={previewStyle}
            aria-hidden="true"
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 1, scale: reducedMotion ? 1 : 1.015 }}
            exit={{ opacity: 0, scale: 1 }}
            transition={fade}
            inert
          >
            {preview}
          </motion.div>
        ) : null}
        <motion.div
          ref={menuRef}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          className="homi-context-menu"
          style={menuStyle}
          onKeyDown={onKeyDown}
          initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.92 }}
          animate={{ opacity: placement ? 1 : 0, scale: 1 }}
          exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96 }}
          transition={fade}
        >
          <ContextMenuItems items={items} onClose={onClose} />
        </motion.div>
      </div>
    </Portal>
  );
}

function ContextMenuItems({ items, onClose }: { items: readonly ContextMenuItem[]; onClose: () => void }) {
  const groupStarts = menuGroupStarts(items);
  return (
    <>
      {items.map((item, index) => (
        <div key={item.key} className="homi-context-menu__entry" role="none">
          {groupStarts.has(index) ? <div className="homi-context-menu__band" role="separator" /> : null}
          <button
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={item.checked}
            className={cx('homi-context-menu__item', item.destructive && 'homi-context-menu__item--destructive')}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <span className="homi-context-menu__label">{item.label}</span>
            {item.icon ? (
              <Icon name={item.icon} size={21} strokeWidth={2.06} className="homi-context-menu__icon" />
            ) : null}
          </button>
        </div>
      ))}
    </>
  );
}
