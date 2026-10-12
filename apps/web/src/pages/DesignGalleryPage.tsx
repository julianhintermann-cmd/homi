// Dev-only route `/__design` (lazy-loaded via `lazyPage(..., 'DesignGalleryPage')`: keep the named export).
// Renders every design-system component in every variant/state for review, plus a fixture mode
// (`/__design?fixture=<slug>`) that draws one component exactly like its reference PNG in
// design/reference/components – used by apps/web/scripts/visual-compare.ts.
import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import {
  Avatar,
  AvatarStack,
  BottomSheetOption,
  Button,
  Card,
  ChatBubble,
  ChatComposer,
  ChatReadReceipt,
  ChatTimestamp,
  Checkbox,
  Chip,
  ChipRow,
  ConfirmDialog,
  ContextMenu,
  ConversationRow,
  EmptyState,
  FormCard,
  FormRow,
  GlassButton,
  GlassToolbar,
  GlassToolbarItem,
  GroupedList,
  HomiBottomSheet,
  HomiSearchField,
  HomiTabBar,
  ImageUploadArea,
  InlineHeader,
  InventoryItemRow,
  LargeTitleHeader,
  ListRow,
  OfflineBanner,
  PriceField,
  ProductImage,
  ProfileButton,
  QuantityStepper,
  Screen,
  SectionHeader,
  SegmentedControl,
  SelectRow,
  SharedItemCard,
  SheetHeader,
  ShoppingItemRow,
  Skeleton,
  SkeletonList,
  Stat,
  SwipeableRow,
  TextField,
  Toast,
  ToastHost,
  UnreadDivider,
  showToast,
  type ContextMenuItem,
  type HomiTabBarItem,
} from '@/components';
import { Icon } from '@/icons/Icon';
import { ICON_PATHS, type IconName } from '@/icons/paths';
import batteriesImage from '../../../../design/assets/products/batt4.png';
import capsImage from '../../../../design/assets/products/caps.png';
import coffeeImage from '../../../../design/assets/products/coffee.png';
import milkImage from '../../../../design/assets/products/milk.png';
import oilImage from '../../../../design/assets/products/oil.png';

type Theme = 'light' | 'dark' | 'system';

const TAB_ITEMS: readonly HomiTabBarItem[] = [
  { key: 'home', label: 'Home', icon: 'house', to: '/__design' },
  { key: 'inventory', label: 'Inventar', icon: 'stack', to: '/__design' },
  { key: 'shopping', label: 'Einkauf', icon: 'cart', to: '/__design' },
  { key: 'chats', label: 'Chats', icon: 'bubbles', to: '/__design' },
];

const CATEGORY_OPTIONS = [
  { value: 'KUECHE', label: 'Küche' },
  { value: 'BAD', label: 'Bad' },
  { value: 'WOHNZIMMER', label: 'Wohnzimmer' },
  { value: 'TECHNIK', label: 'Technik' },
  { value: 'SONSTIGES', label: 'Sonstiges' },
] as const;

const UNIT_OPTIONS = [
  { value: 'STUECK', label: 'Stück' },
  { value: 'FLASCHE', label: 'Flaschen' },
  { value: 'PACKUNG', label: 'Packungen' },
  { value: 'KILOGRAMM', label: 'kg' },
] as const;

const PEOPLE = [
  { id: 'u-julian', name: 'Julian', self: true },
  { id: 'u-lisa', name: 'Lisa', tone: 'sand' as const },
  { id: 'u-max', name: 'Max', tone: 'mist' as const },
];

const noop = (): void => undefined;

function menuItems(onSelect: (label: string) => void): ContextMenuItem[] {
  return [
    { key: 'edit', label: 'Bearbeiten', icon: 'pencil', onSelect: () => onSelect('Bearbeiten') },
    { key: 'shop', label: 'Zur Einkaufsliste', icon: 'cart', onSelect: () => onSelect('Zur Einkaufsliste') },
    { key: 'share', label: 'Teilen', icon: 'arrowUp', onSelect: () => onSelect('Teilen') },
    { key: 'delete', label: 'Löschen', icon: 'trash', destructive: true, onSelect: () => onSelect('Löschen') },
  ];
}

/** Applies a forced theme to <html> while mounted and restores the previous state afterwards. */
function useForcedTheme(theme: Theme): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    return () => {
      if (previous === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', previous);
    };
  }, [theme]);
}

export function DesignGalleryPage() {
  const { search } = useLocation();
  const fixture = new URLSearchParams(search).get('fixture');
  if (fixture) return <FixtureView slug={fixture} />;
  return <Gallery />;
}

/* ────────────────────────────────────── Fixtures ────────────────────────────────────── */

interface FixtureSpec {
  /** Canvas size in CSS px (= reference PNG size / scale). */
  width: number;
  height: number;
  /** Offset of the component inside the canvas (shadow bounds of the reference). */
  x?: number;
  y?: number;
  theme?: 'light' | 'dark';
  safeTop?: number;
  safeBottom?: number;
  render: () => ReactNode;
}

const GLASS_OFFSET = { x: 132, y: 124 } as const;

function tabFixture(active: string, theme: 'light' | 'dark'): FixtureSpec {
  return {
    width: 625,
    height: 358,
    ...GLASS_OFFSET,
    theme,
    render: () => <HomiTabBar items={TAB_ITEMS} activeKey={active} inline />,
  };
}

function fixedWidth(width: number, node: ReactNode): ReactNode {
  return <div style={{ width }}>{node}</div>;
}

/** Rows whose reference shows the bottom separator need a following sibling. */
function withSeparator(node: ReactNode): ReactNode {
  return (
    <ul style={{ margin: 0, padding: 0, width: 353 }}>
      {node}
      <li hidden />
    </ul>
  );
}

