import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { jsonResponse, renderApp, stubFetch, TEST_ME } from './testUtils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NotFoundPage', () => {
  it.each([
    ['signed out', null],
    ['signed in', TEST_ME],
  ] as const)('has exactly one h1 and leads back Home (%s)', async (_label, me) => {
    stubFetch(() => jsonResponse(404));
    renderApp('/gibt-es-nicht', me);
    expect(await screen.findByRole('heading', { level: 1, name: 'Seite nicht gefunden' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/');
  });
});
