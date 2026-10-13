import { create } from 'zustand';
import type { PendingOp } from './listModel';

/*
 * In-flight shopping mutations per household (module-level, so they survive a tab switch that
 * unmounts the screen while a request is still running). The screen renders
 * `deriveShoppingView(serverData, ops)`; every mutation removes its op once the server answered
 * and the cache holds the confirmed state.
 */

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewPendingOp = DistributiveOmit<PendingOp, 'opId'>;

interface PendingOpsState {
  ops: Readonly<Record<string, readonly PendingOp[]>>;
  add: (householdId: string, op: NewPendingOp) => number;
  remove: (householdId: string, opId: number) => void;
  reset: () => void;
}

let nextOpId = 0;

export const usePendingShoppingOps = create<PendingOpsState>()((set) => ({
  ops: {},
  add: (householdId, op) => {
    nextOpId += 1;
    const opId = nextOpId;
    set((state) => ({
      ops: { ...state.ops, [householdId]: [...(state.ops[householdId] ?? []), { ...op, opId } as PendingOp] },
    }));
    return opId;
  },
  remove: (householdId, opId) =>
    set((state) => {
      const current = state.ops[householdId];
      if (!current?.some((op) => op.opId === opId)) return state;
      return { ops: { ...state.ops, [householdId]: current.filter((op) => op.opId !== opId) } };
    }),
  reset: () => set({ ops: {} }),
}));

const NO_OPS: readonly PendingOp[] = [];

/** Pending ops of one household (stable empty array when there are none). */
export function usePendingOpsFor(householdId: string): readonly PendingOp[] {
  return usePendingShoppingOps((state) => state.ops[householdId] ?? NO_OPS);
}

const queues = new Map<string, Promise<unknown>>();

const ignore = (): undefined => undefined;

/**
 * Runs `task` after every earlier task with any of the given keys settled (failed ones included),
 * and makes later tasks with those keys wait for it. Keys are item ids – so requests for one item
 * reach the server in the order the user made them (create → complete → restore …) and
 * "Erledigte löschen" waits for the completions it is meant to delete – or `create:<household>`,
 * so new items reach the server in the order they were typed.
 */
export function runSerially<T>(keys: string | readonly string[], task: () => Promise<T>): Promise<T> {
  const list = [...new Set(typeof keys === 'string' ? [keys] : keys)];
  const previous = list.map((key) => queues.get(key)).filter((entry) => entry !== undefined);
  const run = Promise.all(previous.map((entry) => entry.then(ignore, ignore))).then(task);
  for (const key of list) queues.set(key, run);
  const cleanup = (): void => {
    for (const key of list) if (queues.get(key) === run) queues.delete(key);
  };
  run.then(cleanup, cleanup);
  return run;
}

/** Key that orders the creates of one household (see {@link runSerially}). */
export const createQueueKey = (householdId: string): string => `create:${householdId}`;
