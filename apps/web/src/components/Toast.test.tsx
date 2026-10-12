import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast, ToastHost } from './Toast';
import { DEFAULT_TOAST_DURATION_MS, dismissToast, showToast, toastDuration, useToastStore } from './toastStore';

afterEach(() => {
  act(() => dismissToast());
  vi.useRealTimers();
});

describe('Toast', () => {
  it('announces politely and renders the design content', () => {
    render(<Toast tone="success" message="Olivenöl hinzugefügt" actionLabel="Rückgängig" onAction={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Olivenöl hinzugefügt');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeInTheDocument();
  });

  it('uses an assertive alert for errors', () => {
    render(<Toast tone="error" message="Speichern fehlgeschlagen" />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('runs the action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Toast message="Olivenöl hinzugefügt" actionLabel="Rückgängig" onAction={onAction} />);
    await user.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after the given time and pauses while hovered', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Gespeichert" autoDismissMs={3000} onDismiss={onDismiss} />);
    const toast = screen.getByRole('status');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.pointerEnter(toast);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(toast);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows a close button only for persistent toasts', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast message="Update verfügbar" onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: 'Schliessen' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    rerender(<Toast message="Gespeichert" onDismiss={onDismiss} autoDismissMs={2000} />);
    expect(screen.queryByRole('button', { name: 'Schliessen' })).not.toBeInTheDocument();
  });
});

describe('toast store + ToastHost', () => {
  it('derives the auto-dismiss duration', () => {
    expect(toastDuration({})).toBe(DEFAULT_TOAST_DURATION_MS);
    expect(toastDuration({ tone: 'error' })).toBeGreaterThan(DEFAULT_TOAST_DURATION_MS);
    expect(toastDuration({ duration: 0 })).toBe(0);
  });

  it('shows the toast, hides the toolbar meanwhile and dismisses it automatically', () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    act(() => {
      showToast({ message: 'Olivenöl hinzugefügt', actionLabel: 'Rückgängig', onAction: vi.fn() });
    });
    expect(screen.getByText('Olivenöl hinzugefügt')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-toast-visible');
    act(() => {
      vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS);
    });
    expect(useToastStore.getState().current).toBeNull();
    expect(document.documentElement).not.toHaveAttribute('data-toast-visible');
  });

  it('runs the action once and dismisses the toast', () => {
    const onAction = vi.fn();
    render(<ToastHost />);
    act(() => {
      showToast({ message: 'Olivenöl hinzugefügt', actionLabel: 'Rückgängig', onAction });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().current).toBeNull();
  });

  it('replaces the visible toast with a newer one', () => {
    render(<ToastHost />);
    act(() => {
      showToast({ message: 'Erster' });
      showToast({ message: 'Zweiter' });
    });
    expect(useToastStore.getState().current?.message).toBe('Zweiter');
  });
});