const FIXTURES: Record<string, FixtureSpec> = {
  'avatar--du': { width: 44, height: 44, render: () => <Avatar name="Julian" tone="sage" size={44} /> },
  'avatar--lisa': { width: 44, height: 44, render: () => <Avatar name="Lisa" tone="sand" size={44} /> },
  'avatar--max': { width: 44, height: 44, render: () => <Avatar name="Max" tone="mist" size={44} /> },
  'avatar--haushalt': { width: 44, height: 44, render: () => <Avatar name="Unser Zuhause" household size={44} /> },
  'back-button--light': {
    width: 308,
    height: 340,
    ...GLASS_OFFSET,
    render: () => <GlassButton icon="chevL" label="Zurück" />,
  },
  'back-button--dark': {
    width: 308,
    height: 340,
    ...GLASS_OFFSET,
    theme: 'dark',
    render: () => <GlassButton icon="chevL" label="Zurück" />,
  },
  'bottom-sheet': {
    width: 673,
    height: 604,
    x: 140,
    y: 158,
    safeBottom: 34,
    render: () =>
      fixedWidth(
        393,
        <HomiBottomSheet inline variant="action" title="Foto hinzufügen" cancelLabel="Abbrechen" onClose={noop}>
          <div className="homi-sheet-options">
            <BottomSheetOption icon="camera" label="Foto aufnehmen" onClick={noop} />
            <BottomSheetOption icon="photo" label="Aus Mediathek wählen" onClick={noop} />
          </div>
        </HomiBottomSheet>,
      ),
  },
  'button--primary-default': {
    width: 353,
    height: 52,
    render: () => fixedWidth(353, <Button fullWidth>Artikel hinzufügen</Button>),
  },
  'button--primary-pressed': {
    width: 353,
    height: 52,
    render: () =>
      fixedWidth(
        353,
        <Button fullWidth forcePressed>
          Artikel hinzufügen
        </Button>,
      ),
  },
  'button--primary-disabled': {
    width: 353,
    height: 52,
    render: () =>
      fixedWidth(
        353,
        <Button fullWidth disabled>
          Artikel hinzufügen
        </Button>,
      ),
  },
  'button--primary-dark': {
    width: 353,
    height: 52,
    theme: 'dark',
    render: () => fixedWidth(353, <Button fullWidth>Artikel hinzufügen</Button>),
  },
  'button--secondary-default': {
    width: 353,
    height: 52,
    render: () =>
      fixedWidth(
        353,
        <Button fullWidth variant="secondary">
          Zur Einkaufsliste hinzufügen
        </Button>,
      ),
  },
  'button--destructive-default': {
    width: 353,
    height: 52,
    render: () =>
      fixedWidth(
        353,
        <Button fullWidth variant="destructive">
          Artikel löschen
        </Button>,
      ),
  },
  'category-chip--default': { width: 77, height: 36, render: () => <Chip>Küche</Chip> },
  'category-chip--selected': { width: 78, height: 36, render: () => <Chip selected>Küche</Chip> },
  'category-selector--default': {
    width: 353,
    height: 52,
    render: () =>
      fixedWidth(353, <SelectRow label="Kategorie" value="KUECHE" options={CATEGORY_OPTIONS} onValueChange={noop} />),
  },
  'category-selector--open': {
    width: 353,
    height: 52,
    render: () =>
      fixedWidth(
        353,
        <SelectRow label="Kategorie" value="KUECHE" options={CATEGORY_OPTIONS} onValueChange={noop} forceOpen />,
      ),
  },
  // Bubbles live in the 361 px message column (16 px gutters); outgoing ones end at its right edge.
  'chat-bubble--incoming': {
    width: 309,
    height: 42,
    render: () => fixedWidth(361, <ChatBubble direction="incoming">Hey, haben wir noch Kaffee zuhause?</ChatBubble>),
  },
  'chat-bubble--outgoing': {
    width: 322,
    height: 42,
    x: -39,
    render: () => fixedWidth(361, <ChatBubble direction="outgoing">Ja, wir haben noch zwei Packungen ☕</ChatBubble>),
  },
  'checkbox--default': { width: 26, height: 26, render: () => <Checkbox checked={false} label="Erledigt" /> },
  'checkbox--completed': { width: 26, height: 26, render: () => <Checkbox checked label="Erledigt" /> },
  'confirmation-dialog': {
    width: 820,
    height: 796,
    x: 260,
    y: 240,
    render: () => (
      <ConfirmDialog
        inline
        open
        title="Artikel löschen?"
        message="«Olivenöl» wird aus dem Inventar von Unser Zuhause entfernt."
        onConfirm={noop}
        onCancel={noop}
      />
    ),
  },
  'context-menu': {
    width: 514,
    height: 497,
    ...GLASS_OFFSET,
    render: () => <ContextMenu inline open onClose={noop} anchorRect={null} items={menuItems(noop)} />,
  },
  'dashboard-statistic': {
    width: 150,
    height: 52,
    render: () => fixedWidth(150, <Stat value="128" label="Artikel im Haushalt" />),
  },
  'floating-add-button--default': {
    width: 320,
    height: 352,
    ...GLASS_OFFSET,
    render: () => <GlassButton icon="plus" size="fab" label="Artikel hinzufügen" />,
  },
  'floating-add-button--pressed': {
    width: 320,
    height: 352,
    ...GLASS_OFFSET,
    render: () => <GlassButton icon="plus" size="fab" label="Artikel hinzufügen" forcePressed />,
  },
  'household-member-row': {
    width: 353,
    height: 60,
    render: () =>
      withSeparator(
        <ListRow
          variant="member"
          title="Lisa"
          subtitle="Mitglied"
          leading={<Avatar name="Lisa" tone="sand" size={36} />}
          onClick={noop}
        />,
      ),
  },
  'icon-button--compose-default': {
    width: 308,
    height: 340,
    ...GLASS_OFFSET,
    render: () => <GlassButton icon="compose" label="Neuer Chat" />,
  },
  'icon-button--compose-pressed': {
    width: 308,
    height: 340,
    ...GLASS_OFFSET,
    render: () => <GlassButton icon="compose" label="Neuer Chat" forcePressed />,
  },
  'icon-button--more-default': {
    width: 308,
    height: 340,
    ...GLASS_OFFSET,
    render: () => <GlassButton icon="ellipsis" label="Mehr" />,
  },
  'image-upload-area--empty': {
    width: 353,
    height: 200,
    render: () => fixedWidth(353, <ImageUploadArea onFileSelected={noop} />),
  },
  'image-upload-area--selected': {
    width: 353,
    height: 200,
    render: () => fixedWidth(353, <ImageUploadArea imageUrl={oilImage} onFileSelected={noop} />),
  },
  'inventory-row--default': {
    width: 353,
    height: 76,
    render: () =>
      fixedWidth(
        353,
        <InventoryItemRow
          wrapper="div"
          name="Nespresso Kapseln"
          subtitle="Küche · 24 Stück"
          price="CHF 12.96"
          unitPrice="CHF 0.54 / Stk."
          imageUrl={capsImage}
          onClick={noop}
        />,
      ),
  },
  'inventory-row--pressed': {
    width: 353,
    height: 76,
    render: () =>
      fixedWidth(
        353,
        <InventoryItemRow
          wrapper="div"
          name="Nespresso Kapseln"
          subtitle="Küche · 24 Stück"
          price="CHF 12.96"
          unitPrice="CHF 0.54 / Stk."
          imageUrl={capsImage}
          onClick={noop}
          forcePressed
        />,
      ),
  },
  'message-preview-row--read': {
    width: 353,
    height: 84,
    render: () =>
      withSeparator(
        <ConversationRow
          title="Lisa"
          avatar={<Avatar name="Lisa" tone="sand" size={54} />}
          time="13:48"
          preview="Kannst du noch Milch mitbringen?"
          onClick={noop}
        />,
      ),
  },
  'message-preview-row--unread': {
    width: 353,
    height: 84,
    render: () =>
      withSeparator(
        <ConversationRow
          title="Unser Zuhause"
          avatar={<Avatar name="Unser Zuhause" household size={54} />}
          time="14:32"
          preview="Lisa: Ich habe die Einkaufsliste aktualisiert."
          unreadCount={2}
          onClick={noop}
        />,
      ),
  },
  'navigation-header': {
    width: 393,
    height: 60,
    safeTop: 4,
    render: () => <InlineHeader title="Lisa" subtitle="Unser Zuhause" onBack={noop} />,
  },
  'price-input--empty': {
    width: 353,
    height: 76,
    render: () => fixedWidth(353, <PriceField value="" onValueChange={noop} />),
  },
  'price-input--filled': {
    width: 353,
    height: 76,
    render: () => fixedWidth(353, <PriceField value="8.50" onValueChange={noop} />),
  },
  'product-image--s-52': { width: 52, height: 52, render: () => <ProductImage src={oilImage} size="S" priority /> },
  'product-image--m-108': { width: 108, height: 108, render: () => <ProductImage src={oilImage} size="M" priority /> },
  'product-image--l-168': { width: 168, height: 168, render: () => <ProductImage src={oilImage} size="L" priority /> },
  'profile-button--light': { width: 308, height: 340, ...GLASS_OFFSET, render: () => <ProfileButton name="Julian" /> },
  'profile-button--dark': {
    width: 308,
    height: 340,
    ...GLASS_OFFSET,
    theme: 'dark',
    render: () => <ProfileButton name="Julian" />,
  },
  'quantity-stepper--compact-default': {
    width: 124,
    height: 40,
    render: () => <QuantityStepper value={2} min={1} onChange={noop} />,
  },
  'quantity-stepper--compact-minimum': {
    width: 124,
    height: 40,
    render: () => <QuantityStepper value={1} min={1} onChange={noop} />,
  },
  'quantity-stepper--large-default': {
    width: 196,
    height: 56,
    render: () => <QuantityStepper value={24} min={0} size="large" onChange={noop} />,
  },
  'search-field--default': {
    width: 353,
    height: 44,
    render: () => fixedWidth(353, <HomiSearchField value="" placeholder="Artikel suchen" onValueChange={noop} />),
  },
  'search-field--focused': {
    width: 353,
    height: 44,
    render: () =>
      fixedWidth(353, <HomiSearchField value="Oliv" placeholder="Artikel suchen" onValueChange={noop} forceFocused />),
  },
  'settings-row': {
    width: 353,
    height: 52,
    render: () =>
      withSeparator(
        <ListRow variant="settings" icon="appearance" title="Erscheinungsbild" value="Automatisch" onClick={noop} />,
      ),
  },
  'shopping-list-row--default': {
    width: 353,
    height: 56,
    render: () => (
      <div style={{ width: 353, height: 56, background: 'var(--color-surface)' }}>
        <ShoppingItemRow wrapper="div" name="Milch" quantity="2 Liter" completed={false} />
      </div>
    ),
  },
  'shopping-list-row--completed': {
    width: 353,
    height: 56,
    render: () => (
      <div style={{ width: 353, height: 56, background: 'var(--color-surface)' }}>
        <ShoppingItemRow wrapper="div" name="Milch" quantity="2 Liter" completed />
      </div>
    ),
  },
  'tab-bar-liquid-glass--home-light': tabFixture('home', 'light'),
  'tab-bar-liquid-glass--inventar-light': tabFixture('inventory', 'light'),
  'tab-bar-liquid-glass--einkauf-light': tabFixture('shopping', 'light'),
  'tab-bar-liquid-glass--chats-light': tabFixture('chats', 'light'),
  'tab-bar-liquid-glass--home-dark': tabFixture('home', 'dark'),
  'tab-bar-liquid-glass--inventar-dark': tabFixture('inventory', 'dark'),
  'tab-bar-liquid-glass--einkauf-dark': tabFixture('shopping', 'dark'),
  'tab-bar-liquid-glass--chats-dark': tabFixture('chats', 'dark'),
  'text-input--default': {
    width: 353,
    height: 76,
    render: () => fixedWidth(353, <TextField label="Artikelname" placeholder="z. B. Olivenöl" />),
  },
  'text-input--focused': {
    width: 353,
    height: 76,
    render: () => fixedWidth(353, <TextField label="Artikelname" defaultValue="Oliv" forceFocused />),
  },
  'text-input--filled': {
    width: 353,
    height: 76,
    render: () => fixedWidth(353, <TextField label="Artikelname" defaultValue="Olivenöl" />),
  },
  'text-input--error': {
    width: 353,
    height: 100,
    render: () =>
      fixedWidth(
        353,
        <TextField label="Artikelname" placeholder="z. B. Olivenöl" error="Bitte gib einen Namen ein." />,
      ),
  },
  toast: {
    width: 564,
    height: 340,
    ...GLASS_OFFSET,
    render: () => (
      <Toast tone="success" message="Olivenöl hinzugefügt" actionLabel="Rückgängig" onAction={noop} live={false} />
    ),
  },
  'toolbar-glass--1': {
    width: 316,
    height: 340,
    ...GLASS_OFFSET,
    render: () => (
      <GlassToolbar label="Aktionen">
        <GlassToolbarItem icon="ellipsis" label="Mehr" />
      </GlassToolbar>
    ),
  },
  'toolbar-glass--2': {
    width: 360,
    height: 340,
    ...GLASS_OFFSET,
    render: () => (
      <GlassToolbar label="Aktionen">
        <GlassToolbarItem icon="plus" label="Artikel hinzufügen" />
        <GlassToolbarItem icon="ellipsis" label="Mehr" />
      </GlassToolbar>
    ),
  },
};

