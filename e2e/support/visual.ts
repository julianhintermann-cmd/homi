import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { ARTIFACTS_DIR, REFERENCE_DIR } from './env';

/** Pixel comparison of a screenshot with a design reference (design/reference/**). */

export interface Mask {
  /** Why this region is excluded (documented in the table of the spec). */
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Comparison {
  /** Percentage of compared (= unmasked) pixels that differ (pixelmatch threshold 0.1, anti-aliasing ignored). */
  mismatchPct: number;
  mismatchedPixels: number;
  comparedPixels: number;
  maskedPixels: number;
  /** reference | actual | diff, side by side. */
  sheet: Buffer;
}

export const THRESHOLD = 0.1;

/** The iPhone status bar (0–54) and home indicator (818–852) are not part of the app: always masked. */
export const SYSTEM_MASKS: Mask[] = [
  { label: 'status bar', x: 0, y: 0, w: 393, h: 54 },
  { label: 'home indicator', x: 0, y: 818, w: 393, h: 34 },
];

export function loadReference(relativePath: string): PNG {
  return PNG.sync.read(readFileSync(path.join(REFERENCE_DIR, relativePath)));
}

function fill(png: PNG, mask: Mask): void {
  for (let y = Math.max(0, mask.y); y < Math.min(png.height, mask.y + mask.h); y += 1) {
    for (let x = Math.max(0, mask.x); x < Math.min(png.width, mask.x + mask.w); x += 1) {
      const offset = (y * png.width + x) * 4;
      png.data[offset] = 255;
      png.data[offset + 1] = 0;
      png.data[offset + 2] = 255;
      png.data[offset + 3] = 255;
    }
  }
}

export function compareImages(actualPng: Buffer, referencePath: string, masks: Mask[]): Comparison {
  const actual = PNG.sync.read(actualPng);
  const reference = loadReference(referencePath);
  if (actual.width !== reference.width || actual.height !== reference.height) {
    throw new Error(
      `size mismatch: screenshot ${actual.width}×${actual.height}, reference ${reference.width}×${reference.height}`,
    );
  }
  const { width, height } = reference;
  const masked = new Uint8Array(width * height);
  for (const mask of masks) {
    fill(actual, mask);
    fill(reference, mask);
    for (let y = Math.max(0, mask.y); y < Math.min(height, mask.y + mask.h); y += 1) {
      for (let x = Math.max(0, mask.x); x < Math.min(width, mask.x + mask.w); x += 1) masked[y * width + x] = 1;
    }
  }
  const maskedPixels = masked.reduce((sum, value) => sum + value, 0);
  const diff = new PNG({ width, height });
  const mismatchedPixels = pixelmatch(reference.data, actual.data, diff.data, width, height, {
    threshold: THRESHOLD,
    includeAA: false,
  });
  const comparedPixels = width * height - maskedPixels;

  const sheet = new PNG({ width: width * 3, height });
  PNG.bitblt(reference, sheet, 0, 0, width, height, 0, 0);
  PNG.bitblt(actual, sheet, 0, 0, width, height, width, 0);
  PNG.bitblt(diff, sheet, 0, 0, width, height, width * 2, 0);
  return {
    mismatchPct: (mismatchedPixels / comparedPixels) * 100,
    mismatchedPixels,
    comparedPixels,
    maskedPixels,
    sheet: PNG.sync.write(sheet),
  };
}

export interface VisualRow {
  project: string;
  screen: string;
  mismatchPct: number;
  budgetPct: number;
  maskedPixels: number;
  masks: string[];
}

export function writeArtifacts(project: string, slug: string, comparison: Comparison, actual: Buffer): void {
  const dir = path.join(ARTIFACTS_DIR, 'visual', project);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${slug}.compare.png`), comparison.sheet);
  writeFileSync(path.join(dir, `${slug}.actual.png`), actual);
}

export function writeResults(project: string, rows: VisualRow[]): void {
  const dir = path.join(ARTIFACTS_DIR, 'visual');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `results-${project}.json`), JSON.stringify(rows, null, 2));
  const table = [
    `| screen | mismatch % | budget % | masked px | masks |`,
    `| --- | ---: | ---: | ---: | --- |`,
    ...rows.map(
      (row) =>
        `| ${row.screen} | ${row.mismatchPct.toFixed(2)} | ${row.budgetPct.toFixed(2)} | ${row.maskedPixels} | ${row.masks.join(', ')} |`,
    ),
  ].join('\n');
  writeFileSync(path.join(dir, `results-${project}.md`), `${table}\n`);
}
