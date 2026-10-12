/**
 * Pixel comparison of the design-system components against the Penpot reference renders.
 *
 *   1. start the dev server:   npx vite --port 5199 --strictPort        (in apps/web)
 *   2. run:                    node scripts/visual-compare.ts --base http://127.0.0.1:5199
 *
 * For every slug in design/reference/components/manifest.json (except system UI) the script
 * opens `/__design?fixture=<slug>` (see pages/DesignGalleryPage.tsx) at the reference's CSS size
 * and device scale factor, screenshots it, composites the transparent reference PNG onto the
 * same background colour and diffs both with pixelmatch.
 *
 * Output (design/compare/components/): `<slug>.png` = reference | actual | diff side by side,
 * and `results.json` with the mismatch percentage of the whole canvas and of the component box.
 *
 * Options: --base <url>  --only <slug,slug>  --threshold <0..1>  --out <dir>
 * Chromium: uses Playwright's bundled browser, or PLAYWRIGHT_CHROMIUM_PATH, or any installed
 * `ms-playwright/chromium_headless_shell-*` build as a fallback.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { chromium, type Browser } from 'playwright';
import { PNG } from 'pngjs';

interface ManifestEntry {
  component: string;
  file: string;
  width: number;
  height: number;
  scale: number;
  shapeWidth: number;
  shapeHeight: number;
  includesOwnShadowBounds: boolean;
}

interface Result {
  slug: string;
  theme: 'light' | 'dark';
  canvas: { width: number; height: number };
  /** Mismatching pixels / all pixels of the canvas, in %. */
  mismatchCanvas: number;
  /** Mismatching pixels inside the component's own box (without shadow bounds), in %. */
  mismatchShape: number;
  file: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const referenceDir = join(repoRoot, 'design/reference/components');

/** System UI (status bar, home indicator) is not implemented by the web app. */
const SKIP = /^(status-bar|home-indicator)--/;

const BACKGROUNDS: Record<'light' | 'dark', [number, number, number]> = {
  light: [0xf7, 0xf6, 0xf3],
  dark: [0x0e, 0x0e, 0x10],
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function themeOf(slug: string): 'light' | 'dark' {
  return slug.endsWith('-dark') ? 'dark' : 'light';
}

/** Component box inside the reference canvas (shadow bounds are centred horizontally). */
function shapeBox(entry: ManifestEntry, slug: string): { x: number; y: number; width: number; height: number } {
  const offsets: Record<string, { x: number; y: number }> = {
    'bottom-sheet': { x: 140, y: 158 },
    'confirmation-dialog': { x: 260, y: 240 },
  };
  const offset = entry.includesOwnShadowBounds ? (offsets[slug] ?? { x: 132, y: 124 }) : { x: 0, y: 0 };
  return {
    x: offset.x * entry.scale,
    y: offset.y * entry.scale,
    width: entry.shapeWidth * entry.scale,
    height: entry.shapeHeight * entry.scale,
  };
}

function composite(png: PNG, background: [number, number, number]): PNG {
  const out = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const alpha = (png.data[i + 3] ?? 255) / 255;
    for (let c = 0; c < 3; c += 1) {
      out.data[i + c] = Math.round((png.data[i + c] ?? 0) * alpha + (background[c] ?? 0) * (1 - alpha));
    }
    out.data[i + 3] = 255;
  }
  return out;
}

function crop(png: PNG, box: { x: number; y: number; width: number; height: number }): PNG {
  const out = new PNG({ width: box.width, height: box.height });
  PNG.bitblt(png, out, box.x, box.y, box.width, box.height, 0, 0);
  return out;
}

function sideBySide(images: readonly PNG[]): PNG {
  const gap = 8;
  const width = images.reduce((sum, image) => sum + image.width, 0) + gap * (images.length - 1);
  const height = Math.max(...images.map((image) => image.height));
  const out = new PNG({ width, height });
  out.data.fill(255);
  let x = 0;
  for (const image of images) {
    PNG.bitblt(image, out, 0, 0, image.width, image.height, x, 0);
    x += image.width + gap;
  }
  return out;
}

