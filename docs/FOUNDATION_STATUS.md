# Homi – Foundation Status

**Stand:** 2026-10-12 (end of the foundation phase, after integration)
**Contract:** [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) (binding; §9 lists every deviation from its first draft)
**Visual spec:** [`design/FIDELITY.md`](../design/FIDELITY.md)

The foundation is complete and integrated: the monorepo type-checks, lints, tests and builds from the
root; the dev setup (PostgreSQL in Docker → migrations → Fastify → Vite proxy → SPA) works end to end.
No product feature is implemented yet – every API module is an empty plugin and every product page is a
placeholder. Feature teams start from here.

---

## 1. What exists

### `packages/shared` – API contract (`@homi/shared`)

- Zod request/response schemas and DTO types for every endpoint in ARCHITECTURE §5: `auth.ts`,
  `households.ts`, `inventory.ts`, `shopping.ts`, `chat.ts`, `activity.ts`, `dashboard.ts`, `common.ts`.
- Realtime event types (`realtime.ts`: `ServerToClientEvents`, `ClientToServerEvents`, `SyncEvent`, …).
- Enums + German labels (`enums.ts`), `LIMITS` (`constants.ts`), error catalogue `API_ERRORS` (`errors.ts`).
- Decimal helpers on scaled BigInt (`decimal.ts`) and the de-CH formatters (`format.ts`: `formatCHF` →
  `CHF 2’485.50`, quantities, unit prices, chat/relative dates). German zod error map (`zod-de.ts`).
- 75 unit tests.

### `apps/server` – Fastify 5 + Socket.IO + Prisma 7

- Complete: config (zod), Prisma client factory, logger with redaction, sessions (HMAC-hashed tokens,
  sliding expiry), Argon2id passwords, CSRF, helmet/CSP, error envelope, rate-limit presets, local image
  storage, mailer (SMTP or disabled), SPA static serving with cache rules, `/api/health`, Socket.IO with
  cookie auth + room management (`app.realtime`), graceful shutdown.
- Complete: `modules/activity/service.ts` (`recordActivity`, `listRecentActivity`, `sumValueDeltaSince`,
  `toActivityDto`).
