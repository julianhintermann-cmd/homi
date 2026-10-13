import {
  addDecimals,
  compareDecimals,
  isZeroDecimal,
  maxDecimal,
  subtractDecimals,
  trimDecimal,
} from '@homi/shared/core';

/*
 * Optimistic quantity changes for the item details stepper (design 05).
 *
 * Taps update the displayed value immediately. Changes are sent as *atomic deltas*
 * (`POST …/quantity {delta}`), never as absolute values, so concurrent taps of other household
 * members are never overwritten. Requests are serialised: while one is in flight, further taps are
 * summed up and sent as one delta when it returns (plus a short debounce for the first one), so
 * a burst of taps becomes one or two requests. A failed request rolls the display back to the
 * last value confirmed by the server.
 */

const SCALE = 3;

export interface QuantityServerState {
  /** Decimal string, e.g. "24" or "1.5". */
  quantity: string;
  version: number;
}

export interface QuantityQueueSnapshot {
  /** Value to display (confirmed + outstanding changes, never below 0). */
  quantity: string;
  /** Changes are waiting or in flight. */
  busy: boolean;
}

export interface QuantityQueueOptions<T extends QuantityServerState> {
  /** Sends one delta ("+1", "-0.5" → `"1"`, `"-0.5"`); resolves with the updated item. */
  send: (delta: string) => Promise<T>;
  onConfirmed?: (item: T) => void;
  /** The request failed; the display has already been rolled back. */
  onError?: (error: unknown) => void;
  /** Delay before the first request of a burst. Default 250 ms. */
  debounceMs?: number;
}

function normalize(value: string): string {
  return trimDecimal(value);
}

export class QuantityQueue<T extends QuantityServerState = QuantityServerState> {
  private confirmed: string;
  private version: number;
  private inFlight: string | null = null;
  private pending = '0';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private snapshot: QuantityQueueSnapshot;
  private readonly listeners = new Set<() => void>();
  private idleWaiters: Array<() => void> = [];
  private readonly options: QuantityQueueOptions<T>;

  constructor(initial: QuantityServerState, options: QuantityQueueOptions<T>) {
    this.confirmed = normalize(initial.quantity);
    this.version = initial.version;
    this.options = options;
    this.snapshot = { quantity: this.confirmed, busy: false };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): QuantityQueueSnapshot => this.snapshot;

  get busy(): boolean {
    return this.inFlight !== null || !isZeroDecimal(this.pending);
  }

  /** The value currently shown. */
  get quantity(): string {
    return this.snapshot.quantity;
  }

  /**
   * Server state learned elsewhere (refetch, realtime). Ignored while local changes are
   * outstanding (their response carries the newest state) and when it is older than what we know.
   */
  sync(server: QuantityServerState): void {
    if (this.busy || server.version < this.version) return;
    this.confirmed = normalize(server.quantity);
    this.version = server.version;
    this.emit();
  }

  /** Adds a change; the display is clamped at 0 (a minus at 0 is ignored). */
  add(delta: string): void {
    const current = this.snapshot.quantity;
    const next = maxDecimal(addDecimals(current, delta, SCALE), '0');
    const effective = subtractDecimals(next, current, SCALE);
    if (isZeroDecimal(effective)) return;
    this.pending = addDecimals(this.pending, effective, SCALE);
    this.emit();
    this.schedule();
  }

  /** Moves the display to an absolute value (expressed as a delta to the server). */
  setTo(target: string): void {
    this.add(subtractDecimals(target, this.snapshot.quantity, SCALE));
  }

  /**
   * Sends outstanding changes now and resolves once nothing is waiting or in flight any more
   * (confirmed or rolled back) – e.g. before the edit form opens, so it starts from the version
   * that already contains the user's own taps.
   */
  settle(): Promise<void> {
    this.flush();
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Sends outstanding changes now (e.g. when the screen is left). */
  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.inFlight !== null || isZeroDecimal(this.pending)) return;
    const delta = normalize(this.pending);
    this.pending = '0';
    this.inFlight = delta;
    this.emit();
    this.options.send(delta).then(
      (item) => {
        this.inFlight = null;
        this.confirmed = normalize(item.quantity);
        this.version = item.version;
        this.emit();
        this.options.onConfirmed?.(item);
        // Taps that arrived meanwhile go out immediately as one delta.
        if (!isZeroDecimal(this.pending)) this.flush();
        this.notifyIdle();
      },
      (error: unknown) => {
        clearTimeout(this.timer);
        this.timer = undefined;
        this.inFlight = null;
        this.pending = '0';
        this.emit();
        this.options.onError?.(error);
        this.notifyIdle();
      },
    );
  }

  private notifyIdle(): void {
    if (this.busy || this.idleWaiters.length === 0) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private schedule(): void {
    if (this.inFlight !== null) return; // sent when the request in flight returns
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.options.debounceMs ?? 250);
  }

  private emit(): void {
    let display = this.confirmed;
    if (this.inFlight !== null) display = addDecimals(display, this.inFlight, SCALE);
    display = maxDecimal(addDecimals(display, this.pending, SCALE), '0');
    const quantity = normalize(display);
    const busy = this.busy;
    if (compareDecimals(quantity, this.snapshot.quantity) !== 0 || busy !== this.snapshot.busy) {
      this.snapshot = { quantity, busy };
    }
    for (const listener of this.listeners) listener();
  }
}
