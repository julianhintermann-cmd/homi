import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { useSearchParams } from 'react-router';
import { ITEM_CATEGORY_VALUES } from '@homi/shared/core';
import type { ItemCategory, ItemSort } from '@homi/shared';
import {
  Button,
  Chip,
  ChipRow,
  ContextMenu,
  EmptyState,
  GlassToolbar,
  GlassToolbarItem,
  HomiSearchField,
  LargeTitleHeader,
  Screen,
  SkeletonList,
  type AnchorRect,
  type ContextMenuItem,
} from '@/components';
import { InventoryList } from '@/features/inventory/InventoryList';
import { listSubtitle, type ListSubtitleInput } from '@/features/inventory/format';
import { useDebouncedValue, useInventoryUiStore, useSortPreference } from '@/features/inventory/hooks';
import { useInventoryList } from '@/features/inventory/queries';
import { useItemActions } from '@/features/inventory/useItemActions';
import { useScrollContainer } from '@/hooks/useScrollMemory';
import { ITEM_CATEGORY_LABELS } from '@/lib/format';
import { useOpenSheet } from '@/routes/navigation';
import { paths } from '@/routes/paths';
import '@/features/inventory/inventory.css';

/** Server search starts 250 ms after the last keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

const SORT_OPTIONS: ReadonlyArray<{ value: ItemSort; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'recent', label: 'Zuletzt geändert' },
  { value: 'value', label: 'Wert' },
];

function parseCategory(value: string | null): ItemCategory | null {
  return value && (ITEM_CATEGORY_VALUES as readonly string[]).includes(value) ? (value as ItemCategory) : null;
}

/**
 * Inventar (design 02; empty 10, toast 14, context menu 16, search 17). Search term and category
 * live in the URL (`/inventar?search=Oliv&category=KUECHE`), the sort order per device.
 */
