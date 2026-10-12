import { create } from 'zustand';

export type ToastTone = 'neutral' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  /** e.g. "Rückgängig" */
  actionLabel?: string;
  onAction?: () => void;
  /** Default `success` (check badge, design 14). */
  tone?: ToastTone;
  /** Auto-dismiss after this many ms. Default 4000 (errors 6000). `0` keeps it until dismissed. */
  duration?: number;
}

export interface ActiveToast extends ToastOptions {
  id: number;
}

interface ToastState {
  current: ActiveToast | null;
  show: (options: ToastOptions) => number;
  dismiss: (id?: number) => void;
}

let nextToastId = 0;

/** One toast at a time (iOS-like); a new toast replaces the visible one. */
export const useToastStore = create<ToastState>()((set, get) => ({
  current: null,
  show: (options) => {
    nextToastId += 1;
    set({ current: { tone: 'success', ...options, id: nextToastId } });
    return nextToastId;
  },
  dismiss: (id) => {
    const current = get().current;
    if (current && (id === undefined || current.id === id)) set({ current: null });
  },
}));

/** Shows a toast in the `ToastHost` (e.g. `showToast({ message: 'Olivenöl hinzugefügt', actionLabel: 'Rückgängig', onAction: undo })`). */
export function showToast(options: ToastOptions): number {
  return useToastStore.getState().show(options);
}

export function dismissToast(id?: number): void {
  useToastStore.getState().dismiss(id);
}

export const DEFAULT_TOAST_DURATION_MS = 4000;
export const ERROR_TOAST_DURATION_MS = 6000;

/** Effective auto-dismiss delay of a toast (0 = sticky). */
export function toastDuration(toast: Pick<ToastOptions, 'duration' | 'tone'>): number {
  if (toast.duration !== undefined) return Math.max(0, toast.duration);
  return toast.tone === 'error' ? ERROR_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS;
}
