import { createContext, useContext } from 'react';

export interface SheetContextValue {
  /** Closes the sheet – asks for confirmation first when the sheet is `dirty`. */
  requestClose: () => void;
  /** id of the sheet title element (for `aria-labelledby`). */
  titleId: string;
}

export const SheetContext = createContext<SheetContextValue | null>(null);

/** Access the surrounding `HomiBottomSheet` (e.g. a custom close button inside the content). */
export function useSheet(): SheetContextValue | null {
  return useContext(SheetContext);
}
