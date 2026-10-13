import { useMemo, type ReactNode } from 'react';
import type { Location, NavigationType } from 'react-router';
import { LayerLocationContext, type LayerLocationValue } from './useLayerLocation';

export interface LayerLocationProviderProps {
  location: Location;
  navigationType: NavigationType;
  children: ReactNode;
}

/** Freezes the location for everything inside a layer element (see useLayerLocation.ts). */
export function LayerLocationProvider({ location, navigationType, children }: LayerLocationProviderProps) {
  const value = useMemo<LayerLocationValue>(() => ({ location, navigationType }), [location, navigationType]);
  return <LayerLocationContext.Provider value={value}>{children}</LayerLocationContext.Provider>;
}
