import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/http-errors';
import { convertHeicToJpeg, createImageProcessingQueue } from '../../src/modules/inventory/images';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('image processing queue (security review: unbounded concurrent decodes)', () => {
  it('runs at most `concurrency` tasks at once and hands slots over in order', async () => {
    const queue = createImageProcessingQueue({ concurrency: 2, maxQueued: 5 });
    const gates = Array.from({ length: 4 }, () => deferred());
    const started: number[] = [];
    let running = 0;
    let peak = 0;
    const runs = gates.map((gate, index) =>
      queue.run(async () => {
        started.push(index);
        running += 1;
        peak = Math.max(peak, running);
        await gate.promise;
        running -= 1;
        return index;
      }),
    );
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(queue.waiting).toBe(2);
    gates[1]?.resolve();
    await runs[1];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    for (const gate of gates) gate.resolve();
    expect(await Promise.all(runs)).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
    expect(queue.active).toBe(0);
  });

  it('rejects with 503 when the waiting list is full and frees the slot after a failure', async () => {
    const queue = createImageProcessingQueue({ concurrency: 1, maxQueued: 1 });
    const gate = deferred();
    const first = queue.run(() => gate.promise);
    const second = queue.run(async () => 'second');
    const third = queue.run(async () => 'third');
    await expect(third).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', statusCode: 503 });
    await expect(third).rejects.toBeInstanceOf(AppError);
    gate.resolve();
    await first;
    expect(await second).toBe('second');
    await expect(queue.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await queue.run(async () => 'after failure')).toBe('after failure');
    expect(queue.active).toBe(0);
  });
});

describe('convertHeicToJpeg (worker thread)', () => {
  it('runs heic-convert off the main thread and turns its failure into a rejection', async () => {
    // A header-only HEIC: heic-convert (inside the worker) cannot decode it.
    const ftyp = Buffer.alloc(24);
    ftyp.writeUInt32BE(24, 0);
    ftyp.write('ftypheic', 4);
    ftyp.write('mif1heic', 16);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 1);
    try {
      await expect(convertHeicToJpeg(Buffer.concat([ftyp, Buffer.alloc(512)]))).rejects.toThrow();
    } finally {
      clearInterval(timer);
    }
    // The event loop kept running while the worker started and loaded the WASM decoder.
    expect(ticks).toBeGreaterThan(0);
  });
});