export function InventoryPage() {
  const openSheet = useOpenSheet();
  const [params, setParams] = useSearchParams();
  const urlSearch = params.get('search') ?? '';
  const category = parseCategory(params.get('category'));
  const [searchInput, setSearchInput] = useState(urlSearch);
  const debouncedSearch = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const [sort, setSort] = useSortPreference();
  const [sortAnchor, setSortAnchor] = useState<AnchorRect | null>(null);
  const highlightedId = useInventoryUiStore((state) => state.highlightedItemId);
  const scroller = useScrollContainer();
  const reducedMotion = useReducedMotion() ?? false;
  const actions = useItemActions();

  // Debounced search term → URL (replace, so typing does not create history entries).
  useEffect(() => {
    if (debouncedSearch === urlSearch.trim()) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (debouncedSearch) next.set('search', debouncedSearch);
        else next.delete('search');
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [debouncedSearch, setParams, urlSearch]);

  // A freshly added item is listed first ("Zuletzt geändert") – bring it into view (design 14).
  useEffect(() => {
    if (!highlightedId || sort !== 'recent') return;
    scroller?.current?.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [highlightedId, reducedMotion, scroller, sort]);

  const search = urlSearch.trim() || null;
  const list = useInventoryList({ search, category, sort });
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const filtered = search !== null || category !== null;
  const loaded = list.data !== undefined;
  const householdEmpty = loaded && !filtered && total === 0 && !list.isPlaceholderData;
  // While a new search/filter loads, the previous result stays visible (dimmed) – the subtitle
  // and the no-results text keep describing *that* result, not the term being fetched.
  const stale = list.isPlaceholderData;
  const current: ListSubtitleInput | null = loaded && !stale ? { total, search, category } : null;
  const [shownResult, setShownResult] = useState<ListSubtitleInput | null>(current);
  if (
    current &&
    (shownResult?.total !== current.total ||
      shownResult.search !== current.search ||
      shownResult.category !== current.category)
  ) {
    setShownResult(current);
  }
  const shown = current ?? shownResult;

  const setCategory = (next: ItemCategory | null): void => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next) updated.set('category', next);
        else updated.delete('category');
        return updated;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const openSortMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.closest('.homi-glass-toolbar')?.getBoundingClientRect();
    if (!rect) return;
    setSortAnchor({
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
  };

  const sortItems: ContextMenuItem[] = SORT_OPTIONS.map((option) => ({
    key: option.value,
    label: option.label,
    icon: option.value === sort ? 'check' : undefined,
    checked: option.value === sort,
    onSelect: () => setSort(option.value),
  }));

  const subtitle = shown ? listSubtitle(shown) : ' ';

  return (
    <Screen
      withTabBar
      aria-labelledby="inventory-title"
      header={
        <LargeTitleHeader
          title="Inventar"
          titleId="inventory-title"
          subtitle={<span aria-live="polite">{subtitle}</span>}
          trailing={
            <GlassToolbar label="Inventar-Aktionen">
              <GlassToolbarItem icon="plus" label="Artikel hinzufügen" onClick={() => openSheet(paths.inventoryNew)} />
              <GlassToolbarItem
                icon="ellipsis"
                label="Sortieren"
                aria-haspopup="menu"
                aria-expanded={sortAnchor !== null}
                onClick={openSortMenu}
              />
            </GlassToolbar>
          }
        />
      }
    >
      {householdEmpty ? (
        <EmptyState
          className="inventory-empty"
          icon="tray"
          title="Noch keine Artikel"
          message="Füge deinen ersten Artikel hinzu."
          action={
            <Button size="medium" onClick={() => openSheet(paths.inventoryNew)}>
              Artikel hinzufügen
            </Button>
          }
        />
      ) : (
        <>
          <HomiSearchField
            className="inventory-search"
            value={searchInput}
            onValueChange={setSearchInput}
            placeholder="Artikel suchen"
            label="Artikel suchen"
          />
          <ChipRow label="Kategorie" className="inventory-chips">
            <Chip selected={category === null} onClick={() => setCategory(null)}>
              Alle
            </Chip>
            {ITEM_CATEGORY_VALUES.map((value) => (
              <Chip key={value} selected={category === value} onClick={() => setCategory(value)}>
                {ITEM_CATEGORY_LABELS[value]}
              </Chip>
            ))}
          </ChipRow>

          <div className="inventory-results" data-stale={stale || undefined} aria-busy={stale || undefined}>
            {!loaded && list.isPending ? (
              <SkeletonList variant="inventory" rows={6} className="inventory-list" label="Inventar wird geladen …" />
            ) : list.isError && !loaded ? (
              <EmptyState
                className="inventory-feedback"
                icon="tray"
                title="Inventar nicht verfügbar"
                message="Die Artikel konnten nicht geladen werden."
                action={
                  <Button size="medium" variant="secondary" onClick={() => void list.refetch()}>
                    Erneut versuchen
                  </Button>
                }
              />
            ) : items.length === 0 ? (
              <EmptyState
                className="inventory-feedback"
                icon="search"
                title="Keine Treffer"
                message={
                  shown?.search
                    ? `Für «${shown.search}» wurde nichts gefunden.`
                    : `In ${shown?.category ? ITEM_CATEGORY_LABELS[shown.category] : 'dieser Kategorie'} gibt es noch keine Artikel.`
                }
              />
            ) : (
              <InventoryList
                items={items}
                actions={actions}
                highlightedId={highlightedId}
                hasNextPage={list.hasNextPage && !stale}
                isFetchingNextPage={list.isFetchingNextPage}
                onLoadMore={() => void list.fetchNextPage()}
              />
            )}
          </div>
        </>
      )}

      <ContextMenu
        open={sortAnchor !== null}
        anchorRect={sortAnchor}
        items={sortItems}
        label="Sortieren nach"
        onClose={() => setSortAnchor(null)}
      />
      {actions.dialog}
    </Screen>
  );
}
