import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface PortalProps {
  children: ReactNode;
  /** Defaults to `document.body`. */
  container?: Element | null;
}

/**
 * Renders overlays (dialogs, menus, action sheets, toasts) at the document root so they escape
 * transformed screen layers, `overflow: clip` and `inert` ancestors.
 */
export function Portal({ children, container }: PortalProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, container ?? document.body);
}