function FixtureView({ slug }: { slug: string }) {
  const spec = FIXTURES[slug];
  useForcedTheme(spec?.theme ?? 'light');
  if (!spec) {
    return <p style={{ padding: 20 }}>Unbekannte Fixture: {slug}</p>;
  }
  const style = {
    '--safe-top': `${spec.safeTop ?? 0}px`,
    '--safe-bottom': `${spec.safeBottom ?? 0}px`,
    '--safe-left': '0px',
    '--safe-right': '0px',
    position: 'relative',
    width: spec.width,
    height: spec.height,
    overflow: 'hidden',
    background: 'var(--color-bg)',
    // Containing block for fixed-position descendants (nav bars).
    transform: 'translateZ(0)',
  } as CSSProperties;
  return (
    <div data-fixture={slug} style={style}>
      <style>{FIXTURE_CSS}</style>
      <div style={{ position: 'absolute', left: spec.x ?? 0, top: spec.y ?? 0 }}>{spec.render()}</div>
    </div>
  );
}

const FIXTURE_CSS = `
  html, body { background: var(--color-bg) !important; }
  #root { min-height: 0 !important; }
  .app-offline-banner, .app-update-toast { display: none !important; }
`;

/* ────────────────────────────────────── Gallery ────────────────────────────────────── */

