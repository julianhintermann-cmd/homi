import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HomiBottomSheet, SheetHeader } from './HomiBottomSheet';

function renderSheet({ dirty = false, onClose = vi.fn() } = {}) {
  render(
    <HomiBottomSheet onClose={onClose} dirty={dirty} aria-label="Neuer Artikel">
      <SheetHeader title="Neuer Artikel" />
      <input aria-label="Artikelname" />
    </HomiBottomSheet>,
  );
  return onClose;
}

describe('HomiBottomSheet', () => {
  it('is a labelled modal dialog', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Neuer Artikel' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('closes on Escape when there are no unsaved changes', () => {
    const onClose = renderSheet();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the header close button', async () => {
    const user = userEvent.setup();
    const onClose = renderSheet();
    await user.click(screen.getByRole('button', { name: 'Schliessen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding unsaved changes and only closes on confirmation', async () => {
    const user = userEvent.setup();
    const onClose = renderSheet({ dirty: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole('alertdialog', { name: 'Änderungen verwerfen?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Weiter bearbeiten' }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Schliessen' }));
    await user.click(await screen.findByRole('button', { name: 'Verwerfen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape inside the discard dialog cancels the dialog, not the sheet', async () => {
    const onClose = renderSheet({ dirty: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    await screen.findByRole('alertdialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes only once even when several dismiss requests arrive', () => {
    const onClose = renderSheet();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the action variant with title and cancel pill', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <HomiBottomSheet open variant="action" title="Foto hinzufügen" cancelLabel="Abbrechen" onClose={onClose}>
        <p>Optionen</p>
      </HomiBottomSheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Foto hinzufügen' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
