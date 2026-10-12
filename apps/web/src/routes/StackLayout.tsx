import { AnimatePresence, useReducedMotion } from 'motion/react';
import { useLocation, useNavigationType, useOutlet } from 'react-router';
import { isTabPath } from './paths';
import { ScreenLayer } from './ScreenLayer';
import { pushVariants, routeDepth, type TransitionCustom } from './transitions';
import { useNavDirection } from './useNavDirection';

/**
 * Navigation stack for the signed-in app: the tab shell is the root layer, every pushed
 * screen (`/inventar/:id`, `/chats/:cid`, `/haushalt`, …) slides in over it and slides out
 * on back. Switching between tabs keeps the same layer (TabShell animates internally).
 */
export function StackLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  const navigationType = useNavigationType();
  const reducedMotion = useReducedMotion() ?? false;

  const tabRoot = isTabPath(location.pathname);
  const layerKey = tabRoot ? 'tabs' : location.pathname;
  const direction = useNavDirection(layerKey, routeDepth(location.pathname, tabRoot), navigationType);
  const custom: TransitionCustom = { direction, reducedMotion };

  return (
    <div className="app-stack">
      <AnimatePresence initial={false} custom={custom}>
        {tabRoot ? (
          <ScreenLayer key="tabs" className="app-stack__layer" variants={pushVariants} custom={custom} resetKey="tabs">
            {outlet}
          </ScreenLayer>
        ) : (
          <ScreenLayer
            key={location.pathname}
            className="app-stack__layer"
            variants={pushVariants}
            custom={custom}
            resetKey={location.pathname}
            scrollKey={`stack:${location.key}`}
          >
            {outlet}
          </ScreenLayer>
        )}
      </AnimatePresence>
    </div>
  );
}
