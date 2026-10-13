# Homi – Feature Status

**Stand:** 2026-10-13 (after the five feature teams and the integration step)
**Contract:** [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) – §9.2 lists every feature-phase deviation
**Foundation:** [`docs/FOUNDATION_STATUS.md`](./FOUNDATION_STATUS.md) · **Visual spec:** [`design/FIDELITY.md`](../design/FIDELITY.md)

All product features are implemented end to end (API, realtime, screens, tests) and integrated: the
monorepo type-checks, lints, is Prettier-clean, all unit and integration tests pass, the production build
works, and the core user journey runs in Chromium and WebKit at 393×852 against the real dev stack.

---

## 1. Verification (integration run, 2026-10-13)

| Command (repo root)                                                           | Result                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run db:generate`                                                         | pass (Prisma Client 7.10.0)                                                                                |
| `npm run typecheck`                                                           | pass – shared, server, web (`tsconfig.json` + `tsconfig.node.json`)                                        |
| `npm run lint` (`eslint .`)                                                   | pass – 0 errors, 0 warnings                                                                                |
| `npx prettier --check .`                                                      | pass – all files formatted                                                                                 |
| `npm test`                                                                    | pass – shared **90/90**, server unit **89/89**, web **368/368** (51 files)                                 |
| `npm run test:integration` (all 15 files together, fresh `homi_test`)         | pass – **268/268** in 9 of 13 full runs; the other 4 lost a socket test file to a native worker crash (§4) |
| `npm run build`                                                               | pass – web: 70 precache entries (1132.6 KiB), `sw.js`; server: `dist/index.js` 305.5 KiB                   |
| Production smoke (`node apps/server/dist/index.js`, port 3101)                | `/api/health` 200, SPA + deep link 200 with CSP, `/%61pi/…` 404/403, NUL household name → 400 `VALIDATION` |
| Journey, Chromium + WebKit (`design/compare/screens/integration/journey.mjs`) | **32/32** checks                                                                                           |
| Cross-feature wiring, Chromium + WebKit (`…/integration/cross-feature.mjs`)   | **18/18** checks                                                                                           |
| Every team's visual script re-run on the integrated code                      | identical mismatch values to the teams' final passes (§3, `…/integration/visual-recheck.json`)             |

Integration tests per file (`homi_test`): account 13, activity 3, auth-core 9, auth 32, chat-realtime 12,
chat 21, cross-cutting 6, dashboard 8, health 3, households 26, images 11, inventory 23, invitations 19,
realtime 6, shopping 76.

Web tests per area: api 19, components 68, routes 20, hooks 7, lib 21, features/auth 34, account 11,
households 36, home 15, inventory 44, shopping 56, chat 37.

### Journey (dev stack: API :3000 on DB `homi`, Vite :5173, 393×852, safe areas 54/34 px)

Register → create household → add item with photo (upload, thumbnail served after the membership check) →
quantity +2 on the detail screen (one request for the burst) → "Zur Einkaufsliste hinzufügen" → tick it on
`/einkauf` → message in the household chat → logout (`/api/auth/me` 401, **socket closed**) → login → item
(quantity 3, photo), completed shopping item and chat message are still there → a second session of the same
user adds a shopping item and the open list updates **live** → create a second household (new socket room
joined, live update there) → switch back (old household's data, a change made meanwhile is fetched; the switch
is persisted). No console errors besides expected 401s, no 5xx.

### Cross-feature wiring (two members)

Home tile → item detail · inventory context menu "Zur Einkaufsliste" → visible on `/einkauf` · Home shopping row
body → `/einkauf` · member page "Nachricht senden" → direct chat (with a stale cached chat list; no
"Chat nicht gefunden") · chat "+" → shopping item on `/einkauf` + card delivered to the other member · household
rename → group-chat title in the open chat list updates live (needed the new `household → conversations`
invalidation; verified failing without it).

---

## 2. Integration changes (this step)

| Change                                                                                                                                                                                                                                                                                                                                                                                                       | Files                                                                                                                                                                                                                       | Regression tests                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CSRF/session bypass via `/%61pi/…` fixed at the root**: one `classifyApiTarget()` (raw path, decoded path, matched route) for both hooks; non-canonical API paths → 403 (CSRF) / 404 for every method. The auth/account per-route guard became redundant and was removed (identical behaviour, now for every module)                                                                                       | `apps/server/src/lib/api-path.ts` (new), `plugins/csrf.ts`, `plugins/auth.ts`, `modules/auth/{http,routes}.ts`, `modules/account/routes.ts`                                                                                 | `test/unit/csrf.test.ts` (+3), `test/integration/cross-cutting.test.ts`; auth/account tests unchanged and green; mutation-checked                                  |
| **NUL / control characters**: one helper module `@homi/shared` `text.ts` used by every free-text schema (display/household/item/shopping names, chat message, search); PostgreSQL 22021/22P05 → `400 VALIDATION` as safety net                                                                                                                                                                               | `packages/shared/src/{text,common,auth,households,inventory,shopping,chat}.ts`, `apps/server/src/plugins/errors.ts`                                                                                                         | `packages/shared/test/text.test.ts` (12), `test/unit/errors.test.ts` (+1), `cross-cutting.test.ts` (NUL in names, messages, search, list cursor); mutation-checked |
| **Session transitions race-free**: `hooks/useAuth.ts` no longer calls `queryClient.clear()`; cancels + awaits in-flight queries, removes everything but `['me']`, updates `['me']` in place; the auth feature's duplicate in `features/auth/session.ts` now re-exports it (welcome-screen logout fixed too)                                                                                                  | `apps/web/src/hooks/useAuth.ts`, `features/auth/session.ts`, `features/auth/ResetPasswordForm.tsx`                                                                                                                          | `hooks/useAuth.test.tsx` (3; all fail with `clear()`, the race test fails without the cancel)                                                                      |
| **Realtime room race** (households review, foundation file): connect-time join and `syncUserRooms` serialised per user                                                                                                                                                                                                                                                                                       | `apps/server/src/plugins/realtime.ts`                                                                                                                                                                                       | `test/integration/realtime.test.ts` (+1, delayed connect-time lookup; fails on the old code)                                                                       |
| **Realtime scope mapping**: `household` → + `conversations` (group-chat title), `members` → + `messages` (sender names)                                                                                                                                                                                                                                                                                      | `apps/web/src/hooks/useRealtimeSync.ts`                                                                                                                                                                                     | `useRealtimeSync.test.ts`; browser check `rename-updates-chat-title-live`                                                                                          |
| **Cross-feature reuse**: dashboard uses `inventory/dto.ts` + `shopping/dto.ts` (duplicate mappers removed); web API calls go through the owning client (`api/chat.ts` → `api/shopping.ts`, `api/households.ts` → `api/chat.ts`, `api/dashboard.ts` → `api/shopping.ts`, inventory "Zur Einkaufsliste" → `api/shopping.ts`); member screen puts the direct chat into the cached list (`rememberConversation`) | `apps/server/src/modules/dashboard/{dto,service}.ts`, `apps/web/src/api/{chat,households,dashboard}.ts`, `features/inventory/hooks.ts`, `features/chat/{cache.ts,NewChatSheet.tsx}`, `features/households/MemberScreen.tsx` | dashboard integration 8/8, web suite, cross-feature browser checks                                                                                                 |
| **`@homi/shared/core`** (zod-free, side-effect-free subpath; `sideEffects` in `package.json`); enum values/labels split from the zod schemas (`enum-values.ts`); socket constants moved to `constants.ts`; web formatters/labels/decimals/CSRF + socket constants import from it (local copies removed)                                                                                                      | `packages/shared/{package.json, src/core.ts, src/enum-values.ts, src/enums.ts, src/format.ts, src/constants.ts, src/realtime.ts, src/index.ts}`, `apps/web/src/lib/{format,socket}.ts`, `api/client.ts`, 8 feature files    | `packages/shared/test/core.test.ts` (core imports only core modules; barrel re-exports every core value)                                                           |
| `HOUSEHOLD_ROLE_LABELS` aligned with the UI ("Inhaber:in" / "Verwaltung" / "Mitglied"); `MEMBER_ROLE_LABELS` is the same object                                                                                                                                                                                                                                                                              | `packages/shared/src/{enum-values,households}.ts`                                                                                                                                                                           | `core.test.ts`                                                                                                                                                     |
| Request-log redaction also covers percent-encoded spellings of token paths (`/%61pi/invitations/<token>` is logged decoded + redacted)                                                                                                                                                                                                                                                                       | `apps/server/src/logger.ts`                                                                                                                                                                                                 | `test/unit/rate-limit-and-static.test.ts` (+1); invitations log tests 19/19                                                                                        |
| Cross-team test fixes: `guards.test.tsx` expected the placeholder heading "Home" (now "Dein Zuhause.")                                                                                                                                                                                                                                                                                                       | `apps/web/src/routes/guards.test.tsx`                                                                                                                                                                                       | 3 consecutive full web runs green (InvitationScreen tests stable: 10/10 each run)                                                                                  |
| Docs: ARCHITECTURE §1, §4.3, §4.4, §4.6, §5, §7 updated; §9.2 lists all team/integration deviations                                                                                                                                                                                                                                                                                                          | `docs/ARCHITECTURE.md`                                                                                                                                                                                                      | –                                                                                                                                                                  |

Bundle (production build): the entry chunk and its vendor chunks stay zod-free – initial JS 577.9 KiB raw /
**183.7 KiB gzip** (index chunk 20.0 KiB gzip; +0.4 KiB because the shared constants now live there instead of
being duplicated). The shared contract chunk shrank from 26.3 KiB (9.7 KiB gzip) to 4.5 KiB; the zod-free core
(formatters, labels, decimals) is a separate 4.3 KiB chunk, schemas moved into the feature chunks that use them.
zod (25.4 KiB gzip) still loads lazily with the first page that validates a form (login, Home's create-household
sheet); `NotFound`, `Settings` and `Chats` pages need no zod. All pages stay lazy.

---

## 3. Features

Design diffs: mismatch in % at 393×852 @1×, status bar (0–54) and home indicator (818–852) masked,
Chromium / WebKit. All values were re-measured by the integration step with the teams' own scripts against the
integrated code and are identical to the teams' final passes.

### Auth & account (team auth)

- **Works:** register, login (generic errors, per-IP + per-e-mail limits, timing-equalised), logout (sockets
  closed), `/auth/me`, password reset by mail (HMAC-stored single-use token, 60 min, sessions revoked), profile
  name change (live to all households), password change (other sessions revoked), active household. Login racing a
  reset/password change cannot keep a session. Screens: Login, Register (live policy checklist), Passwort
  vergessen, Passwort zurücksetzen, Profil (+ name / password sheets), Einstellungen (theme, reduce transparency,
  version), 404.
- **Tests:** integration auth 32 + account 13 (+ auth-core 9); web features/auth 34, account 11.
- **Design:** no references for the auth screens (built from the design system). Profil vs 09: 3.81 / 3.67;
  Einstellungen vs 09: 5.59 / 5.22 (different content, same layout); back button 0.00 / 0.00; rows 0.51–1.37 /
  0.12–0.14; sheet frame vs 06 0.17 / 0.16; sheet button strip 0.00–0.03.
- **Open:** WebKit on Windows renders Inter bold lighter (test browser only).

### Households & Home (team households)

- **Works:** households CRUD (create transaction, rename, delete with deadlock-safe retry and image cleanup),
  members (role change with last-owner rule, leave/remove incl. chat membership), invitations (HMAC token,
  preview without names for invalid links, single-use accept, 410 reasons), dashboard (exact decimal sums, weekly
  delta, previews). Screens: Home (01), Haushalt (09), Mitglied, Willkommen (create or paste link), Einladung,
  switcher / create / invite / manage sheets. Home tiles → detail, shopping row → list, tick with "Rückgängig".
- **Tests:** integration households 26, invitations 19, dashboard 8; web households 36, home 15.
- **Design:** 01-home 1.80 / 1.20 · 01-home dark 1.75 / 1.17 · 09-haushalt-profil 1.22 / 0.33; 40/40 browser checks.
- **Open:** no cap on households/invitations per user; Home's create-household sheet pulls zod into the Home chunk.

### Inventory (team inventory)

- **Works:** list (search, category chips, sort, cursor paging, 128 items), detail, create/edit sheet (draft
  survives reload, discard prompt, 409 banner), quantity stepper (one request per burst, atomic, live), delete,
  long-press / right-click context menu, "Zur Einkaufsliste", image pipeline (content sniffing, EXIF rotate,
  strip, 240 px thumb + 1600 px full WebP, HEIC → JPEG, membership-checked serving, orphan cleanup).
- **Tests:** integration inventory 23, images 11; web inventory 44.
- **Design:** 02 1.40 / 1.32 · 02 dark 1.62 / 1.32 · 17 0.62 / 0.64 · 16 1.32 / 1.39 · 05 0.51 / 0.61 ·
  05 dark 0.71 / 0.77 · 06 leer 0.68 / 0.33 · 13 0.67 / 0.45 · 10 0.36 / 0.47 · 14 1.46 / 1.67 (team value; not
  re-run because it mutates the seed) · 06 ausgefüllt 9.70 / 9.55, 06 dark 9.74 / 9.63, 07 9.75 / 9.63,
  15 8.42 / 8.21 – almost entirely the photo, which the design stretches and the code crops (0.46–2.25 masked).
- **Open:** long-press fix needs a real iPhone check; HEIC conversion runs on the main thread; no real HEIC sample
  (no HEVC encoder available).

### Shopping list (team shopping)

- **Works:** list with progress, add composer (quantity/price pills), optimistic add/tick/delete with rollback,
  per-item ordering and household-wide create order, swipe left/right, edit sheet, "Erledigte löschen" for the
  confirmed ids only, 24-hour completed rule, keyboard/VoiceOver focus kept after ticking, realtime between
  members, household-scoped client ids (UUIDv5).
- **Tests:** integration shopping 76; web shopping 56.
- **Design:** 03 0.45 / 0.46 · 03 dark 0.58 / 0.40 · 11 0.29 / 0.42 · 18 0.65 / 0.58 · 03b 5.23 / 4.63 full screen
  (designed as a separate pushed screen) – 0.55 / 0.17 for the aligned list crop.
- **Open:** on 320 px phones a long detail with any name is truncated.

### Chat (team chat)

- **Works:** chat list (unread badge, last message), conversation (grouping, day separators, unread divider,
  read receipts, typing, older pages without jump, "Neue Nachrichten" pill, keyboard-aware pinning), optimistic
  send with outbox (resent once after reconnect, stored exactly once), direct chats (member page and "Neuer Chat"),
  "+" → shopping item card, dictation. Socket handlers share the HTTP limits; removed members get nothing.
- **Tests:** integration chat 21, chat-realtime 12; web chat 37.
- **Design:** 04 0.40 / 0.41 · 04 dark 0.62 / 0.39 · 08 1.55 / 1.02 · 08 dark 1.65 / 0.99 · 08d 0.29 / 0.22 ·
  12 0.74 / 0.88 · 08b 15.13 / 15.17 and 08c 19.14 / 19.01 because the design shows an arbitrary ~40 px scroll
  offset (scroll-aligned 1.71 / 1.33 and 3.76 / 3.40).
- **Open:** after a reconnect the global refetch makes the `?after=` catch-up an extra request; conversations
  without messages are hidden by design decision (§9.2 #35).

---

## 4. Open issues (cross-cutting)

1. **Intermittent native crash of a vitest worker on Windows** (`exit code 3221226505` = `0xC0000409`, a
   silent fast-fail abort – nothing on stderr even with `RUST_BACKTRACE=1` / `--report-on-fatalerror`) during
   the _full_ integration suite: 4 of 13 full runs lost one or two files, always one that starts a real HTTP
   listener + socket.io-client (`realtime.test.ts` 2×, `chat-realtime.test.ts` 2×, `auth.test.ts` 1×), in the
   middle of the file; the chat team saw it once too. The other 9 runs were green (268/268 for the final code),
   the socket files passed 12/12 times in a loop on their own, and standalone stress runs (argon2 under load,
   25 listen → 12 sockets → close cycles × 8 processes) never crashed. It looks like a native abort on Windows
   (Node 24.15 / libuv 1.51 or a native addon under vitest's fork IPC), not a test failure. Re-run when it
   happens; check whether Linux CI is affected before deeper work.
2. **E2E**: `e2e/` is still empty and there is no `playwright.config.ts`, but `.github/workflows/ci.yml` runs
   `npm run test:e2e` → that CI job fails. The integration journeys in `design/compare/screens/integration/`
   (`journey.mjs`, `cross-feature.mjs`, gitignored) are a ready basis for real specs.
3. The Vite dev server exited once (code 127) during HMR of several quick file edits; not reproduced.
4. Team-level items still open are listed per feature in §3 (iPhone long-press check, HEIC on main thread, limits
   on household/invitation creation, 320 px truncation, chat catch-up request).
5. Dev databases: `homi` now contains the integration journey users (`journey-*`, `julian-*`, `lisa-*`, `smoke-*`
   `@homi.test`); `homi_dev_inventory` was restored to 128 items after the visual re-run, `homi_dev_shopping` was
   seeded for the re-run and cleaned up again.
6. The Obsidian vault documentation required by the user's CLAUDE.md was not written (the workflow forbids it).
