import { Suspense, useMemo, useState } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { createBrowserRouter, Route, RouterProvider, Routes, useLocation } from 'react-router';
import { AppRuntime } from '@/app/AppRuntime';
import { ToastHost } from '@/components/Toast';
import { PwaUpdatePrompt } from '@/pwa/PwaUpdatePrompt';
import { PublicOnly, RequireAuth, RequireHousehold } from '@/routes/guards';
import {
  ChatsPage,
  ConversationPage,
  DesignGalleryPage,
  ForgotPasswordPage,
  HomePage,
  HouseholdPage,
  InventoryItemPage,
  InventoryPage,
  InvitationPage,
  LoginPage,
  MemberPage,
  NotFoundPage,
  ProfilePage,
  RegisterPage,
  ResetPasswordPage,
  SettingsPage,
  ShoppingPage,
  WelcomePage,
} from '@/routes/lazyPages';
import {
  createFallbackLocation,
  getBackgroundLocation,
  matchSheetRoute,
  RealLocationContext,
  sheetFallbackPath,
} from '@/routes/navigation';
import { paths } from '@/routes/paths';
import { RootRouteError } from '@/routes/RouteErrorBoundary';
import { RouteFallback } from '@/routes/RouteFallback';
import { SheetLayer } from '@/routes/SheetLayer';
import { StackLayout } from '@/routes/StackLayout';
import { TabShell } from '@/routes/TabShell';

/**
 * Route tree (ARCHITECTURE §7).
 *
 * Sheet routes (`/inventar/neu`, `/inventar/:id/bearbeiten`) use the background-location
 * pattern: the main tree renders `state.backgroundLocation` (or, for deep links, the list /
 * item detail) and the sheet is rendered on top by `SheetLayer`.
 */
export function AppRoutes() {
  const location = useLocation();
  const sheet = matchSheetRoute(location.pathname);
  const background = sheet ? getBackgroundLocation(location.state) : null;
  const fallbackPath = sheet && !background ? sheetFallbackPath(sheet) : null;
  const fallbackLocation = useMemo(() => (fallbackPath ? createFallbackLocation(fallbackPath) : null), [fallbackPath]);
  const mainLocation = background ?? fallbackLocation ?? location;

  return (
    <RealLocationContext.Provider value={location}>
      <div className="app-main" inert={sheet !== null}>
        <Suspense fallback={<RouteFallback />}>
          <Routes location={mainLocation}>
            <Route element={<PublicOnly />}>
              <Route path={paths.login} element={<LoginPage />} />
              <Route path={paths.register} element={<RegisterPage />} />
              <Route path={paths.forgotPassword} element={<ForgotPasswordPage />} />
            </Route>
            <Route path="/passwort-zuruecksetzen/:token" element={<ResetPasswordPage />} />
            <Route path="/einladung/:token" element={<InvitationPage />} />

            <Route element={<RequireAuth />}>
              <Route path={paths.welcome} element={<WelcomePage />} />
              <Route element={<RequireHousehold />}>
                <Route element={<StackLayout />}>
                  <Route element={<TabShell />}>
                    <Route path={paths.home} element={<HomePage />} />
                    <Route path={paths.inventory} element={<InventoryPage />} />
                    <Route path={paths.shopping} element={<ShoppingPage />} />
                    <Route path={paths.chats} element={<ChatsPage />} />
                  </Route>
                  <Route path="/inventar/:id" element={<InventoryItemPage />} />
                  <Route path="/chats/:cid" element={<ConversationPage />} />
                  <Route path={paths.household} element={<HouseholdPage />} />
                  <Route path="/haushalt/mitglieder/:userId" element={<MemberPage />} />
                  <Route path={paths.profile} element={<ProfilePage />} />
                  <Route path={paths.settings} element={<SettingsPage />} />
                </Route>
              </Route>
            </Route>

            {DesignGalleryPage ? <Route path={paths.designGallery} element={<DesignGalleryPage />} /> : null}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </div>
      <AnimatePresence>{sheet ? <SheetLayer key="sheet" location={location} /> : null}</AnimatePresence>
    </RealLocationContext.Provider>
  );
}

function RootLayout() {
  return (
    <>
      <AppRuntime />
      <AppRoutes />
      {/* Outside `.app-main`, so toasts stay visible (and not inert) while a sheet is open. */}
      <ToastHost />
      <PwaUpdatePrompt />
    </>
  );
}

export interface AppProps {
  queryClient: QueryClient;
}

/** Providers + data router. Every URL is handled by `AppRoutes` (descendant `<Routes>`). */
export function App({ queryClient }: AppProps) {
  const [router] = useState(() =>
    createBrowserRouter([{ path: '*', Component: RootLayout, ErrorBoundary: RootRouteError }]),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
      </MotionConfig>
    </QueryClientProvider>
  );
}