function findInstalledChromium(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : undefined,
    join(homedir(), '.cache', 'ms-playwright'),
    join(homedir(), 'Library', 'Caches', 'ms-playwright'),
  ].filter((root): root is string => Boolean(root && existsSync(root)));
  for (const root of roots) {
    const builds = readdirSync(root)
      .filter((name) => name.startsWith('chromium_headless_shell-') || name.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const build of builds) {
      const candidates = [
        join(root, build, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
        join(root, build, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
        join(root, build, 'chrome-win64', 'chrome.exe'),
        join(root, build, 'chrome-linux', 'chrome'),
      ];
      const found = candidates.find((candidate) => existsSync(candidate));
      if (found) return found;
    }
  }
  return undefined;
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (error) {
    const executablePath = findInstalledChromium();
    if (!executablePath) throw error;
    console.warn(`Bundled Chromium unavailable – using ${executablePath}`);
    return chromium.launch({ executablePath });
  }
}

async function main(): Promise<void> {
  const base = (argument('base') ?? process.env.HOMI_DESIGN_BASE ?? 'http://localhost:5173').replace(/\/$/, '');
  const outDir = resolve(argument('out') ?? join(repoRoot, 'design/compare/components'));
  const threshold = Number(argument('threshold') ?? '0.1');
  const only = argument('only')?.split(',').filter(Boolean);
  mkdirSync(outDir, { recursive: true });

  const manifest = JSON.parse(readFileSync(join(referenceDir, 'manifest.json'), 'utf8')) as Record<
    string,
    ManifestEntry
  >;
  const slugs = Object.keys(manifest).filter((slug) => !SKIP.test(slug) && (!only || only.includes(slug)));

  const browser = await launch();
  const results: Result[] = [];
  try {
    for (const slug of slugs) {
      const entry = manifest[slug];
      if (!entry) continue;
      const theme = themeOf(slug);
      const width = Math.round(entry.width / entry.scale);
      const height = Math.round(entry.height / entry.scale);
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: entry.scale,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      // Compare the design's translucent glass even when the host OS asks for reduced
      // transparency (e.g. Windows "Transparency effects" off), which the components honour.
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: theme },
          { name: 'prefers-reduced-motion', value: 'reduce' },
          { name: 'prefers-reduced-transparency', value: 'no-preference' },
        ],
      });
      await page.goto(`${base}/__design?fixture=${encodeURIComponent(slug)}`, { waitUntil: 'networkidle' });
      await page.waitForSelector(`[data-fixture="${slug}"]`);
      // Runs in the page (string form: this file is type-checked without DOM types).
      await page.evaluate(`(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map((image) =>
          image.complete ? null : new Promise((done) => image.addEventListener('load', done, { once: true }))));
      })()`);
      await page.waitForTimeout(350);
      const actual = PNG.sync.read(
        await page.screenshot({ clip: { x: 0, y: 0, width, height }, animations: 'disabled', caret: 'hide' }),
      );
      await context.close();

      const reference = composite(PNG.sync.read(readFileSync(join(referenceDir, entry.file))), BACKGROUNDS[theme]);
      const w = Math.min(reference.width, actual.width);
      const h = Math.min(reference.height, actual.height);
      const ref = crop(reference, { x: 0, y: 0, width: w, height: h });
      const act = crop(actual, { x: 0, y: 0, width: w, height: h });
      const diff = new PNG({ width: w, height: h });
      const mismatched = pixelmatch(ref.data, act.data, diff.data, w, h, { threshold, includeAA: false, alpha: 0.35 });

      const box = shapeBox(entry, slug);
      const shapeRef = crop(ref, box);
      const shapeAct = crop(act, box);
      const shapeMismatched = pixelmatch(shapeRef.data, shapeAct.data, null, box.width, box.height, {
        threshold,
        includeAA: false,
      });

      const file = `${slug}.png`;
      writeFileSync(join(outDir, file), PNG.sync.write(sideBySide([ref, act, diff])));
      const result: Result = {
        slug,
        theme,
        canvas: { width: w, height: h },
        mismatchCanvas: Math.round((mismatched / (w * h)) * 10000) / 100,
        mismatchShape: Math.round((shapeMismatched / (box.width * box.height)) * 10000) / 100,
        file,
      };
      results.push(result);
      console.log(
        `${slug.padEnd(42)} canvas ${String(result.mismatchCanvas).padStart(6)} %   component ${String(result.mismatchShape).padStart(6)} %`,
      );
    }
  } finally {
    await browser.close();
  }

  const average = results.reduce((sum, result) => sum + result.mismatchShape, 0) / Math.max(1, results.length);
  writeFileSync(
    join(outDir, 'results.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), base, threshold, averageComponentMismatch: Math.round(average * 100) / 100, results }, null, 2)}\n`,
  );
  console.log(`\n${results.length} components · average component mismatch ${average.toFixed(2)} % · ${outDir}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
