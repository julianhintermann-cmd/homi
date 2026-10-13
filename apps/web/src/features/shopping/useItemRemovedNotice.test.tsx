import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '@/components';
import { ITEM_REMOVED_MESSAGE, useItemRemovedNotice } from './useItemRemovedNotice';

const ITEM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  useToastStore.setState({ current: null });
});

describe('useItemRemovedNotice', () => {
  it('explains why the open edit sheet closed when another member deleted the item', () => {
    const { rerender } = renderHook(({ open, gone }) => useItemRemovedNotice(open, ITEM, gone), {
      initialProps: { open: true, gone: false },
    });
    expect(useToastStore.getState().current).toBeNull();

    rerender({ open: true, gone: true });
    expect(useToastStore.getState().current).toMatchObject({ message: ITEM_REMOVED_MESSAGE });

    // Once per item, not on every re-render.
    useToastStore.setState({ current: null });
    rerender({ open: true, gone: true });
    expect(useToastStore.getState().current).toBeNull();
  });

  it('stays quiet when the sheet was already closed (the user deleted the item)', () => {
    const { rerender } = renderHook(({ open, gone }) => useItemRemovedNotice(open, ITEM, gone), {
      initialProps: { open: true, gone: false },
    });
    rerender({ open: false, gone: true });
    expect(useToastStore.getState().current).toBeNull();
  });
});