- Schema + initial migration `prisma/migrations/20261012191721_init` (matches `schema.prisma`).
- **Empty:** all feature route plugins (see §6).
- Test infrastructure: `test/helpers` – `buildTestApp({ configure })`, `TestClient` (cookies, CSRF header,
  Origin), fixtures `createUser`, `createLoggedInUser`, `createHousehold`, `addMember` (write straight to
  the DB, so teams do not depend on each other's routes). 84 unit + 20 integration tests.

### `apps/web` – React 19 + Vite 8 PWA

- Routing infrastructure (`src/routes/`): guards (auth / household / public-only, safe `?redirect=`),
  tab shell with swipe between tabs, stack layout with iOS push transitions, modal sheet routes over a
  mounted background screen, lazy named-export pages, `paths.*`, `useGoBack`, `useOpenSheet`,
  `useCloseSheet`, `useSheetDirty`.
- Data layer: `api/client.ts` (CSRF header, `ApiError`, upload with progress, 401 handling),
  `api/queryKeys.ts`, `api/auth.ts`, `api/account.ts`, TanStack Query client, socket singleton,
  `useRealtimeSync` (sync/membership/reconnect → query invalidation), connectivity detection +
  `/api/health` probing, `useActiveHousehold` / `useRequiredHouseholdId`, `useKeyboardInset`,
  scroll memory, haptics, theme (system/light/dark + reduce transparency, pre-paint `theme-boot.js`).
- PWA: generateSW, prompt-to-update, app icons, offline app shell (verified in headless Chromium by the
  web-foundation agent).
- Design system (`src/components/`, barrel `@/components`): 40+ components in light and dark, matching the
  Penpot reference PNGs (median pixel mismatch 0.32 %, 53/67 components < 1 %). Tokens in
  `styles/tokens.css` (FIDELITY D1–D10 applied), glass in `styles/glass.css`, component CSS in
  `styles/components.css`. Icons: `src/icons/paths.ts` + `<Icon/>`.
- Dev-only design gallery at `/__design` (every component/state, light/dark/system, reduce transparency).
- 132 unit/component tests.

### `design/` – extracted Penpot design

`FIDELITY.md` (layout tables + checklists per screen, component appendix, deviations D1–D10),
`extracted/` (tokens, 30 screen trees, 71 component variants, prototype, foundations), `reference/`
(30 screen PNGs at 1× = 393×852, 71 component PNGs, manifests), `icons/*.svg` (36), `assets/products/*.png` (9).

### Repository root

`package.json` (npm workspaces + root scripts), `tsconfig.base.json`, `eslint.config.js`, Prettier config,
`docker-compose.dev.yml` (PostgreSQL 18 on `127.0.0.1:5432`, dbs `homi` + `homi_test`), `.env.example`.

---

## 2. How to run

Prerequisites: Node 24 (engines `>=22.22`), Docker Desktop. Dependencies are installed at the repo root –
**do not run `npm install` for new packages** without the orchestrator.

```bash
# one-time
cp .env.example .env                                   # dev defaults; SESSION_SECRET may stay empty in dev
docker compose -f docker-compose.dev.yml up -d         # PostgreSQL 18 (homi + homi_test)
npm run db:generate                                    # Prisma client → apps/server/src/generated (gitignored)
npm run db:deploy                                      # apply migrations to the dev database

# development (two terminals, or `npm run dev` for both via concurrently)
npm run dev -w @homi/server                            # http://localhost:3000 (tsx watch, reads ../../.env)
npm run dev -w @homi/web                               # http://localhost:5173 (proxies /api + /socket.io → :3000)
#   design gallery: http://localhost:5173/__design

# checks (all from the repo root)
npm run typecheck
npm run lint                                           # eslint . (0 warnings expected)
npm test                                               # unit tests of all workspaces
npm run test:integration                               # server integration tests against homi_test
npm run build                                          # web (typecheck + vite build + SW) then server (esbuild)

# production-like run of the build
NODE_ENV=production APP_URL=http://127.0.0.1:3101 PORT=3101 \
SESSION_SECRET=<≥32 chars> DATABASE_URL=postgresql://homi:homi@localhost:5432/homi \
node apps/server/dist/index.js                         # serves apps/web/dist + /api + /socket.io

# new migration (server team)
npm run db:migrate                                     # prisma migrate dev
```

Other useful commands: `npm run pwa:assets -w @homi/web` (regenerate icons),
`node apps/web/scripts/visual-compare.ts --base <dev-server-url>` (component pixel diff → `design/compare/`,
gitignored). Stop the database with `docker compose -f docker-compose.dev.yml down` (data volume is kept).

---

## 3. Verification results (2026-10-12, integration run)

| Command (repo root)                                                  | Result                                                                                                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                  | pass – shared, server, web (`tsconfig.json` + `tsconfig.node.json`)                                                                     |
| `npm run lint` / `npx eslint . --max-warnings 0`                     | pass – 0 errors, 0 warnings                                                                                                             |
| `npm test`                                                           | pass – shared 75/75, server unit 84/84, web 132/132 (15 files)                                                                          |
| `npm run test:integration`                                           | pass – 20/20 against `homi_test` (PostgreSQL 18 in Docker)                                                                              |
| `npm run build`                                                      | pass – web: 43 precache entries (905.6 KiB), `sw.js`; server: `dist/index.js` 174.7 KiB                                                 |
| `npm run db:deploy`                                                  | pass – "No pending migrations to apply"                                                                                                 |
| Dev: `npm run dev -w @homi/server` + `npm run dev -w @homi/web`      | pass – see below                                                                                                                        |
| `curl http://localhost:5173/api/health` (through the Vite proxy)     | `200 {"status":"ok","db":"ok"}` with CSP/helmet headers                                                                                 |
| `curl http://localhost:5173/`, `/inventar/neu`                       | `200 text/html` (SPA, deep link)                                                                                                        |
| `curl http://localhost:5173/socket.io/?EIO=4&transport=polling`      | `200`, Engine.IO handshake                                                                                                              |
| `POST /api/auth/logout` via proxy without / with `X-Homi-Request: 1` | `403 CSRF` / `404 NOT_FOUND` (route not implemented yet)                                                                                |
| Browser (Claude browser pane) `http://localhost:5173/`               | SPA renders; shows "Server nicht erreichbar" because `/api/auth/me` is not implemented yet (expected)                                   |
| Browser `http://localhost:5173/__design`                             | gallery renders; `showToast()` shows the 300×44 toast via the newly mounted `ToastHost`                                                 |
| Production smoke `node apps/server/dist/index.js` (port 3101)        | `/api/health` 200; `/` + `/inventar/neu` → SPA (`no-cache`); `sw.js` `no-cache`; hashed assets `immutable`; unknown `/api/*` → JSON 404 |
| `npx prettier --check .`                                             | **fails** for 19 files (not part of lint/CI yet – see §5.4)                                                                             |

All dev/prod servers started for these checks were stopped afterwards. The dev database container
(`homi-dev-db-1`) is left running.

---

## 4. Integration fixes made in this phase

| Change                                                                                                                                                                                            | Files                                                                                                                                                       | Why                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Mounted `<ToastHost />` in `RootLayout` (outside `.app-main`, so it stays usable while a sheet makes the main tree `inert`)                                                                       | `apps/web/src/App.tsx`                                                                                                                                      | `showToast()` rendered nothing                                                             |
| Route sheets can report unsaved input: `useSheetDirty(dirty)` → `SheetLayer` passes `dirty` to `HomiBottomSheet`                                                                                  | `apps/web/src/routes/sheetDirty.ts` (new), `apps/web/src/routes/SheetLayer.tsx`, `apps/web/src/routes/SheetLayer.test.tsx` (new, 2 tests, mutation-checked) | `SheetLayer` owns the sheet, so the edit page had no way to enable "Änderungen verwerfen?" |
| Reduced-transparency `--glass-fill` now derives from the theme's `--glass-solid`                                                                                                                  | `apps/web/src/styles/tokens.css`                                                                                                                            | it was white 97 % even in system dark mode                                                 |
| `design/compare/` gitignored                                                                                                                                                                      | `.gitignore`                                                                                                                                                | 4.7 MB of regenerated visual-compare output                                                |
| Local `.env` created from `.env.example` (gitignored)                                                                                                                                             | `.env`                                                                                                                                                      | dev server and integration tests need `DATABASE_URL` / `DATABASE_URL_TEST`                 |
| ARCHITECTURE.md brought in line with the code (§1, §2, §3, §4, §5, §6, §7, §8, new §9 deviations); Prettier-formatted, pipes inside code spans of the API tables escaped (they split table cells) | `docs/ARCHITECTURE.md`                                                                                                                                      | foundation agents deviated in paths, flags and names                                       |

---

## 5. Known gaps feature teams must handle

### 5.1 Cross-cutting

1. **Auth first.** Until `GET /api/auth/me` exists the SPA only shows "Server nicht erreichbar"
   (any non-200/401 answer is treated as unreachable). Use `/__design` for UI work until then.
2. **Fresh clones / CI / Docker** must run `npm run db:generate` before typecheck, tests or build.
3. **Server routes** are declared without `/api` (prefix added in `app.ts`); validate with the
   `@homi/shared` schemas; guard with `requireUser` / `requireMember(req, householdId, minRole)`; write
   activities only via `recordActivity()`; emit `app.realtime.emitSync(...)` **after** the transaction
   commits (`inventory`/`shopping` also emit `scope: "dashboard"`); rate-limit via `RATE_LIMITS.*`.
4. **Integration tests** need `DATABASE_URL_TEST` (in `.env`) and the dev DB running; use
   `buildTestApp`, `TestClient` and the fixtures in `apps/server/test/helpers`.
5. **Web pages** are named exports matching the file name (type-checked by `lazyPage`); use `paths.*`,
   `queryKeys.*`, `useRequiredHouseholdId()`, `useGoBack(fallback)`, `useOpenSheet()`/`useCloseSheet()`;
   pages must not create their own scroll container (`useScrollContainer()` gives the layer's).
6. **Feature API clients** do not exist yet: create `apps/web/src/api/{households,dashboard,inventory,shopping,chat}.ts`
   on top of `api/client.ts` (and extend `auth.ts`/`account.ts` if needed). `features/` is created by the teams.
7. **Money/quantity display** only via `@/lib/format` (re-exports `@homi/shared`), never `Intl.NumberFormat`.
   Unknown price = `null` → never "CHF 0.00".
8. **Prettier**: run `npx prettier --write <your files>` before handing in (lint does not enforce it).

### 5.2 Per team

- **auth**: implement `modules/auth/routes.ts` (config, register, login, logout, me, password reset) incl.
  per-email login limiter (`KEYED_RATE_LIMITS.loginPerEmail`) and generic login errors; replace the four
  auth pages (Login/Register exist as minimal working forms).
- **account**: `modules/account/routes.ts` (profile, password change revoking other sessions, active
  household); replace Profile (currently only logout) and Settings (currently only appearance).
- **households**: `modules/households/routes.ts` incl. invitations (raw token returned once, HMAC stored),
  last-owner rule (`409 LAST_OWNER`), `syncUserRooms` + `membership` events, household-creation
  transaction (household, owner, shopping list, household conversation, activity). Screen 09 role labels
  ("Verwaltung" vs. owner/admin) are ambiguous in the design – decide and document.
- **home/dashboard**: `modules/dashboard/routes.ts` (use `listRecentActivity`, `sumValueDeltaSince`).
- **inventory**: `modules/inventory/routes.ts` (items, atomic quantity, `version` conflicts, image
  upload pipeline with `file-type`/`sharp`/`heic-convert`); the edit sheet must call
  `useSheetDirty(isDirty)`, render `<SheetHeader title=… />`, use `useSheet()?.requestClose()` for cancel and
  `useCloseSheet(to?)` after saving; use `ProductImage elevated` for the detail hero.
- **shopping**: `modules/shopping/routes.ts`; completing never changes inventory quantities.
- **chat**: `modules/chat/routes.ts` + socket handlers via `app.realtime.onConnection`; idempotent sends
  (`clientId`), `seq` as string, read cursors, typing limiter.
- **e2e**: create `playwright.config.ts` + specs in `e2e/`; run `npx playwright install` (Playwright 1.64
  expects chromium-1248, only 1228 is installed); set `--safe-top: 54px; --safe-bottom: 34px` for visual
  tests; screen references are 1×; tolerate/mask icon stroke weight (Penpot renders small icons too heavy).

### 5.3 Design-related

- Dark variants are missing in the design for screens 03b, 07, 08b–18; dark new-item highlight, menu fill
  and shadows were derived (marked in `tokens.css` comments).
- Penpot reference outliers that are **not** bugs: pressed glass button / FAB pressed (shadow painted under
  the fill), image upload selected (Penpot stretches the photo; code uses `object-fit: cover`), emoji glyphs.

### 5.4 Tooling / performance

- `prettier --check .` fails on 19 files written before formatting was enforced: 18 files in `apps/web`
  (`index.html`, `vite.config.ts`, `src/api/{account,client,client.test}.ts`, `src/hooks/{useKeyboardInset,useRealtimeSync,useRealtimeSync.test}.ts`,
  `src/lib/swipe.test.ts`, `src/pages/{InventoryEditSheetPage,InventoryPage,LoginPage,MemberPage,SettingsPage}.tsx`,
  `src/routes/{guards.test.tsx,lazyPages.ts,ScreenLayer.tsx,useNavDirection.ts}`) and `eslint.config.js`.
  Recommended: one `npm run format` by the orchestrator before feature work branches off.
- Any runtime import from `@homi/shared` (e.g. formatters) loads the zod chunk (~26 kB gzip) because
  `enums.ts` uses `z.enum` and `index.ts` installs the zod error map. Fix later by splitting pure enum
  constants/formatters into a side-effect-free subpath export.
- In dev, a stopped backend surfaces as HTTP 500 from the Vite proxy (not as the offline banner);
  production behaviour (same origin) is correct.
- Windows cannot deliver a real SIGTERM to `node.exe`; graceful shutdown was only tested via an in-process
  signal.

---

## 6. Placeholder files the feature teams must replace

### Web pages (`apps/web/src/pages/`, each starts with `// PLACEHOLDER – replaced by …`)

| File                         | Team                              |
| ---------------------------- | --------------------------------- |
| `LoginPage.tsx`              | auth (minimal working form today) |
| `RegisterPage.tsx`           | auth (minimal working form today) |
| `ForgotPasswordPage.tsx`     | auth                              |
| `ResetPasswordPage.tsx`      | auth                              |
| `WelcomePage.tsx`            | households                        |
| `HouseholdPage.tsx`          | households                        |
| `MemberPage.tsx`             | households                        |
| `InvitationPage.tsx`         | households                        |
| `HomePage.tsx`               | home                              |
| `InventoryPage.tsx`          | inventory                         |
| `InventoryItemPage.tsx`      | inventory                         |
| `InventoryEditSheetPage.tsx` | inventory                         |
| `ShoppingPage.tsx`           | shopping                          |
| `ChatsPage.tsx`              | chat                              |
| `ConversationPage.tsx`       | chat                              |
| `ProfilePage.tsx`            | account (logout only today)       |
| `SettingsPage.tsx`           | account (appearance only today)   |
| `NotFoundPage.tsx`           | any team (low priority)           |

`DesignGalleryPage.tsx` is **not** a placeholder (design-system gallery, dev only).

### Server route plugins (`apps/server/src/modules/*/routes.ts`, body `// Implemented by the feature team.`)

| File                   | Team                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `auth/routes.ts`       | auth                                                            |
| `account/routes.ts`    | account                                                         |
| `households/routes.ts` | households (incl. public `/invitations/:token`)                 |
| `dashboard/routes.ts`  | home                                                            |
| `inventory/routes.ts`  | inventory (items + images)                                      |
| `shopping/routes.ts`   | shopping                                                        |
| `chat/routes.ts`       | chat (HTTP + socket handlers)                                   |
| `activity/routes.ts`   | none planned – stays empty unless an activity endpoint is added |

### Files to create (do not exist yet)

- `apps/web/src/api/households.ts`, `dashboard.ts`, `inventory.ts`, `shopping.ts`, `chat.ts`
- `apps/web/src/features/<feature>/…`
- `apps/server/test/integration/<feature>.test.ts` per module
- `playwright.config.ts`, `e2e/*.spec.ts`
- Release phase: `Dockerfile`, `docker-compose.yml`, `docker-compose.build.yml`, `.github/workflows/{ci,publish}.yml`

---

## 7. Open issues for the orchestrator (not for feature teams)

1. **Penpot "01 Home" drop shadow** is missing on the server (editor stopped saving). Re-add on page
   `02 · Screens & Prototype`: drop shadow x 0, y 24, blur 60, spread 0, `#000000` 18 %. The extracted
   references are unaffected (cropped to 393×852).
2. A stray Vite dev server from the design-system phase is still listening on `[::1]:5199` (PID 17236,
   `vite --port 5199 --strictPort`); it was left running because it was not started by the integration
   step. Stop it if nobody uses it.
3. Root `npm run test:e2e` fails until `playwright.config.ts` exists (see §5.2 e2e).
