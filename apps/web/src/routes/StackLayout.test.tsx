import { act, render, screen, waitFor, within } from '@testing-library/react';
import {
  createMemoryRouter,
  createRoutesFromElements,
  NavigationType,
  Outlet,
  Route,
  RouterProvider,
  useLocation,
} from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { StackLayout } from './StackLayout';
import { TabShell } from './TabShell';
import { LayerLocationProvider } from './LayerLocationProvider';
import { useLayerLocation } from './useLayerLocation';

vi.mock('./lazyPages', () => ({ preloadTabPages: () => undefined }));

const Page = ({ name }: { name: string }) => <p data-testid={`page-${name}`}>{name}</p>;

function createRouter(initialPath: string) {
  return createMemoryRouter(
    createRoutesFromElements(
      <Route element={<StackLayout />}>
        <Route element={<TabShell />}>
          <Route path="/" element={<Page name="home" />} />
          <Route path="/inventar" element={<Page name="inventory" />} />
          <Route path="/einkauf" element={<Page name="shopping" />} />
          <Route path="/chats" element={<Page name="chats" />} />
        </Route>
        <Route path="/chats/:cid" element={<Page name="conversation" />} />
        <Route path="/haushalt" element={<Page name="household" />} />
      </Route>,
    ),
    { initialEntries: [initialPath] },
  );
}

const activeTabs = () =>
  screen
    .queryAllByRole('navigation', { name: 'Hauptnavigation', hidden: true })
    .flatMap((nav) => within(nav).queryAllByRole('link', { current: 'page', hidden: true }))
    .map((link) => link.textContent);

async function go(router: ReturnType<typeof createRouter>, to: string | number, options?: { replace?: boolean }) {
  await act(async () => {
    await (typeof to === 'number' ? router.navigate(to) : router.navigate(to, options));
  });
}

describe('navigation while a transition is running', () => {
  it('renders every tab page once while a push starts during the tab crossfade', async () => {
    const router = createRouter('/');
    render(<RouterProvider router={router} />);
    expect(screen.getAllByTestId('page-home')).toHaveLength(1);

    // Home → Chats (crossfade starts), then immediately push a conversation – no waiting in between.
    await go(router, '/chats', { replace: true });
    expect(screen.getAllByTestId('page-chats')).toHaveLength(1);
    await go(router, '/chats/abc');

    // The tab layer is leaving: its content exists once (not a second copy under the Home key) and still says "Chats".
    expect(screen.getAllByTestId('page-chats')).toHaveLength(1);
    // (the Home page may still be fading out of the tab crossfade – once at most)
    expect(screen.queryAllByTestId('page-home').length).toBeLessThanOrEqual(1);
    expect(activeTabs()).toEqual(['Chats']);
    expect(screen.getByTestId('page-conversation')).toBeInTheDocument();

    // After the transition exactly one layer is left: the conversation.
    await waitFor(() => expect(screen.queryAllByTestId('page-chats')).toHaveLength(0), { timeout: 3_000 });
    expect(screen.getAllByTestId('page-conversation')).toHaveLength(1);
    expect(screen.queryAllByRole('navigation', { name: 'Hauptnavigation', hidden: true })).toHaveLength(0);
  });

  it('keeps the leaving tab layer on its tab when a plain push leaves a settled tab', async () => {
    const router = createRouter('/chats');
    render(<RouterProvider router={router} />);
    await go(router, '/haushalt');
    expect(screen.getAllByTestId('page-chats')).toHaveLength(1);
    expect(activeTabs()).toEqual(['Chats']);
    await waitFor(() => expect(screen.queryAllByTestId('page-chats')).toHaveLength(0), { timeout: 3_000 });
    expect(screen.getAllByTestId('page-household')).toHaveLength(1);
  });

  it('comes back to a single tab layer when popping during the push', async () => {
    const router = createRouter('/chats');
    render(<RouterProvider router={router} />);
    await go(router, '/chats/abc');
    await go(router, -1);
    await waitFor(() => expect(screen.queryAllByTestId('page-conversation')).toHaveLength(0), { timeout: 3_000 });
    expect(screen.getAllByTestId('page-chats')).toHaveLength(1);
    expect(activeTabs()).toEqual(['Chats']);
  });

  it('settles on the last tab after three quick tab switches', async () => {
    const router = createRouter('/');
    render(<RouterProvider router={router} />);
    await go(router, '/chats', { replace: true });
    await go(router, '/einkauf', { replace: true });
    await go(router, '/inventar', { replace: true });
    expect(activeTabs()).toEqual(['Inventar']);
    await waitFor(() => expect(screen.queryAllByTestId(/^page-/)).toHaveLength(1), { timeout: 3_000 });
    expect(screen.getByTestId('page-inventory')).toBeInTheDocument();
  });
});

describe('useLayerLocation', () => {
  function Probe() {
    return <output data-testid="probe">{useLayerLocation().location.pathname}</output>;
  }
  function Current() {
    return <output data-testid="current">{useLocation().pathname}</output>;
  }

  it('falls back to the router location outside a layer and prefers the frozen one inside', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '*',
          Component: () => {
            const location = useLocation();
            return (
              <>
                <Current />
                <Probe />
                <LayerLocationProvider
                  location={{ ...location, pathname: '/frozen' }}
                  navigationType={NavigationType.Push}
                >
                  <Probe />
                  <Outlet />
                </LayerLocationProvider>
              </>
            );
          },
        },
      ],
      { initialEntries: ['/a'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getAllByTestId('probe').map((node) => node.textContent)).toEqual(['/a', '/frozen']);
    await go(router, '/b');
    expect(screen.getByTestId('current')).toHaveTextContent('/b');
    expect(screen.getAllByTestId('probe').map((node) => node.textContent)).toEqual(['/b', '/frozen']);
  });
});
