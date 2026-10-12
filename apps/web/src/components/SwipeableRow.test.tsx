import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SwipeableRow } from './SwipeableRow';

function renderRow(onDelete = vi.fn()) {
  render(
    <ul>
      <SwipeableRow
        menuLabel="Milch"
        actions={[{ key: 'delete', label: 'Löschen', icon: 'trash', tone: 'destructive', onAction: onDelete }]}
      >
        <div tabIndex={0}>Milch</div>
      </SwipeableRow>
    </ul>,
  );
  return onDelete;
}

describe('SwipeableRow', () => {
  it('keeps the revealed actions out of the tab order while closed', () => {
    renderRow();
    const actions = document.querySelector('.homi-swipe__actions');
    expect(actions).toHaveAttribute('aria-hidden', 'true');
    expect(actions).toHaveAttribute('inert');
  });

  it('opts out of the tab swipe gesture', () => {
    renderRow();
    expect(document.querySelector('.homi-swipe')).toHaveAttribute('data-no-swipe');
  });

  it('offers the same actions via the keyboard context menu (Shift+F10)', async () => {
    const user = userEvent.setup();
    const onDelete = renderRow();
    const content = screen.getByText('Milch').parentElement as HTMLElement;
    fireEvent.keyDown(content, { key: 'F10', shiftKey: true });
    const item = await screen.findByRole('menuitem', { name: 'Löschen' });
    await user.click(item);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('offers the actions via right-click for mouse users', async () => {
    renderRow();
    fireEvent.contextMenu(screen.getByText('Milch').parentElement as HTMLElement);
    expect(await screen.findByRole('menu', { name: 'Milch' })).toBeInTheDocument();
  });
});
