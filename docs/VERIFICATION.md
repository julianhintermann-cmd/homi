# Homi – Release Verification

**Date:** 2026-10-13
**Environment:** Windows 11, Node >= 22.22, Docker Desktop, PostgreSQL 18, Playwright 1.64 (chromium + webkit)
**Method:** every command run once, centrally, from the working tree (no `npm ci`; dependencies were already installed). No product code was changed.

## 1. Results

| Command                                                | Result                     | Counts                                                                               |
| ------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------ |
| `npm run db:generate`                                  | exit 0                     | Prisma client generated                                                              |
| `npm run typecheck`                                    | exit 0                     | all workspaces                                                                       |
| `npm run lint`                                         | exit 0                     | no warnings                                                                          |
| `npx prettier --check .`                               | exit 0                     | all files formatted                                                                  |
| `npm test`                                             | exit 0                     | shared 90/90, server 96/96, web 371/371 (557 total)                                  |
| `npm run test:integration` (DB `homi_test`)            | first run exit 1 (see 1.1) | 15 of 16 files passed, 271 tests passed; the crashed file re-run alone: 12/12 passed |
| `npm run build`                                        | exit 0                     | web: 70 precache entries (1132.71 KiB); server `dist/index.js` 314.5 KiB             |
| `npx playwright test` (all 4 projects, DB `homi_e2e`)  | exit 0                     | 63 passed, 1 skipped (service-worker test, Chromium only), 0 failed                  |
| `docker build -t homi:verify .`                        | exit 0                     | image 202 MB content size                                                            |
| compose smoke (`-p homi-verify`, port 3400, `down -v`) | pass                       | see 1.2                                                                              |

### 1.1 Integration suite: Windows native worker crash

The first run of `npm run test:integration` reported `Worker exited unexpectedly with exit code 3221226505` (0xC0000409) while running `test/integration/chat-realtime.test.ts`. That is the known Windows-only native worker crash. Per the brief the file was re-run alone (`npx vitest run --project integration test/integration/chat-realtime.test.ts` in `apps/server`): 12/12 passed. No assertion failure occurred anywhere. The suite total is 278 tests in 16 files; 271 were counted in the crashed run, the remainder belongs to the crashed file, which then passed on re-run.

### 1.2 Docker and compose smoke

- Build succeeded with the unchanged Dockerfile.
- `docker compose -p homi-verify` with a throwaway env file (`APP_URL=http://localhost:3400`, bound to 127.0.0.1) and an override that points the `homi` service to the local `homi:verify` image: both containers healthy.
- Migration `20261012191721_init` applied on start; the server listened on 3000.
- `GET /api/health` returned `{"status":"ok","db":"ok"}`; `GET /` returned 200; security headers present, CSP `connect-src 'self' ws://localhost:3400` (matches `APP_URL`).
- Container user uid 1000; `touch /app/x` is denied (app files read-only); `npm` not present in the image.
- `down -v` removed containers, network and both volumes. Image `homi:verify` was removed afterwards. Only the dev container `homi-dev-db-1` remains. No process listens on 3400 or 4173.

## 2. Two-user and tenant-isolation results (Playwright)

- `e2e/two-users.spec.ts`: full scenario (register, household, invitation, item and shopping/chat sync between two independent browser contexts) passed in `chromium-iphone` and `webkit-iphone`.
- `e2e/tenant-isolation.spec.ts` (6 tests) all passed: a stranger gets 404 on 30 endpoints, ids of household A are useless inside household C, a plain member gets 403 on owner-only actions, anonymous requests get 401, a missing CSRF header gets 403, and two WebSocket tests (including a removed member) pass.
- `e2e/iphone.spec.ts` (overflow at 393 and 320 px on every route, tab bar and swipe, add-item sheet, 16 px inputs, chat composer above keyboard, reduced motion, PWA manifest/icons/iOS meta, service worker) passed.
- Server-side abuse limits and regression tests are covered by the integration suite (`abuse-limits.test.ts`, `auth`, `households`, `realtime`).

## 3. Visual mismatch per screen (% of differing pixels versus design reference)

Reference: `design/reference/{light,dark}/*.png` (393x852 @1x). Values from this run; all are within budget.

