import { Suspense, useRef, type ReactNode } from 'react';
import { motion, useIsPresent, type Variants } from 'motion/react';
import { ScrollContainerContext, useScrollMemory } from '@/hooks/useScrollMemory';
import { ScreenErrorBoundary } from './RouteErrorBoundary';
import { RouteFallback } from './RouteFallback';
import type { TransitionCustom } from './transitions';

export interface ScreenLayerProps {
  className: string;
  variants: Variants;
  custom: TransitionCustom;
  /** Resets the error boundary when it changes. */
  resetKey: string;
  /**
   * When set, the layer is the screen's vertical scroll container and remembers its offset
   * under this key. Omit for layers that host their own scroll containers (tab shell).
   */
  scrollKey?: string;
  children: ReactNode;
}

/**
 * One animated screen layer inside an `<AnimatePresence>`. Exiting layers are `inert`
 * (no focus, no taps) while they animate out.
 */
export function ScreenLayer({ className, variants, custom, resetKey, scrollKey, children }: ScreenLayerProps) {
  const isPresent = useIsPresent();

  return (
    <motion.div
      className={className}
      custom={custom}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      inert={!isPresent}
      data-exiting={isPresent ? undefined : ''}
    >
      {scrollKey !== undefined ? (
        <ScrollableContent scrollKey={scrollKey} resetKey={resetKey}>
          {children}
        </ScrollableContent>
      ) : (
        <LayerContent resetKey={resetKey}>{children}</LayerContent>
      )}
    </motion.div>
  );
}

function LayerContent({ resetKey, children }: { resetKey: string; children: ReactNode }) {
  return (
    <ScreenErrorBoundary resetKey={resetKey}>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ScreenErrorBoundary>
  );
}

function ScrollableContent({
  scrollKey,
  resetKey,
  children,
}: {
  scrollKey: string;
  resetKey: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollMemory(ref, scrollKey);
  return (
    <div ref={ref} className="screen-scroll" data-screen-scroll>
      <ScrollContainerContext.Provider value={ref}>
        <LayerContent resetKey={resetKey}>{children}</LayerContent>
      </ScrollContainerContext.Provider>
    </div>
  );
}