function Gallery() {
  const [theme, setTheme] = useState<Theme>('system');
  const [reducedTransparency, setReducedTransparency] = useState(false);
  useForcedTheme(theme);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (reducedTransparency) root.setAttribute('data-transparency', 'reduced');
    else root.removeAttribute('data-transparency');
    return () => root.removeAttribute('data-transparency');
  }, [reducedTransparency]);

  return (
    <div className="ds-gallery">
      <style>{GALLERY_CSS}</style>
      <header className="ds-gallery__header">
        <div>
          <h1 className="type-large-title" style={{ margin: 0 }}>
            Design-Galerie
          </h1>
          <p className="type-subhead" style={{ margin: '4px 0 0', color: 'var(--color-label-secondary)' }}>
            Alle Homi-Komponenten in allen Varianten und Zuständen (design/FIDELITY.md).
          </p>
        </div>
        <div className="ds-gallery__controls">
          <SegmentedControl<Theme>
            label="Erscheinungsbild"
            value={theme}
            onValueChange={setTheme}
            options={[
              { value: 'system', label: 'Automatisch' },
              { value: 'light', label: 'Hell' },
              { value: 'dark', label: 'Dunkel' },
            ]}
          />
          <label className="ds-gallery__toggle type-footnote-medium">
            <Checkbox checked={reducedTransparency} onCheckedChange={setReducedTransparency} />
            Transparenz reduzieren
          </label>
        </div>
      </header>

      <IconsSection />
      <ButtonsSection />
      <GlassSection />
      <AvatarsSection />
      <TabBarSection />
      <HeadersSection />
      <ListsSection />
      <InventorySection />
      <ShoppingSection />
      <ChatSection />
      <FormsSection />
      <UploadSection />
      <OverlaysSection />
      <SwipeSection />
      <StatesSection />
      <ToastHost />
    </div>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="ds-gallery__section">
      <h2 className="type-title2" style={{ margin: 0 }}>
        {title}
      </h2>
      {note ? (
        <p className="type-footnote" style={{ margin: '4px 0 0', color: 'var(--color-label-secondary)' }}>
          {note}
        </p>
      ) : null}
      <div className="ds-gallery__items">{children}</div>
    </section>
  );
}

function Item({ label, children, width }: { label: string; children: ReactNode; width?: number }) {
  return (
    <figure className="ds-gallery__item" data-fill={width ? '' : undefined} style={width ? { width } : undefined}>
      <div className="ds-gallery__specimen">{children}</div>
      <figcaption className="type-caption">{label}</figcaption>
    </figure>
  );
}

/** 393 px wide iPhone frame with design safe areas; fixed chrome is positioned inside it. */
function DeviceFrame({ children, height = 220, label }: { children: ReactNode; height?: number; label: string }) {
  const style = {
    '--safe-top': '54px',
    '--safe-bottom': '34px',
    '--safe-left': '0px',
    '--safe-right': '0px',
    height,
  } as CSSProperties;
  return (
    <figure className="ds-gallery__item">
      <div className="ds-gallery__device" style={style}>
        {children}
      </div>
      <figcaption className="type-caption">{label}</figcaption>
    </figure>
  );
}

