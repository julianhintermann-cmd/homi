import { useEffect, useRef } from 'react';
import { showToast } from '@/components';

export const ITEM_REMOVED_MESSAGE = 'Dieser Artikel wurde inzwischen entfernt.';

/**
 * The edit sheet closes when its item disappears from the list – deleted by another member (or
 * hidden by the 24-hour rule) while it was open. Say why instead of closing silently and dropping
 * what was typed. Once per item; the user's own deletion closes the sheet first (no notice).
 */
export function useItemRemovedNotice(open: boolean, itemId: string | undefined, gone: boolean): void {
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !gone || itemId === undefined || notified.current === itemId) return;
    notified.current = itemId;
    showToast({ message: ITEM_REMOVED_MESSAGE, tone: 'neutral' });
  }, [open, gone, itemId]);
}
