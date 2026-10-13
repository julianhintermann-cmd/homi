import { startTransition, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SheetDirtyContext, useSheetDirty } from '@/routes/sheetDirty';
import { HomiBottomSheet, SheetHeader } from './HomiBottomSheet';
import { openModalLayerCount } from './useModalLayer';

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

  it('stops trapping focus and Escape as soon as it starts closing (e2e: composer text lost)', async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <textarea aria-label="Nachricht" />
          <HomiBottomSheet open={open} variant="action" title="Neuer Chat" onClose={() => setOpen(false)}>
            <button type="button" onClick={() => setOpen(false)}>
              Unser Zuhause
            </button>
          </HomiBottomSheet>
        </>
      );
    }
    render(<Harness />);
    expect(openModalLayerCount()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Unser Zuhause' }));
    // The sheet is still animating out …
    expect(document.querySelector('.homi-sheet-layer[data-exiting]')).not.toBeNull();
    // … but no longer a modal layer: focus and text go to the screen underneath.
    expect(openModalLayerCount()).toBe(0);
    const composer = screen.getByRole('textbox', { name: 'Nachricht' });
    composer.focus();
    fireEvent.change(composer, { target: { value: 'Hallo' } });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(document.activeElement).toBe(composer);
    expect(composer).toHaveValue('Hallo');
  });

  it('knows about input typed right before Escape (e2e: discard prompt one tick late)', async () => {
    const previous = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    const onClose = vi.fn();
    function Field() {
      const [value, setValue] = useState('');
      useSheetDirty(value !== '');
      return <input aria-label="Artikelname" value={value} onChange={(event) => setValue(event.target.value)} />;
    }
    // Same wiring as SheetLayer: the page reports "dirty" through the context into the sheet.
    function RouteSheet() {
      const [dirty, setDirty] = useState(false);
      return (
        <HomiBottomSheet onClose={onClose} dirty={dirty} aria-label="Neuer Artikel">
          <SheetDirtyContext.Provider value={setDirty}>
            <Field />
          </SheetDirtyContext.Provider>
        </HomiBottomSheet>
      );
    }
    render(<RouteSheet />);
    const input = screen.getByRole('textbox', { name: 'Artikelname' });
    // Real browser timing: no act() – the keystroke and the Escape are separate tasks.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    try {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(input, 'Entwurf');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previous;
    }
    expect(await screen.findByRole('alertdialog', { name: 'Änderungen verwerfen?' })).toBeInTheDocument();
  });

  it('handles Escape from the moment it is in the DOM (e2e: Escape dropped while the sheet mounts)', async () => {
    const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = actEnv.IS_REACT_ACT_ENVIRONMENT;
    actEnv.IS_REACT_ACT_ENVIRONMENT = false;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onClose = vi.fn();
    try {
      // A navigation renders in a transition; its passive effects may run long after the commit.
      const layersAtCommit = await new Promise<number>((resolve) => {
        const observer = new MutationObserver(() => {
          if (!document.querySelector('[role="dialog"]')) return;
          observer.disconnect();
          resolve(openModalLayerCount());
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        observer.observe(document.body, { childList: true, subtree: true });
        startTransition(() =>
          root.render(
            <HomiBottomSheet onClose={onClose} aria-label="Neuer Artikel">
              <p>Inhalt</p>
            </HomiBottomSheet>,
          ),
        );
      });
      expect(layersAtCommit).toBe(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      root.unmount();
      host.remove();
      actEnv.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  });
});
