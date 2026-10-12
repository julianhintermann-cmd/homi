import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// React.lazy itself is typed with ComponentType<any>; props stay fully typed via M[K].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

export type PreloadableComponent<C extends AnyComponent> = LazyExoticComponent<C> & {
  /** Starts loading the chunk (e.g. tab pages after login, on hover/touch of links). */
  preload: () => Promise<unknown>;
};

/**
 * Code-split route component. Pages are **named exports** matching their file name
 * (`export function HomePage()`), so the import stays type-checked.
 */
export function lazyPage<M extends Record<K, AnyComponent>, K extends string>(
  load: () => Promise<M>,
  exportName: K,
): PreloadableComponent<M[K]> {
  let pending: Promise<M> | null = null;
  const loadOnce = (): Promise<M> => {
    pending ??= load().catch((error: unknown) => {
      pending = null; // allow a retry (e.g. chunk failed while offline)
      throw error;
    });
    return pending;
  };
  const component = lazy(async () => ({ default: (await loadOnce())[exportName] }));
  return Object.assign(component, { preload: loadOnce });
}

// Tab screens
export const HomePage = lazyPage(() => import('@/pages/HomePage'), 'HomePage');
export const InventoryPage = lazyPage(() => import('@/pages/InventoryPage'), 'InventoryPage');
export const ShoppingPage = lazyPage(() => import('@/pages/ShoppingPage'), 'ShoppingPage');
export const ChatsPage = lazyPage(() => import('@/pages/ChatsPage'), 'ChatsPage');

// Pushed screens
export const InventoryItemPage = lazyPage(() => import('@/pages/InventoryItemPage'), 'InventoryItemPage');
export const ConversationPage = lazyPage(() => import('@/pages/ConversationPage'), 'ConversationPage');
export const HouseholdPage = lazyPage(() => import('@/pages/HouseholdPage'), 'HouseholdPage');
export const MemberPage = lazyPage(() => import('@/pages/MemberPage'), 'MemberPage');
export const ProfilePage = lazyPage(() => import('@/pages/ProfilePage'), 'ProfilePage');
export const SettingsPage = lazyPage(() => import('@/pages/SettingsPage'), 'SettingsPage');

// Sheets
export const InventoryEditSheetPage = lazyPage(
  () => import('@/pages/InventoryEditSheetPage'),
  'InventoryEditSheetPage',
);

// Public / onboarding
export const LoginPage = lazyPage(() => import('@/pages/LoginPage'), 'LoginPage');
export const RegisterPage = lazyPage(() => import('@/pages/RegisterPage'), 'RegisterPage');
export const ForgotPasswordPage = lazyPage(() => import('@/pages/ForgotPasswordPage'), 'ForgotPasswordPage');
export const ResetPasswordPage = lazyPage(() => import('@/pages/ResetPasswordPage'), 'ResetPasswordPage');
export const InvitationPage = lazyPage(() => import('@/pages/InvitationPage'), 'InvitationPage');
export const WelcomePage = lazyPage(() => import('@/pages/WelcomePage'), 'WelcomePage');
export const NotFoundPage = lazyPage(() => import('@/pages/NotFoundPage'), 'NotFoundPage');

/** Dev-only design gallery (`/__design`); the import is dropped from production builds. */
export const DesignGalleryPage = import.meta.env.DEV
  ? lazyPage(() => import('@/pages/DesignGalleryPage'), 'DesignGalleryPage')
  : null;

/** Warm the tab chunks so swiping between tabs never shows a fallback. */
export function preloadTabPages(): void {
  for (const page of [HomePage, InventoryPage, ShoppingPage, ChatsPage]) void page.preload().catch(() => undefined);
}