| Screen                          | Chromium | WebKit | Budget |
| ------------------------------- | -------: | -----: | -----: |
| 01 Home                         |     1.80 |   1.20 |    3.0 |
| 02 Inventar                     |     2.10 |   1.32 |    3.4 |
| 03 Einkaufsliste                |     0.89 |   0.47 |    1.6 |
| 04 Chats                        |     0.79 |   0.41 |    1.5 |
| 05 Artikel-Details              |     0.72 |   0.61 |    1.4 |
| 06 Neuer Artikel (photo masked) |     1.15 |   0.46 |    2.0 |
| 08 Chat Lisa                    |     1.88 |   1.02 |    3.1 |
| 09 Haushalt & Profil            |     1.20 |   0.27 |    2.1 |
| 01 Home dark                    |     1.75 |   1.17 |    2.9 |
| 02 Inventar dark                |     2.09 |   1.32 |    3.4 |
| 03 Einkaufsliste dark           |     0.92 |   0.40 |    1.7 |
| 04 Chats dark                   |     0.83 |   0.39 |    1.5 |
| 05 Artikel-Details dark         |     0.86 |   0.77 |    1.6 |
| 06 Neuer Artikel dark           |     1.11 |   0.47 |    2.0 |
| 08 Chat dark                    |     1.85 |   0.99 |    3.1 |

Residual mismatch is text rasterisation, glass shadows and the Windows colour-emoji font. The app shows CHF with a typographic apostrophe (2’485.50) where the design has 2'485.50. For screen 06 the photo area (353x200 px) is masked because the design stretches the photo while the app crops it. Compare sheets: `e2e/.artifacts/visual/<project>/` (reference | actual | diff), tables in `e2e/.artifacts/visual/results-*.md`.

## 4. Persistence tests (from the release/DevOps report)

Scenario: register, household, upload `milk.png`, inventory item, shopping item, chat message; 8 checks (login, account, item, thumb image, full image, shopping item, message, image hash) at baseline and after each step. All passed after:

- `compose restart`
- `down` then `up -d`
- `up -d --force-recreate`
- `up -d --build --force-recreate`

Image hashes were identical every time (WebP variants stored as `node:node` in the uploads volume). An additional pg_dump (custom format) plus uploads tar restored into a separate empty stack passed all 8 checks with identical hashes. These results were taken from the release report; they were not re-run in this verification (only the smoke run in 1.2 was).

## 5. Changes made by the verifier

None. No product code, test code or docs other than this file were modified.

## 6. GitHub Actions and GHCR (2026-10-13)

| Run                                                                                  | Result                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [38345110575](https://github.com/julianhintermann-cmd/homi/actions/runs/38345110575) | CI gate failed on the WebKit two-user e2e test (stuck tab-to-push transition, a real bug) – publish correctly skipped. Lint/typecheck/unit/build, integration (Linux: no worker crash), Docker smoke and all 15 visual comparisons passed on Linux. |
| [38348407053](https://github.com/julianhintermann-cmd/homi/actions/runs/38348407053) | All jobs green: lint/typecheck/unit/build, integration, e2e (Chromium + WebKit incl. visual + navigation-race), Docker smoke, multi-arch build and push.                                                                                            |

- Published tags: `ghcr.io/julianhintermann-cmd/homi:latest`, `:main`, `:sha-490503d` (linux/amd64 + linux/arm64, provenance + SBOM attestations).
- The package is publicly pullable: an anonymous registry token fetched the manifest (HTTP 200) and `docker pull ghcr.io/julianhintermann-cmd/homi:latest` succeeded without login.
- Deployment from the published image (README quick start: `docker-compose.yml` + `.env` in an empty folder, port 3500): health ok, SPA 200, register 201 (cookie `HttpOnly; SameSite=Lax`, no `Secure` over http), household + item (2 × CHF 8.50 = 17.00) + dashboard OK, PostgreSQL not published on the host; stack removed with `down -v`.

## 7. Known limitations

- No test on a physical iPhone; iOS behaviour is covered only by Playwright WebKit with iPhone emulation (keyboard is simulated, no real Safari PWA install, no push or standby behaviour).
- Visual references come from a Penpot export; Penpot's renderer differs from browsers (fonts, shadows, blur), hence the non-zero budgets. Budgets were measured on Windows and also pass on the Linux CI runner. `visual-webkit` is excluded in CI unless `E2E_VISUAL_WEBKIT=1`.
- The service-worker test runs in Chromium only (skipped in WebKit).
- Windows-only native worker crash 0xC0000409 can hit one integration test file; a re-run of that file passes.
- HEIC upload with a real photo is untested (no sample or encoder available); only the worker error path is covered.
- Workflow hardening (`persist-credentials: false`, visual artifacts on failure) was applied after this report and ran green on GitHub Actions (section 6).
- Not reproduced, cause unknown: in one WebKit batch (3 workers) 3 of 12 two-user runs ended on /willkommen after "Einladung annehmen" (0 of 22 afterwards); one `seed-demo` run failed once with an uncaptured error. Both passed in this verification run.
- `npm audit` for the Prisma CLI is an accepted risk (DEPLOYMENT.md section 10).
- Visual budgets were calibrated on Windows; they also passed on the Linux CI runner (section 6).