function IconsSection() {
  const names = Object.keys(ICON_PATHS) as IconName[];
  return (
    <Section
      title="Icons"
      note="24 × 24 viewBox, Linienstärke 1.7 (SF-Symbols-Stil); Strichstärke wird pro Grösse kompensiert."
    >
      <div className="ds-gallery__icons">
        {names.map((name) => (
          <div key={name} className="ds-gallery__icon">
            <Icon name={name} size={24} />
            <span className="type-caption2">{name}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ButtonsSection() {
  const [loading, setLoading] = useState(false);
  return (
    <Section
      title="Button"
      note="Primary / Secondary / Destructive / Plain; Pressed = Deckkraft 0.82; Disabled; Loading."
    >
      <Item label="Primary" width={353}>
        <Button fullWidth>Artikel hinzufügen</Button>
      </Item>
      <Item label="Primary · Pressed" width={353}>
        <Button fullWidth forcePressed>
          Artikel hinzufügen
        </Button>
      </Item>
      <Item label="Primary · Disabled" width={353}>
        <Button fullWidth disabled>
          Artikel hinzufügen
        </Button>
      </Item>
      <Item label="Primary · Loading (tippen)" width={353}>
        <Button
          fullWidth
          loading={loading}
          onClick={() => {
            setLoading(true);
            window.setTimeout(() => setLoading(false), 1500);
          }}
        >
          Änderungen sichern
        </Button>
      </Item>
      <Item label="Secondary" width={353}>
        <Button fullWidth variant="secondary">
          Zur Einkaufsliste hinzufügen
        </Button>
      </Item>
      <Item label="Destructive" width={353}>
        <Button fullWidth variant="destructive">
          Artikel löschen
        </Button>
      </Item>
      <Item label="Medium (Leerzustand)">
        <Button size="medium">Artikel hinzufügen</Button>
      </Item>
      <Item label="Medium · Secondary">
        <Button size="medium" variant="secondary">
          Neuer Chat
        </Button>
      </Item>
      <Item label="Plain mit Icon">
        <Button variant="plain" icon="cart">
          Zur Einkaufsliste hinzufügen
        </Button>
      </Item>
    </Section>
  );
}

function GlassSection() {
  return (
    <Section title="Liquid Glass" note="Nur für Navigation, Toolbars, schwebende Controls und Overlays.">
      <Item label="Back Button">
        <GlassButton icon="chevL" label="Zurück" />
      </Item>
      <Item label="Icon Button · Compose">
        <GlassButton icon="compose" label="Neuer Chat" />
      </Item>
      <Item label="Icon Button · Pressed">
        <GlassButton icon="compose" label="Neuer Chat" forcePressed />
      </Item>
      <Item label="Icon Button · More">
        <GlassButton icon="ellipsis" label="Mehr" />
      </Item>
      <Item label="Sheet Close / Delete">
        <div style={{ display: 'flex', gap: 12 }}>
          <GlassButton icon="xmark" size="sheet" label="Schliessen" />
          <GlassButton icon="trash" size="sheet" tone="destructive" label="Löschen" />
        </div>
      </Item>
      <Item label="Floating Add Button · Default / Pressed">
        <div style={{ display: 'flex', gap: 12 }}>
          <GlassButton icon="plus" size="fab" label="Artikel hinzufügen" />
          <GlassButton icon="plus" size="fab" label="Artikel hinzufügen" forcePressed />
        </div>
      </Item>
      <Item label="Toolbar (Glass) · 1 / 2">
        <div style={{ display: 'flex', gap: 12 }}>
          <GlassToolbar label="Aktionen">
            <GlassToolbarItem icon="ellipsis" label="Mehr" />
          </GlassToolbar>
          <GlassToolbar label="Aktionen">
            <GlassToolbarItem icon="plus" label="Artikel hinzufügen" />
            <GlassToolbarItem icon="ellipsis" label="Mehr" />
          </GlassToolbar>
        </div>
      </Item>
      <Item label="Profile Button">
        <ProfileButton name="Julian" />
      </Item>
      <Item label="Toast">
        <Toast tone="success" message="Olivenöl hinzugefügt" actionLabel="Rückgängig" onAction={noop} live={false} />
      </Item>
      <Item label="Toast · neutral mit Schliessen">
        <Toast message="Update verfügbar" actionLabel="Aktualisieren" onAction={noop} onDismiss={noop} live={false} />
      </Item>
      <Item label="Toast · Fehler">
        <Toast tone="error" message="Speichern fehlgeschlagen" live={false} />
      </Item>
      <Item label="Offline-Banner">
        <div style={{ display: 'grid', gap: 8 }}>
          <OfflineBanner reason="offline" />
          <OfflineBanner reason="server-unreachable" />
        </div>
      </Item>
    </Section>
  );
}

function AvatarsSection() {
  return (
    <Section title="Avatar" note="Tönung pro Person stabil per Hash; «Du» immer Salbei. Haushalt: Haus-Glyphe.">
      <Item label="Du / Lisa / Max / Haushalt (44)">
        <div style={{ display: 'flex', gap: 12 }}>
          <Avatar name="Julian" self />
          <Avatar name="Lisa" tone="sand" />
          <Avatar name="Max" tone="mist" />
          <Avatar name="Unser Zuhause" household />
        </div>
      </Item>
      <Item label="Grössen 24 · 36 · 48 · 54 · 72 · 80">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {[24, 36, 48, 54].map((size) => (
            <Avatar key={size} name="Lisa" tone="sand" size={size} />
          ))}
          <Avatar name="Unser Zuhause" household size={72} />
          <Avatar name="Max" tone="mist" size={80} />
        </div>
      </Item>
      <Item label="Avatar-Stapel + Haushalt">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AvatarStack people={PEOPLE} />
          <span className="type-footnote-medium" style={{ color: 'var(--color-label-secondary)' }}>
            Unser Zuhause
          </span>
          <Icon name="chevD" size={14} strokeWidth={3.77} style={{ color: 'var(--color-label-secondary)' }} />
        </div>
      </Item>
      <Item label="Stapel mit Überlauf">
        <AvatarStack people={[...PEOPLE, { id: 'u-anna', name: 'Anna' }, { id: 'u-tom', name: 'Tom' }]} max={3} />
      </Item>
    </Section>
  );
}

function TabBarSection() {
  return (
    <Section title="Tab Bar (Liquid Glass)" note="361 × 62, Linse 6 % / 10 %, ausgewählter Tab Akzent + 2.0 Strich.">
      {TAB_ITEMS.map((tab) => (
        <Item key={tab.key} label={`Aktiv: ${tab.label}`}>
          <HomiTabBar items={TAB_ITEMS} activeKey={tab.key} inline />
        </Item>
      ))}
      <Item label="Mit Badge">
        <HomiTabBar
          items={TAB_ITEMS.map((tab) => (tab.key === 'chats' ? { ...tab, badge: 2 } : tab))}
          activeKey="home"
          inline
        />
      </Item>
    </Section>
  );
}

function HeadersSection() {
  return (
    <Section title="Navigation" note="Grosse Titel, Inline-Header, Chat-Header; Toolbar schwebt über dem Inhalt.">
      <DeviceFrame label="LargeTitleHeader · Inventar" height={200}>
        <Screen
          header={
            <LargeTitleHeader
              title="Inventar"
              subtitle="128 Artikel in deinem Haushalt"
              trailing={
                <GlassToolbar label="Inventar-Aktionen">
                  <GlassToolbarItem icon="plus" label="Artikel hinzufügen" />
                  <GlassToolbarItem icon="ellipsis" label="Mehr" />
                </GlassToolbar>
              }
            />
          }
        >
          {null}
        </Screen>
      </DeviceFrame>
      <DeviceFrame label="LargeTitleHeader · Home" height={200}>
        <Screen
          header={
            <LargeTitleHeader
              eyebrow="Guten Morgen"
              title="Dein Zuhause."
              trailing={<ProfileButton name="Julian" />}
              accessory={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AvatarStack people={PEOPLE} />
                  <span className="type-footnote-medium" style={{ color: 'var(--color-label-secondary)' }}>
                    Unser Zuhause
                  </span>
                  <Icon name="chevD" size={14} strokeWidth={3.77} style={{ color: 'var(--color-label-secondary)' }} />
                </div>
              }
            />
          }
        >
          {null}
        </Screen>
      </DeviceFrame>
      <DeviceFrame label="InlineHeader · Haushalt" height={140}>
        <Screen header={<InlineHeader title="Haushalt" onBack={noop} />}>{null}</Screen>
      </DeviceFrame>
      <DeviceFrame label="InlineHeader · mit Untertitel" height={140}>
        <Screen
          header={
            <InlineHeader
              title="Einkaufsliste"
              subtitle="Unser Zuhause"
              onBack={noop}
              trailing={
                <GlassToolbar label="Aktionen">
                  <GlassToolbarItem icon="ellipsis" label="Mehr" />
                </GlassToolbar>
              }
            />
          }
        >
          {null}
        </Screen>
      </DeviceFrame>
      <DeviceFrame label="InlineHeader · Chat (Kontakt)" height={200}>
        <Screen
          gutter={false}
          header={
            <InlineHeader
              onBack={noop}
              contact={{ name: 'Lisa', avatar: <Avatar name="Lisa" tone="sand" size={48} />, onPress: noop }}
            />
          }
        >
          <div style={{ padding: '22px 16px 0' }}>
            <ChatTimestamp>Heute, 08:12</ChatTimestamp>
          </div>
        </Screen>
      </DeviceFrame>
    </Section>
  );
}

function ListsSection() {
  return (
    <Section title="Listen, Karten, Statistik">
      <Item label="GroupedList · Mitglieder" width={353}>
        <GroupedList label="Mitglieder">
          <ListRow
            variant="member"
            title="Du"
            subtitle="Verwaltung"
            leading={<Avatar name="Julian" self size={36} />}
            onClick={noop}
          />
          <ListRow
            variant="member"
            title="Lisa"
            subtitle="Mitglied"
            leading={<Avatar name="Lisa" tone="sand" size={36} />}
            onClick={noop}
          />
          <ListRow
            variant="member"
            title="Max"
            subtitle="Mitglied"
            leading={<Avatar name="Max" tone="mist" size={36} />}
            onClick={noop}
          />
          <ListRow variant="action" icon="personPlus" title="Mitglied einladen" onClick={noop} />
        </GroupedList>
      </Item>
      <Item label="GroupedList · Einstellungen" width={353}>
        <GroupedList label="Einstellungen" footer="Änderungen gelten für alle Geräte.">
          <ListRow variant="settings" icon="house" title="Haushalt verwalten" onClick={noop} />
          <ListRow variant="settings" icon="appearance" title="Erscheinungsbild" value="Automatisch" onClick={noop} />
          <ListRow variant="settings" icon="personCircle" title="Profil" onClick={noop} />
          <ListRow variant="settings" icon="sliders" title="Einstellungen" onClick={noop} />
          <ListRow title="Abmelden" tone="destructive" chevron={false} onClick={noop} />
        </GroupedList>
      </Item>
      <Item label="SectionHeader + Statistik-Karte" width={353}>
        <div style={{ display: 'grid', gap: 12 }}>
          <SectionHeader
            title="Dein Inventar"
            action={
              <button type="button" className="homi-text-button">
                Alle ansehen
              </button>
            }
          />
          <Card padded>
            <span className="type-footnote-medium" style={{ color: 'var(--color-label-secondary)' }}>
              Inventarwert
            </span>
            <div className="type-title1">CHF 2&apos;485.50</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
              <Stat value="128" label="Artikel im Haushalt" />
              <Stat value="8 Artikel" label="Auf der Einkaufsliste" />
            </div>
          </Card>
        </div>
      </Item>
      <Item label="Produktbilder S · M · L (Hero) · Platzhalter">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, paddingBottom: 30 }}>
          <ProductImage src={oilImage} size="S" />
          <ProductImage src={milkImage} size="M" />
          <ProductImage src={capsImage} size="L" elevated />
          <ProductImage src={null} size="M" />
        </div>
      </Item>
    </Section>
  );
}

function InventorySection() {
  const [category, setCategory] = useState('ALLE');
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Section
      title="Inventar"
      note="Langes Drücken (oder Rechtsklick / Shift+F10) auf eine Zeile öffnet das Kontextmenü."
    >
      <Item label="ChipRow (Filter)" width={393}>
        <div style={{ padding: '0 20px' }}>
          <ChipRow label="Kategorie">
            {[{ value: 'ALLE', label: 'Alle' }, ...CATEGORY_OPTIONS].map((option) => (
              <Chip key={option.value} selected={category === option.value} onClick={() => setCategory(option.value)}>
                {option.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
      </Item>
      <Item label="Inventory Row · Default / Pressed / Neu / ohne Bild / ohne Preis" width={353}>
        <ul className="homi-card" role="list">
          <InventoryItemRow
            name="Nespresso Kapseln"
            subtitle="Küche · 24 Stück"
            price="CHF 12.96"
            unitPrice="CHF 0.54 / Stk."
            imageUrl={capsImage}
            onClick={noop}
            menuItems={menuItems(setSelected)}
          />
          <InventoryItemRow
            name="Olivenöl"
            subtitle="Küche · 2 Flaschen"
            price="CHF 17.00"
            unitPrice="CHF 8.50 / Fl."
            imageUrl={oilImage}
            onClick={noop}
            forcePressed
          />
          <InventoryItemRow
            name="Batterien AA"
            subtitle="Technik · 8 Stück"
            price="CHF 6.00"
            unitPrice="CHF 0.75 / Stk."
            imageUrl={batteriesImage}
            onClick={noop}
            highlighted
          />
          <InventoryItemRow
            name="Eier"
            subtitle="Küche · 12 Stück"
            price="CHF 6.20"
            unitPrice="CHF 0.52 / Stk."
            onClick={noop}
          />
          <InventoryItemRow
            name="Ein sehr langer Artikelname, der abgeschnitten wird"
            subtitle="Sonstiges · 1 Stück"
            price={null}
            unitPrice={null}
            imageUrl={coffeeImage}
            onClick={noop}
          />
        </ul>
        {selected ? <p className="type-footnote">Gewählt: {selected}</p> : null}
      </Item>
      <Item label="Suchfeld · Default / mit Text" width={353}>
        <div style={{ display: 'grid', gap: 12 }}>
          <SearchDemo initial="" />
          <SearchDemo initial="Oliv" />
        </div>
      </Item>
      <Item label="Mengen-Stepper · Compact / Minimum / Large / Disabled">
        <StepperDemo />
      </Item>
    </Section>
  );
}

function SearchDemo({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <HomiSearchField value={value} onValueChange={setValue} placeholder="Artikel suchen" />;
}

function StepperDemo() {
  const [compact, setCompact] = useState(2);
  const [large, setLarge] = useState(24);
  return (
    <div style={{ display: 'grid', gap: 12, justifyItems: 'start' }}>
      <QuantityStepper value={compact} min={1} onChange={setCompact} />
      <QuantityStepper value={1} min={1} onChange={noop} />
      <QuantityStepper value={large} min={0} size="large" onChange={setLarge} />
      <QuantityStepper value={3} min={0} onChange={noop} disabled />
    </div>
  );
}

function ShoppingSection() {
  const [items, setItems] = useState([
    { id: '1', name: 'Milch', quantity: '2 Liter', completed: false },
    { id: '2', name: 'Eier', quantity: '12 Stück', completed: false },
    { id: '3', name: 'Joghurt', quantity: '4 Becher', completed: true },
  ]);
  return (
    <Section title="Einkaufsliste" note="Erledigt = Akzent-Häkchen, Text label-tertiary, kein Durchstreichen.">
      <Item label="Shopping List Row (tippen zum Abhaken)" width={353}>
        <ul className="homi-card" role="list">
          {items.map((item) => (
            <ShoppingItemRow
              key={item.id}
              name={item.name}
              quantity={item.quantity}
              completed={item.completed}
              onCompletedChange={(completed) =>
                setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, completed } : entry)))
              }
            />
          ))}
        </ul>
      </Item>
      <Item label="Checkbox · Default / Completed / Disabled">
        <div style={{ display: 'flex', gap: 20 }}>
          <Checkbox checked={false} label="Offen" />
          <Checkbox checked label="Erledigt" />
          <Checkbox checked={false} disabled label="Deaktiviert" />
        </div>
      </Item>
    </Section>
  );
}

function ChatSection() {
  const [messages, setMessages] = useState<string[]>([]);
  return (
    <Section title="Chat">
      <Item label="Konversationen · Ungelesen / Gelesen" width={353}>
        <ul style={{ margin: 0, padding: 0 }} role="list">
          <ConversationRow
            title="Unser Zuhause"
            avatar={<Avatar name="Unser Zuhause" household size={54} />}
            time="14:32"
            preview="Lisa: Ich habe die Einkaufsliste aktualisiert."
            unreadCount={2}
            onClick={noop}
          />
          <ConversationRow
            title="Lisa"
            avatar={<Avatar name="Lisa" tone="sand" size={54} />}
            time="13:48"
            preview="Kannst du noch Milch mitbringen?"
            onClick={noop}
          />
          <ConversationRow
            title="Max"
            avatar={<Avatar name="Max" tone="mist" size={54} />}
            time="Gestern"
            preview="Perfekt, danke!"
            onClick={noop}
          />
        </ul>
      </Item>
      <Item label="Verlauf" width={393}>
        <div style={{ display: 'grid', gap: 11, padding: '0 16px' }}>
          <ChatTimestamp>Heute, 08:12</ChatTimestamp>
          <ChatBubble direction="incoming">Hey, haben wir noch Kaffee zuhause?</ChatBubble>
          <ChatBubble direction="outgoing">Ja, wir haben noch zwei Packungen ☕</ChatBubble>
          <ChatBubble direction="incoming">Perfekt! Dann brauchen wir nur noch Milch.</ChatBubble>
          <ChatBubble direction="outgoing">Ich setze sie auf die Einkaufsliste.</ChatBubble>
          <div>
            <SharedItemCard title="Milch · 2 Liter" status="Zur Einkaufsliste hinzugefügt" />
            <ChatReadReceipt />
          </div>
          <UnreadDivider count={1} />
          <ChatBubble direction="incoming" meta="Lisa · 13:48">
            Kannst du noch Milch mitbringen?
          </ChatBubble>
          <ChatBubble direction="outgoing" status="sending">
            Wird gesendet …
          </ChatBubble>
          <ChatBubble direction="outgoing" status="failed" onRetry={noop}>
            Bringe ich mit!
          </ChatBubble>
          {messages.map((message, index) => (
            <ChatBubble key={`${index}-${message}`} direction="outgoing">
              {message}
            </ChatBubble>
          ))}
        </div>
      </Item>
      <Item label="Composer (tippen → Senden-Taste)" width={393}>
        <ChatComposer inline onAttach={noop} onSend={(text) => setMessages((current) => [...current, text])} />
      </Item>
    </Section>
  );
}

function FormsSection() {
  const [name, setName] = useState('Olivenöl');
  const [price, setPrice] = useState('8.50');
  const [emptyPrice, setEmptyPrice] = useState('');
  const [category, setCategory] = useState<string>('');
  const [unit, setUnit] = useState<string>('FLASCHE');
  const [quantity, setQuantity] = useState(2);
  return (
    <Section title="Formulare">
      <Item label="Text Input · Default" width={353}>
        <TextField label="Artikelname" placeholder="z. B. Olivenöl" />
      </Item>
      <Item label="Text Input · Focused (erzwungen)" width={353}>
        <TextField label="Artikelname" defaultValue="Oliv" forceFocused />
      </Item>
      <Item label="Text Input · Filled" width={353}>
        <TextField label="Artikelname" value={name} onChange={(event) => setName(event.target.value)} />
      </Item>
      <Item label="Text Input · Error" width={353}>
        <TextField label="Artikelname" placeholder="z. B. Olivenöl" error="Bitte gib einen Namen ein." />
      </Item>
      <Item label="Price Input · Empty / Filled" width={353}>
        <div style={{ display: 'grid', gap: 16 }}>
          <PriceField value={emptyPrice} onValueChange={setEmptyPrice} />
          <PriceField value={price} onValueChange={setPrice} />
        </div>
      </Item>
      <Item label="Category Selector · Default / Open" width={353}>
        <div style={{ display: 'grid', gap: 12 }}>
          <SelectRow label="Kategorie" value="KUECHE" options={CATEGORY_OPTIONS} onValueChange={noop} />
          <SelectRow label="Kategorie" value="KUECHE" options={CATEGORY_OPTIONS} onValueChange={noop} forceOpen />
        </div>
      </Item>
      <Item label="Details-Karte (Kategorie, Menge, Einheit)" width={353}>
        <FormCard aria-label="Details">
          <SelectRow
            variant="inset"
            label="Kategorie"
            value={category}
            options={CATEGORY_OPTIONS}
            onValueChange={(value) => setCategory(value)}
          />
          <FormRow label="Menge">
            <QuantityStepper value={quantity} min={1} onChange={setQuantity} />
          </FormRow>
          <SelectRow
            variant="inset"
            label="Einheit"
            value={unit}
            options={UNIT_OPTIONS}
            onValueChange={(value) => setUnit(value)}
          />
        </FormCard>
      </Item>
      <Item label="Segmented Control" width={353}>
        <SegmentedDemo />
      </Item>
    </Section>
  );
}

function SegmentedDemo() {
  const [value, setValue] = useState<'system' | 'light' | 'dark'>('system');
  return (
    <SegmentedControl
      label="Erscheinungsbild"
      value={value}
      onValueChange={setValue}
      options={[
        { value: 'system', label: 'Automatisch' },
        { value: 'light', label: 'Hell' },
        { value: 'dark', label: 'Dunkel' },
      ]}
    />
  );
}

function UploadSection() {
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <Section title="Image Upload Area">
      <Item label="Empty (tippen → Quelle wählen)" width={353}>
        <ImageUploadArea imageUrl={preview} onFileSelected={(file) => setPreview(URL.createObjectURL(file))} />
      </Item>
      <Item label="Selected" width={353}>
        <ImageUploadArea imageUrl={oilImage} onFileSelected={noop} />
      </Item>
      <Item label="Uploading (42 %)" width={353}>
        <ImageUploadArea imageUrl={oilImage} state="uploading" progress={0.42} onFileSelected={noop} />
      </Item>
      <Item label="Error" width={353}>
        <ImageUploadArea state="error" onFileSelected={noop} onRetry={noop} />
      </Item>
    </Section>
  );
}

function OverlaysSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [pageSheetOpen, setPageSheetOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  return (
    <Section
      title="Overlays"
      note="Statische Darstellung + echte Overlays zum Ausprobieren (Escape, Fokusfalle, Ziehen zum Schliessen)."
    >
      <Item label="Confirmation Dialog">
        <ConfirmDialog
          inline
          open
          title="Artikel löschen?"
          message="«Olivenöl» wird aus dem Inventar von Unser Zuhause entfernt."
          onConfirm={noop}
          onCancel={noop}
        />
      </Item>
      <Item label="Context Menu">
        <ContextMenu inline open onClose={noop} anchorRect={null} items={menuItems(noop)} />
      </Item>
      <Item label="Bottom Sheet (Aktion)" width={393}>
        <HomiBottomSheet inline variant="action" title="Foto hinzufügen" cancelLabel="Abbrechen" onClose={noop}>
          <div className="homi-sheet-options">
            <BottomSheetOption icon="camera" label="Foto aufnehmen" onClick={noop} />
            <BottomSheetOption icon="photo" label="Aus Mediathek wählen" onClick={noop} />
          </div>
        </HomiBottomSheet>
      </Item>
      <Item label="Interaktiv">
        <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
          <Button variant="destructive" onClick={() => setDialogOpen(true)}>
            Dialog öffnen
          </Button>
          <Button variant="secondary" onClick={(event) => setMenuAnchor(event.currentTarget.getBoundingClientRect())}>
            Kontextmenü öffnen
          </Button>
          <Button variant="secondary" onClick={() => setActionSheetOpen(true)}>
            Bottom Sheet öffnen
          </Button>
          <Button variant="secondary" onClick={() => setPageSheetOpen(true)}>
            Seiten-Sheet öffnen
          </Button>
          <Button
            variant="secondary"
            onClick={() => showToast({ message: 'Olivenöl hinzugefügt', actionLabel: 'Rückgängig', onAction: noop })}
          >
            Toast anzeigen
          </Button>
        </div>
      </Item>
      <ConfirmDialog
        open={dialogOpen}
        title="Artikel löschen?"
        message="«Olivenöl» wird aus dem Inventar von Unser Zuhause entfernt."
        onConfirm={() => setDialogOpen(false)}
        onCancel={() => setDialogOpen(false)}
      />
      <ContextMenu
        open={menuAnchor !== null}
        anchorRect={menuAnchor}
        items={menuItems(noop)}
        onClose={() => setMenuAnchor(null)}
      />
      <HomiBottomSheet
        open={actionSheetOpen}
        variant="action"
        title="Foto hinzufügen"
        cancelLabel="Abbrechen"
        onClose={() => setActionSheetOpen(false)}
      >
        <div className="homi-sheet-options">
          <BottomSheetOption icon="camera" label="Foto aufnehmen" onClick={() => setActionSheetOpen(false)} />
          <BottomSheetOption icon="photo" label="Aus Mediathek wählen" onClick={() => setActionSheetOpen(false)} />
        </div>
      </HomiBottomSheet>
      <PageSheetDemo open={pageSheetOpen} onClose={() => setPageSheetOpen(false)} />
    </Section>
  );
}

function PageSheetDemo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const dirty = name !== '' || price !== '' || quantity !== 1;
  return (
    <HomiBottomSheet
      open={open}
      dirty={dirty}
      aria-label="Neuer Artikel"
      onClose={() => {
        setName('');
        setPrice('');
        setQuantity(1);
        onClose();
      }}
    >
      <SheetHeader title="Neuer Artikel" />
      <div style={{ display: 'grid', gap: 20 }}>
        <ImageUploadArea onFileSelected={noop} />
        <TextField
          label="Artikelname"
          placeholder="z. B. Olivenöl"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <FormCard aria-label="Details">
          <SelectRow variant="inset" label="Kategorie" value="" options={CATEGORY_OPTIONS} onValueChange={noop} />
          <FormRow label="Menge">
            <QuantityStepper value={quantity} min={1} onChange={setQuantity} />
          </FormRow>
          <SelectRow
            variant="inset"
            label="Einheit"
            value=""
            placeholder="Stück"
            options={UNIT_OPTIONS}
            onValueChange={noop}
          />
        </FormCard>
        <PriceField value={price} onValueChange={setPrice} />
        <Button fullWidth disabled={!name}>
          Artikel hinzufügen
        </Button>
      </div>
    </HomiBottomSheet>
  );
}

function SwipeSection() {
  const [rows, setRows] = useState(['Milch', 'Butter', 'Spülmittel']);
  return (
    <Section
      title="Swipeable Row"
      note="Nach links wischen: Aktionen; ganz durchwischen löst die erste Aktion aus. Langes Drücken = gleiche Aktionen."
    >
      <Item label="Einkaufszeilen mit «Löschen»" width={353}>
        <ul className="homi-card" role="list">
          {rows.map((row) => (
            <SwipeableRow
              key={row}
              menuLabel={row}
              actions={[
                {
                  key: 'delete',
                  label: 'Löschen',
                  icon: 'trash',
                  tone: 'destructive',
                  onAction: () => setRows((current) => current.filter((entry) => entry !== row)),
                },
              ]}
            >
              <ShoppingItemRow wrapper="div" name={row} quantity="1 Stück" completed={false} />
            </SwipeableRow>
          ))}
        </ul>
        <Button variant="plain" onClick={() => setRows(['Milch', 'Butter', 'Spülmittel'])}>
          Zurücksetzen
        </Button>
      </Item>
      <Item label="Zwei Aktionen" width={353}>
        <ul className="homi-card" role="list">
          <SwipeableRow
            menuLabel="Olivenöl"
            fullSwipe={false}
            actions={[
              { key: 'delete', label: 'Löschen', icon: 'trash', tone: 'destructive', onAction: noop },
              { key: 'cart', label: 'Einkauf', icon: 'cart', tone: 'accent', onAction: noop },
            ]}
          >
            <InventoryItemRow
              wrapper="div"
              name="Olivenöl"
              subtitle="Küche · 2 Flaschen"
              price="CHF 17.00"
              unitPrice="CHF 8.50 / Fl."
              imageUrl={oilImage}
              onClick={noop}
            />
          </SwipeableRow>
        </ul>
      </Item>
    </Section>
  );
}

function StatesSection() {
  return (
    <Section title="Leer- und Ladezustände">
      <Item label="Inventar leer" width={353}>
        <EmptyState
          icon="tray"
          title="Noch keine Artikel"
          message="Füge deinen ersten Artikel hinzu."
          action={<Button size="medium">Artikel hinzufügen</Button>}
        />
      </Item>
      <Item label="Einkaufsliste leer" width={353}>
        <EmptyState icon="checkCircle" title="Alles erledigt!" message="Deine Einkaufsliste ist leer." />
      </Item>
      <Item label="Chats leer" width={353}>
        <EmptyState
          icon="bubbles"
          title="Noch keine Chats"
          message="Starte eine Unterhaltung mit deinem Haushalt."
          action={
            <Button size="medium" variant="secondary">
              Neuer Chat
            </Button>
          }
        />
      </Item>
      <Item label="Skeleton · Inventar" width={353}>
        <SkeletonList variant="inventory" rows={3} />
      </Item>
      <Item label="Skeleton · Einkauf / Einstellungen" width={353}>
        <div style={{ display: 'grid', gap: 16 }}>
          <SkeletonList variant="shopping" rows={3} />
          <SkeletonList variant="settings" rows={2} />
        </div>
      </Item>
      <Item label="Skeleton · Chats + Block" width={353}>
        <div style={{ display: 'grid', gap: 16 }}>
          <SkeletonList variant="conversation" rows={2} />
          <Skeleton height={158} radius="var(--radius-card)" />
        </div>
      </Item>
    </Section>
  );
}

const GALLERY_CSS = `
  .ds-gallery {
    min-height: 100dvh;
    padding: calc(var(--safe-top) + 24px) 24px calc(var(--safe-bottom) + 48px);
    background: var(--color-bg);
    color: var(--color-label);
  }
  .ds-gallery__header {
    display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; justify-content: space-between;
    margin-bottom: 24px;
  }
  .ds-gallery__controls { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; min-width: 300px; }
  .ds-gallery__controls .homi-segmented { min-width: 280px; }
  .ds-gallery__toggle { display: inline-flex; gap: 10px; align-items: center; color: var(--color-label-secondary); }
  .ds-gallery__section { padding: 24px 0; border-top: 0.5px solid var(--color-separator); }
  .ds-gallery__items { display: flex; flex-wrap: wrap; gap: 28px; margin-top: 16px; align-items: flex-start; }
  .ds-gallery__item { margin: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; max-width: 100%; }
  .ds-gallery__item figcaption { color: var(--color-label-secondary); }
  .ds-gallery__specimen { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; max-width: 100%; }
  .ds-gallery__item[data-fill] .ds-gallery__specimen { align-items: stretch; }
  .ds-gallery__specimen > * { max-width: 100%; }
  .ds-gallery__device {
    position: relative; width: 393px; max-width: 100%; overflow: hidden; display: flex; flex-direction: column;
    border-radius: 28px; outline: 0.5px solid var(--color-separator); background: var(--color-bg);
    transform: translateZ(0);
  }
  .ds-gallery__icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 12px; width: 100%; }
  .ds-gallery__icon {
    display: grid; justify-items: center; gap: 6px; padding: 12px 4px; border-radius: 14px;
    background: var(--color-surface); color: var(--color-label);
  }
  .ds-gallery__icon span { color: var(--color-label-secondary); }
  @media (max-width: 600px) { .ds-gallery { padding-left: 16px; padding-right: 16px; } }
`;
