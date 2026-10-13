import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuantityQueue, type QuantityServerState } from './quantityQueue';

interface Deferred {
  delta: string;
  resolve: (state: QuantityServerState) => void;
  reject: (error: unknown) => void;
}

/** A fake server that applies deltas atomically with GREATEST(q + d, 0), answering on demand. */
function fakeServer(initial: string) {
  let quantity = Number(initial);
  let version = 1;
  const requests: Deferred[] = [];
  const send = vi.fn(
    (delta: string) =>
      new Promise<QuantityServerState>((resolve, reject) => {
        requests.push({ delta, resolve, reject });
      }),
  );
  return {
    send,
    requests,
    /** Answers the oldest open request successfully. */
    respond() {
      const request = requests.shift();
      if (!request) throw new Error('no open request');
      quantity = Math.max(quantity + Number(request.delta), 0);
      version += 1;
      request.resolve({ quantity: String(quantity), version });
    },
    fail(error: unknown = new Error('offline')) {
      const request = requests.shift();
      if (!request) throw new Error('no open request');
      request.reject(error);
    },
    /** Another household member changes the item. */
    external(delta: number) {
      quantity = Math.max(quantity + delta, 0);
      version += 1;
      return { quantity: String(quantity), version };
    },
    get quantity() {
      return quantity;
    },
  };
}

async function settle(): Promise<void> {
  // let promise callbacks run
  await Promise.resolve();
  await Promise.resolve();
}

