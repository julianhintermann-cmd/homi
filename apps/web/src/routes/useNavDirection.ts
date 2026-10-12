import { useState } from 'react';
import { NavigationType } from 'react-router';
import type { NavDirection } from './transitions';

/** Direction between two ordered positions; equal order falls back to the history action. */
export function directionBetween(
  previousOrder: number,
  nextOrder: number,
  navigationType: NavigationType,
): NavDirection {
  if (nextOrder > previousOrder) return 1;
  if (nextOrder < previousOrder) return -1;
  return navigationType === NavigationType.Pop ? -1 : 1;
}

/**
 * Animation direction for keyed transitions: `order` is the depth (push stack) or the tab
 * index. Derived during render from the previous key (React "previous props" pattern), so
 * the entering and exiting layers animate with the same direction in the same commit.
 */
export function useNavDirection(key: string, order: number, navigationType: NavigationType): NavDirection {
  const [state, setState] = useState<{ key: string; order: number; direction: NavDirection }>({
    key,
    order,
    direction: 1,
  });
  if (state.key !== key) {
    const direction = directionBetween(state.order, order, navigationType);
    setState({ key, order, direction });
    return direction;
  }
  return state.direction;
}
