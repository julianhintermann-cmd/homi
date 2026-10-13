import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared constants for the Playwright config, the global setup and the specs. Everything is derived
 * deterministically (no randomness) because the config is evaluated again in every worker process.
 */

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The single port the E2E run owns (production server: API + Socket.IO + built SPA). */
export const E2E_PORT = 4173;
export const BASE_URL = `http://localhost:${E2E_PORT}`;

/** Dedicated, disposable database – dropped and recreated by the global setup. The name must contain "e2e". */
export const DEFAULT_E2E_DATABASE_URL = 'postgresql://homi:homi@localhost:5432/homi_e2e';
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL?.trim() || DEFAULT_E2E_DATABASE_URL;

/** Test-only secret (48 chars) – never used outside the E2E server. */
export const E2E_SESSION_SECRET = 'e2e-only-session-secret-0123456789-abcdefghijkl';

/** Upload directory of the E2E server (wiped by the global setup). */
export const E2E_UPLOAD_DIR = path.join(os.tmpdir(), 'homi-e2e-uploads');

export const SERVER_ENTRY = path.join(REPO_ROOT, 'apps/server/dist/index.js');
export const WEB_DIST_INDEX = path.join(REPO_ROOT, 'apps/web/dist/index.html');

export const ARTIFACTS_DIR = path.join(REPO_ROOT, 'e2e/.artifacts');
export const PRODUCT_IMAGE_DIR = path.join(REPO_ROOT, 'design/assets/products');
export const REFERENCE_DIR = path.join(REPO_ROOT, 'design/reference');

/** Password used by every E2E account (satisfies the policy: ≥ 10 chars, letter + digit). */
export const TEST_PASSWORD = 'Sommer-Wiese-2026';

/** Refuses to touch a database whose name does not mark it as disposable. */
export function assertDisposableDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/e2e|demo/i.test(name)) {
    throw new Error(`Refusing to use database "${name}": the name must contain "e2e" or "demo".`);
  }
}
