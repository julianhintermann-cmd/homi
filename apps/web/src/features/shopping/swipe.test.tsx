import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShoppingItemRow, SwipeableRow } from '@/components';
import {
  COMPLETED_EXPANDED_STORAGE_KEY,
  readCompletedExpanded,
  useCompletedExpanded,
  writeCompletedExpanded,
} from './completedDisclosure';
import { RESTORE_LABEL, shoppingSwipeActions } from './swipe';

describe('shoppingSwipeActions', () => {
  const handlers = () => ({ onComplete: vi.fn(), onRestore: vi.fn(), onDelete: vi.fn() });

  it('maps an open row to "Erledigt" (swipe right) and "Löschen" (swipe left)', () => {
    const h = handlers();
    const { leading, trailing } = shoppingSwipeActions(false, h);
    expect(leading.map((a) => [a.key, a.label, a.tone])).toEqual([['complete', 'Erledigt', 'accent']]);
    expect(trailing.map((a) => [a.key, a.label, a.tone])).toEqual([['delete', 'Löschen', 'destructive']]);
    leading[0]?.onAction();
    trailing[0]?.onAction();
    expect(h.onComplete).toHaveBeenCalledTimes(1);
    expect(h.onDelete).toHaveBeenCalledTimes(1);
    expect(h.onRestore).not.toHaveBeenCalled();
  });

  it('maps a completed row to "Wiederherstellen" (two lines that fit the 76 px action, no icon)', () => {
    const h = handlers();
    const { leading, trailing } = shoppingSwipeActions(true, h);
    expect(leading.map((a) => a.label)).toEqual([RESTORE_LABEL]);
    expect(RESTORE_LABEL.replace('\u00AD', '')).toBe('Wiederherstellen');
    // Only break opportunity: the soft hyphen ("Wieder-" / "herstellen").
    expect(RESTORE_LABEL.split('\u00AD')).toEqual(['Wieder', 'herstellen']);
    expect(leading[0]?.icon).toBeUndefined();
    expect(trailing.map((a) => a.label)).toEqual(['Löschen']);
    leading[0]?.onAction();
    expect(h.onRestore).toHaveBeenCalledTimes(1);
    expect(h.onComplete).not.toHaveBeenCalled();
  });

  it('offers the leading and trailing actions of a SwipeableRow without gestures', async () => {
    const user = userEvent.setup();
    const h = handlers();
    const { leading, trailing } = shoppingSwipeActions(false, h);
    render(
      <ul>
        <SwipeableRow menuLabel="Milch" actions={trailing} leadingActions={leading}>
          <ShoppingItemRow wrapper="div" name="Milch" quantity="2 Liter" completed={false} onPress={vi.fn()} />
        </SwipeableRow>
      </ul>,
    );
    const panels = document.querySelectorAll('.homi-swipe__actions');
    expect(panels).toHaveLength(2);
    expect(panels[1]).toHaveAttribute('data-side', 'leading');
    for (const panel of panels) {
      expect(panel).toHaveAttribute('aria-hidden', 'true');
      expect(panel).toHaveAttribute('inert');
    }

    fireEvent.keyDown(screen.getByRole('button', { name: 'Milch, 2 Liter bearbeiten' }), {
      key: 'F10',
      shiftKey: true,
    });
    const menu = await screen.findByRole('menu', { name: 'Milch' });
    expect(Array.from(menu.querySelectorAll('[role="menuitem"]'), (el) => el.textContent)).toEqual([
      'Erledigt',
      'Löschen',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Erledigt' }));
    expect(h.onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('ShoppingItemRow with onPress', () => {
  it('separates the checkbox from the row button', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const onCompletedChange = vi.fn();
    render(
      <ul>
        <ShoppingItemRow
          name="Eier"
          quantity="12 Stück"
          completed={false}
          onPress={onPress}
          onCompletedChange={onCompletedChange}
        />
      </ul>,
    );
    await user.click(screen.getByRole('button', { name: 'Eier, 12 Stück bearbeiten' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onCompletedChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: 'Eier, 12 Stück' }));
    expect(onCompletedChange).toHaveBeenCalledWith(true);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('completed disclosure persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts collapsed and remembers the expanded state across mounts', () => {
    const first = renderHook(() => useCompletedExpanded());
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1](true));
    expect(first.result.current[0]).toBe(true);
    expect(window.localStorage.getItem(COMPLETED_EXPANDED_STORAGE_KEY)).toBe('1');
    first.unmount();

    const second = renderHook(() => useCompletedExpanded());
    expect(second.result.current[0]).toBe(true);
    act(() => second.result.current[1]((current) => !current));
    expect(second.result.current[0]).toBe(false);
    expect(readCompletedExpanded()).toBe(false);
  });

  it('falls back to collapsed when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(readCompletedExpanded()).toBe(false);
    expect(() => writeCompletedExpanded(true)).not.toThrow();
    const { result } = renderHook(() => useCompletedExpanded());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });
});