describe('QuantityQueue (optimistic, serialised atomic deltas)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows taps immediately and sends a burst as one debounced delta', async () => {
    const server = fakeServer('24');
    const queue = new QuantityQueue({ quantity: '24', version: 1 }, { send: server.send, debounceMs: 250 });
    queue.add('1');
    queue.add('1');
    queue.add('1');
    expect(queue.getSnapshot()).toEqual({ quantity: '27', busy: true });
    expect(server.send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(server.send).toHaveBeenCalledTimes(1);
    expect(server.send).toHaveBeenLastCalledWith('3');

    server.respond();
    await settle();
    expect(queue.getSnapshot()).toEqual({ quantity: '27', busy: false });
    expect(server.quantity).toBe(27);
  });

  it('serialises requests: taps during a request are sent as one delta afterwards', async () => {
    const server = fakeServer('5');
    const onConfirmed = vi.fn();
    const queue = new QuantityQueue({ quantity: '5', version: 1 }, { send: server.send, onConfirmed, debounceMs: 100 });
    queue.add('1');
    vi.advanceTimersByTime(100);
    expect(server.send).toHaveBeenCalledTimes(1);

    // three more taps while the first request is in flight
    queue.add('1');
    queue.add('-1');
    queue.add('1');
    vi.advanceTimersByTime(1000);
    expect(server.send).toHaveBeenCalledTimes(1); // never two requests at once
    expect(queue.quantity).toBe('7');

    server.respond();
    await settle();
    expect(server.send).toHaveBeenCalledTimes(2);
    expect(server.send).toHaveBeenLastCalledWith('1');
    expect(queue.getSnapshot()).toEqual({ quantity: '7', busy: true });

    server.respond();
    await settle();
    expect(queue.getSnapshot()).toEqual({ quantity: '7', busy: false });
    expect(onConfirmed).toHaveBeenCalledTimes(2);
    expect(server.quantity).toBe(7);
  });

  it('rolls back to the last confirmed value when a request fails', async () => {
    const server = fakeServer('3');
    const onError = vi.fn();
    const queue = new QuantityQueue({ quantity: '3', version: 1 }, { send: server.send, onError, debounceMs: 0 });
    queue.add('1');
    vi.advanceTimersByTime(0);
    server.respond();
    await settle();
    expect(queue.quantity).toBe('4');

    queue.add('1');
    vi.advanceTimersByTime(0);
    queue.add('1'); // queued behind the failing request
    expect(queue.quantity).toBe('6');
    const error = new Error('offline');
    server.fail(error);
    await settle();
    expect(onError).toHaveBeenCalledWith(error);
    expect(queue.getSnapshot()).toEqual({ quantity: '4', busy: false });
    vi.advanceTimersByTime(1000);
    expect(server.send).toHaveBeenCalledTimes(2); // the queued tap was dropped with the rollback
  });

  it('never goes below zero and ignores minus at zero', () => {
    const server = fakeServer('1');
    const queue = new QuantityQueue({ quantity: '1', version: 1 }, { send: server.send });
    queue.add('-1');
    queue.add('-1');
    queue.add('-1');
    expect(queue.quantity).toBe('0');
    vi.advanceTimersByTime(250);
    expect(server.send).toHaveBeenCalledTimes(1);
    expect(server.send).toHaveBeenLastCalledWith('-1');
  });

  it('handles decimal steps exactly and absolute targets as deltas', () => {
    const server = fakeServer('1.5');
    const queue = new QuantityQueue({ quantity: '1.5', version: 1 }, { send: server.send });
    queue.add('0.5');
    queue.add('0.1');
    queue.add('0.2');
    expect(queue.quantity).toBe('2.3');
    queue.setTo('0.75');
    expect(queue.quantity).toBe('0.75');
    vi.advanceTimersByTime(250);
    expect(server.send).toHaveBeenLastCalledWith('-0.75');
  });

  it('follows server changes from elsewhere only while idle and only when newer', async () => {
    const server = fakeServer('2');
    const queue = new QuantityQueue({ quantity: '2', version: 1 }, { send: server.send, debounceMs: 0 });
    queue.sync(server.external(+3));
    expect(queue.quantity).toBe('5');
    queue.sync({ quantity: '1', version: 1 }); // stale refetch
    expect(queue.quantity).toBe('5');

    queue.add('1');
    queue.sync(server.external(+10)); // ignored while busy …
    expect(queue.quantity).toBe('6');
    vi.advanceTimersByTime(0);
    server.respond();
    await settle();
    // … the response carries the combined server state (5 + 10 + 1)
    expect(queue.quantity).toBe('16');
  });

  it('notifies subscribers and sends outstanding changes on flush()', () => {
    const server = fakeServer('2');
    const queue = new QuantityQueue({ quantity: '2', version: 1 }, { send: server.send, debounceMs: 5000 });
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);
    queue.add('2');
    expect(listener).toHaveBeenCalled();
    queue.flush();
    expect(server.send).toHaveBeenCalledWith('2');
    unsubscribe();
  });

  // Review finding: opening the edit form while own taps were still in flight made its save fail
  // with a conflict "by someone else". settle() lets the form wait for the confirmed version.
  it('settle() sends waiting taps at once and resolves after the last answer (also chained ones)', async () => {
    const server = fakeServer('1');
    const queue = new QuantityQueue({ quantity: '1', version: 1 }, { send: server.send, debounceMs: 5000 });
    const idle = vi.fn();

    await queue.settle(); // nothing outstanding → resolves immediately
    queue.add('1');
    queue.add('1');
    void queue.settle().then(idle);
    expect(server.send).toHaveBeenCalledWith('2'); // no debounce wait
    queue.add('1'); // tapped while the request is in flight
    server.respond();
    await settle();
    expect(idle).not.toHaveBeenCalled(); // the follow-up delta is still on its way
    expect(server.send).toHaveBeenLastCalledWith('1');
    server.respond();
    await settle();
    expect(idle).toHaveBeenCalledTimes(1);
    expect(queue.busy).toBe(false);
    expect(server.quantity).toBe(4);
  });

  it('settle() also resolves when the request failed (after the rollback)', async () => {
    const server = fakeServer('3');
    const queue = new QuantityQueue({ quantity: '3', version: 1 }, { send: server.send, debounceMs: 0 });
    const idle = vi.fn();
    queue.add('-1');
    void queue.settle().then(idle);
    server.fail();
    await settle();
    expect(idle).toHaveBeenCalledTimes(1);
    expect(queue.quantity).toBe('3');
  });
});
