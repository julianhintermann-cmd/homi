# Homi – Architecture & Implementation Contract

This document is the **binding contract** for everyone (human or agent) implementing Homi.
It defines the repository layout, the database schema, the HTTP/WebSocket API, the
security model, and the frontend structure. Visual specifications live in
`design/FIDELITY.md` (extracted from the Freegma/Penpot file "Homi UI/UX MockUp").

> Language of the UI: **German (Switzerland)**. Currency: **CHF**. Code, comments,
> identifiers and docs: English.

---

## 1. Repository layout

```
homi/
├─ apps/
│  ├─ server/                 Fastify 5 + Socket.IO + Prisma 7 (PostgreSQL)
│  │  ├─ prisma/schema.prisma
│  │  ├─ prisma/migrations/   versioned SQL migrations (prisma migrate)
│  │  ├─ prisma.config.ts     Prisma 7 config (datasource URL lives here)
│  │  ├─ scripts/build.mjs    esbuild bundle → dist/index.js
│  │  ├─ vitest.config.ts     two projects: `unit` (npm test) and `integration` (npm run test:integration)
│  │  ├─ src/
│  │  │  ├─ index.ts          process entry (listen, graceful shutdown)
│  │  │  ├─ app.ts            buildApp(options) → Fastify instance (no listen) – used by tests
│  │  │  ├─ config.ts         zod-validated env config
│  │  │  ├─ db.ts             Prisma client factory (adapter-pg)
│  │  │  ├─ logger.ts         pino options (redaction, token-free URLs)
│  │  │  ├─ types/fastify.ts  Fastify decorations (app.prisma, app.realtime, req.user, …)
│  │  │  ├─ generated/prisma  (gitignored) Prisma client output – run `npm run db:generate` after a fresh clone
│  │  │  ├─ plugins/          auth (sessions, requireUser/requireMember), csrf, security, errors, static (SPA), realtime, health
│  │  │  ├─ lib/              money, tokens, passwords, sessions, mailer, storage, rate-limit, http-errors
│  │  │  └─ modules/          one Fastify plugin per feature (`routes.ts`), registered under `/api`
│  │  │     ├─ auth/          register/login/logout/me/password reset
│  │  │     ├─ account/       profile + password change
│  │  │     ├─ households/    households, members, roles, invitations, active household
│  │  │     ├─ dashboard/     Home aggregates
│  │  │     ├─ inventory/     items + quantity + images (upload/serve)
│  │  │     ├─ shopping/      shopping list + items
│  │  │     ├─ chat/          conversations, messages, read state, socket handlers
│  │  │     └─ activity/      service.ts: activity recording + dashboard queries (used by other modules)
│  │  └─ test/                vitest: unit/, integration/ (real PostgreSQL), helpers/ (buildTestApp, TestClient, fixtures)
│  └─ web/                    React 19 + Vite 8 + TS, PWA
│     ├─ public/              PWA icons, favicons, theme-boot.js (CSP-safe pre-paint theme script)
│     ├─ scripts/             generate-app-icon.ts, visual-compare.ts (component pixel diff)
│     └─ src/
│        ├─ main.tsx, App.tsx (route tree)
│        ├─ app/              AppRuntime (socket/realtime/connectivity wiring)
│        ├─ routes/           guards, paths, navigation (sheets, back), lazyPages, TabShell, StackLayout, SheetLayer
│        ├─ pwa/              update prompt (virtual:pwa-register)
│        ├─ styles/           tokens.css (design tokens), global.css, shell.css, glass.css, components.css
│        ├─ components/       design-system components (see §8), barrel `index.ts`
│        ├─ icons/            icon path data extracted from the design (paths.ts) + <Icon/>
│        ├─ api/              typed API client (client.ts), queryKeys.ts + one file per feature
│        ├─ features/         feature modules (auth, households, home, inventory, shopping, chat, account) – created by feature teams
│        ├─ hooks/            useAuth, useSocket, useActiveHousehold, useRealtimeSync, useOnlineStatus, useKeyboardInset, ...
│        ├─ lib/              format (re-exports @homi/shared), queryClient, socket, connectivity, theme, haptics, swipe
│        ├─ pages/            route components (thin; compose features)
│        └─ test/             vitest setup + stubs
├─ packages/shared/           zod schemas + TS types shared by server and web (API contract), formatters, LIMITS, API_ERRORS
├─ e2e/                       Playwright: two-user flow, tenant isolation, WebKit/iPhone, visual (not yet created: playwright.config.ts + specs)
├─ design/                    FIDELITY.md, extracted/ (tokens.json, screens/, components/, prototype.json, foundations.json),
│                             reference/ (light|dark|components PNGs + manifest.json), icons/*.svg, assets/products/*.png,
│                             compare/ (gitignored output of scripts/visual-compare.ts)
├─ docker-compose.dev.yml     local PostgreSQL 18 (dev db `homi` + test db `homi_test`), .env.example
├─ Dockerfile, docker-compose.yml (GHCR image), docker-compose.build.yml (build from source)   – release phase, not yet created
└─ .github/workflows/         ci.yml, publish.yml                                                – release phase, not yet created
```

Package manager: **npm workspaces** (`packages/shared`, `apps/server`, `apps/web`).
All dependencies are already installed at the root. **Do not run `npm install` for new
packages** unless the orchestrator explicitly allows it (parallel installs corrupt the lockfile).

`@homi/shared` exports TypeScript source (`"exports": {".": "./src/index.ts"}`); Vite,
tsx, vitest and the esbuild server bundle all consume it directly. Importing it installs a
de-CH zod error map and disables zod's JIT (`script-src 'self'` CSP), so any runtime import
from `@homi/shared` pulls zod into that chunk.

Money/quantity formatting (`formatCHF` → `CHF 2’485.50`, `formatQuantity`, dates) lives in
`@homi/shared/src/format.ts` (hand-written, no `Intl` – Node/ICU output differs from the design).
The web app imports it via `@/lib/format`; never format money with `Intl.NumberFormat`.

TypeScript: `~6.0` (strict). Node: 24 (Docker), engines `>=22.22`.

---

## 2. Runtime topology

One production process (one Docker image) serves:

- `GET /api/**` – REST JSON API
- `/socket.io/` – Socket.IO (same origin, cookie-authenticated)
- everything else – the built SPA from `apps/web/dist` (with SPA fallback to `index.html`,
  long-term caching for hashed assets, `no-cache` for `index.html`, `sw.js`, `manifest.webmanifest`).

PostgreSQL is a separate container. Uploaded images live in a persistent volume
(`UPLOAD_DIR`, default `/data/uploads`) behind a `Storage` interface (local FS now,
S3-compatible later).

### Environment variables (validated in `apps/server/src/config.ts` with zod)

| Variable                                                                       | Default                                      | Notes                                                                                                                                        |
| ------------------------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                     | `development`                                | `production` enables secure cookies, static serving; `test` is accepted too                                                                  |
| `PORT`                                                                         | `3000`                                       |                                                                                                                                              |
| `HOST`                                                                         | `0.0.0.0`                                    |                                                                                                                                              |
| `APP_URL`                                                                      | `http://localhost:5173` (dev)                | public origin, used for CSRF origin check + invitation links; **required in production**                                                     |
| `DATABASE_URL`                                                                 | – required                                   | `postgresql://homi:homi@localhost:5432/homi`                                                                                                 |
| `DATABASE_URL_TEST`                                                            | –                                            | integration tests only (`homi_test`); tests refuse a DB name without "test" (truncated between files)                                        |
| `SESSION_SECRET`                                                               | – required in production (≥ 32 chars)        | HMAC key for token hashing; dev falls back to an insecure built-in secret (warning logged), if set in dev ≥ 16 chars                         |
| `SESSION_TTL_DAYS`                                                             | `30`                                         | sliding expiry                                                                                                                               |
| `UPLOAD_DIR`                                                                   | `./uploads` (dev) / `/data/uploads` (Docker) | resolved against the server's working directory                                                                                              |
| `MAX_UPLOAD_MB`                                                                | `15`                                         |                                                                                                                                              |
| `TRUST_PROXY`                                                                  | `false`                                      | `true` behind a reverse proxy, or a hop count (e.g. `1`)                                                                                     |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | unset                                        | password-reset mail only works when set; `SMTP_FROM` is required when `SMTP_HOST` is set; port defaults to 587 (465 when `SMTP_SECURE=true`) |
| `LOG_LEVEL`                                                                    | `info`                                       |                                                                                                                                              |
| `WEB_DIST_DIR`                                                                 | `../web/dist` resolved                       | where the SPA build is served from                                                                                                           |
| `HOMI_API_TARGET`                                                              | `http://localhost:3000`                      | **web dev/preview only**: target of the Vite `/api` + `/socket.io` proxy                                                                     |

Local development reads the repository-root `.env` (`cp .env.example .env`): `npm run dev -w @homi/server`
uses `tsx --env-file-if-exists=../../.env`, `prisma.config.ts` loads it with dotenv, and the integration
global setup (`apps/server/test/integration/global-setup.ts`) reads `DATABASE_URL_TEST` from it and applies
the migrations to that database.

---

## 3. Database schema (Prisma 7, PostgreSQL)

The authoritative file is `apps/server/prisma/schema.prisma`. Key decisions:

- UUID primary keys (`@db.Uuid`), `createdAt`/`updatedAt` everywhere relevant.
- Money: `Decimal(10,2)`; quantities: `Decimal(12,3)`. **Never** use JS floats for money –
  compute with Prisma `Decimal` (decimal.js) on the server and transfer as **strings** (`"8.50"`).
- Unknown price = `NULL` (never shown as CHF 0.00).
- Every household-owned row carries `householdId` (indexed) so authorization filters are trivial.
- Messages use a global `seq BIGSERIAL` for ordering, cursor pagination and read cursors.
- Read state is stored on `ConversationMember.lastReadSeq` (replaces a separate MessageReadState table).
- Idempotent message sends: unique `(conversationId, senderId, clientId)`.
- Optimistic concurrency for full item edits: `InventoryItem.version`.
- Activity rows (`HouseholdActivity`) store `valueDelta` (CHF, `Decimal(12,2)`) so the Home "+ CHF 42.80"
  weekly trend is real data. Write them only through `recordActivity()` (`modules/activity/service.ts`).
- Input limits (`LIMITS` in `@homi/shared`): unit price ≤ 99’999.99, quantity ≤ 99’999.999 (scale 3), so
  quantity × unit price always fits `Decimal(12,2)`. Request schemas accept `"8,50"` / `"1’250"` and
  normalise to `"8.50"`. Decimal arithmetic in shared code uses scaled `BigInt` (half-up), never floats.
- Migrations: `apps/server/prisma/migrations/20261012191721_init` (initial). New migrations via
  `npm run db:migrate` (dev) and `npm run db:deploy` (CI/prod).

Enums (shared with the frontend via `@homi/shared`):

- `HouseholdRole`: `OWNER | ADMIN | MEMBER`
- `ItemCategory`: `KUECHE | BAD | WOHNZIMMER | TECHNIK | SONSTIGES` → labels Küche, Bad, Wohnzimmer, Technik, Sonstiges
- `Unit`: `STUECK | PACKUNG | FLASCHE | KILOGRAMM | GRAMM | LITER | MILLILITER | ROLLE | BECHER | TUBE | DOSE`
  → singular/plural labels: Stück/Stück, Packung/Packungen, Flasche/Flaschen, kg, g, Liter/Liter, ml, Rolle/Rollen, Becher/Becher, Tube/Tuben, Dose/Dosen.
  Short unit-price suffixes: Stk., Pkg., Fl., kg, g, l, ml, Rolle, Becher, Tube, Dose (e.g. `CHF 8.50 / Fl.`).
- `ConversationType`: `HOUSEHOLD | DIRECT`
- `MessageKind`: `TEXT | SHOPPING_ITEM` (the "Zur Einkaufsliste hinzugefügt" card in the design)
- `ActivityType`: `HOUSEHOLD_CREATED, MEMBER_JOINED, MEMBER_LEFT, MEMBER_REMOVED, ITEM_CREATED, ITEM_UPDATED, ITEM_DELETED, ITEM_QUANTITY_CHANGED, SHOPPING_ITEM_ADDED, SHOPPING_ITEM_COMPLETED, SHOPPING_ITEM_REOPENED, SHOPPING_ITEM_DELETED`

Household creation (single transaction) creates: `Household`, `HouseholdMember(OWNER)`,
a default `ShoppingList` ("Einkaufsliste"), a `Conversation(HOUSEHOLD)` with the owner as
member, and a `HOUSEHOLD_CREATED` activity. Joining adds the user to the household
conversation; leaving/removal removes them from all conversations of that household.

---

## 4. Security model

### 4.1 Sessions

- Login/registration creates a random 32-byte token (base64url). The **cookie** `homi_session`
  holds the raw token; the DB stores `tokenHash = HMAC-SHA256(SESSION_SECRET, token)` (hex).
- Cookie flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, `Max-Age` = TTL.
- Sliding expiry: `lastSeenAt`/`expiresAt` refreshed at most every 15 min.
- Password change revokes all other sessions; logout deletes the current session.
- No tokens in `localStorage`. Ever.

### 4.2 Passwords

- Argon2id via `@node-rs/argon2` (memoryCost 19456 KiB, timeCost 2, parallelism 1 – OWASP baseline).
- Policy: 10–128 chars, not equal to email, at least one letter and one digit or symbol.
- Login errors are generic ("E-Mail oder Passwort ist falsch."). Constant-time-ish: hash a dummy on unknown email.
- Rate limits: login 10/min per IP + 5/min per email; register 5/min per IP; reset request 3/15 min per IP.
  Presets live in `apps/server/src/lib/rate-limit.ts`: `@fastify/rate-limit` runs with `global: false` and a
  route opts in with `config: { rateLimit: RATE_LIMITS.login }` (also `register`, `passwordResetRequest`,
  `passwordResetConfirm` 10/15 min, `invitation` 30/min, `upload` 30/min). Non-IP keys (per email, per user)
  use `app.createKeyedRateLimiter(KEYED_RATE_LIMITS.…)`. Exceeded → `429 RATE_LIMITED`.

### 4.3 CSRF

- `SameSite=Lax` cookies **plus** for every non-GET/HEAD/OPTIONS request under `/api`:
  header `X-Homi-Request: 1` is required **and**, if an `Origin` header is present, it must equal
  the `APP_URL` origin (or the request host in dev). Missing → `403 CSRF`. Requests with
  `Sec-Fetch-Site: cross-site` are rejected as well.
- No CORS is enabled (same-origin app); the custom header therefore cannot be sent cross-site.
- Socket.IO: handshake must carry the session cookie; `allowRequest` checks the Origin.

### 4.4 Authorization (tenant isolation)

- Household-scoped routes are **URL-scoped**: `/api/households/:householdId/...`.
- A `requireMember(req, householdId, minRole?)` helper (`plugins/auth.ts`) loads `HouseholdMember` for
  `(householdId, session.userId)`; missing or malformed id → **404** (do not reveal existence), role below
  `minRole` → **403**, not logged in → **401**. `requireUser(req)` covers non-household routes.
- Every query additionally filters by `householdId` (e.g. `where: { id, householdId }`), so a
  valid item id from another household is never returned/modified.
- Images are served only through `/api/households/:hid/images/:imageId` after membership
  check; storage keys are never derived from user input (`<householdId>/<imageId>-<variant>.webp`).
- Socket rooms: on connect the server joins `user:<userId>` and `household:<id>` for each
  membership. Membership changes call `realtime.syncUserRooms(userId)`.
  Chat events go to `user:<memberId>` rooms of conversation members only.
- Role rules:
  - MEMBER: read/write inventory, shopping, chat; leave household.
  - ADMIN: + rename household, create/revoke invitations (role ≤ ADMIN), remove MEMBERs.
  - OWNER: + change roles, remove ADMINs, delete household. The **last OWNER** can neither
    leave, be removed, nor be demoted (→ 409 `LAST_OWNER`).

### 4.5 Uploads

- `@fastify/multipart`, single file, limit `MAX_UPLOAD_MB`. Detect type from **content**
  (`file-type`): JPEG, PNG, WebP, GIF (first frame), HEIC/HEIF (converted with `heic-convert`).
- Decode with `sharp`, `.rotate()` (EXIF orientation), strip metadata, reject > 40 MP,
  produce `thumb` (240 px square cover) and `full` (max 1600 px, inside) WebP variants.
- Serve with `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`.

### 4.6 Headers & logging

- `@fastify/helmet` with CSP: `default-src 'self'; img-src 'self' data: blob:; connect-src 'self' ws: wss:;
style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; worker-src 'self' blob:;
manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
- pino logger with redaction of `req.headers.cookie`, `authorization`, `password*`, `token*`.
- Errors: `{ "error": { "code": "SNAKE_CASE", "message": "Deutsche Benutzermeldung", "details"?: ... } }`.
  Never leak stack traces or Prisma messages to clients. The code catalogue (status + default German
  message) is `API_ERRORS` in `@homi/shared/src/errors.ts`; throw `new AppError(code, message?, { details })`
  (`lib/http-errors.ts`). Generic mapping in `plugins/errors.ts`: zod failures → `400 VALIDATION` with
  field details; Prisma unique/FK/write conflicts (P2002/P2003/P2034) → `409 CONFLICT`; P2025 → `404`;
  unreachable database / client init failures → `503 SERVICE_UNAVAILABLE`; anything else → `500 INTERNAL`.
  Feature code should still map expected cases explicitly (e.g. `EMAIL_TAKEN`, `VERSION_CONFLICT`).
- Tokens in logged URLs (`/api/invitations/<token>`, `/einladung/<token>`, reset links) are replaced by `[redacted]`.

---

## 5. HTTP API

All bodies JSON (except uploads). All responses `application/json`. Zod schemas for every
request/response shape live in `packages/shared/src/` and are imported by both sides.
Dates are ISO strings. Money/quantity are decimal strings.

Server implementation: each `apps/server/src/modules/<feature>/routes.ts` is a Fastify plugin that
`app.ts` registers under the `/api` prefix, so routes are declared **without** `/api`
(`app.get('/households/:householdId/items', …)`). The tables abbreviate path params (`:hid`, `:id`,
`:cid`); the code uses descriptive names (e.g. `:householdId`, `:itemId`, `:conversationId`,
`:shoppingItemId`, `:imageId`) – the URLs are identical.
`@fastify/multipart` is registered once globally (one file, `MAX_UPLOAD_MB`); blobs go through `app.storage`.

### Auth & account

| Method | Path                               | Body → Response                                                                                                      |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`                      | `{ status: "ok", db: "ok" }` (503 `{ status: "error", db: "down" }` if DB down) – implemented in `plugins/health.ts` |
| GET    | `/api/auth/config`                 | `{ passwordResetEnabled: boolean }`                                                                                  |
| POST   | `/api/auth/register`               | `{displayName,email,password}` → `201 MeResponse` + cookie                                                           |
| POST   | `/api/auth/login`                  | `{email,password}` → `MeResponse` + cookie                                                                           |
| POST   | `/api/auth/logout`                 | → `204` (clears cookie)                                                                                              |
| GET    | `/api/auth/me`                     | → `MeResponse` or `401`                                                                                              |
| POST   | `/api/auth/password-reset/request` | `{email}` → `202` always                                                                                             |
| POST   | `/api/auth/password-reset/confirm` | `{token,password}` → `204` (revokes sessions)                                                                        |
| PATCH  | `/api/account`                     | `{displayName}` → `MeResponse`                                                                                       |
| POST   | `/api/account/password`            | `{currentPassword,newPassword}` → `204`                                                                              |
| PUT    | `/api/account/active-household`    | `{householdId}` → `204` (persists `User.lastHouseholdId`, membership-checked)                                        |

`MeResponse = { user: {id, displayName, email, createdAt}, households: [{id, name, role, memberCount}], activeHouseholdId: string|null }`

### Households, members, invitations

| Method | Path                                   | Notes                                                                                                                                               |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/households`                      | memberships of current user                                                                                                                         |
| POST   | `/api/households`                      | `{name}` → household (creator = OWNER)                                                                                                              |
| GET    | `/api/households/:hid`                 | `{id,name,createdAt, myRole, members:[{userId,displayName,role,joinedAt}], stats:{itemCount}}`                                                      |
| PATCH  | `/api/households/:hid`                 | `{name}` (ADMIN+)                                                                                                                                   |
| DELETE | `/api/households/:hid`                 | OWNER only                                                                                                                                          |
| PATCH  | `/api/households/:hid/members/:userId` | `{role}` (OWNER only, last-owner rule)                                                                                                              |
| DELETE | `/api/households/:hid/members/:userId` | remove (ADMIN+ per rules) or leave (self)                                                                                                           |
| GET    | `/api/households/:hid/invitations`     | active invitations (ADMIN+)                                                                                                                         |
| POST   | `/api/households/:hid/invitations`     | `{role?: "MEMBER"\|"ADMIN", expiresInDays?: 1..30 (default 7)}` → `{id, url, expiresAt, role}` – **url contains the raw token, returned only once** |
| DELETE | `/api/households/:hid/invitations/:id` | revoke                                                                                                                                              |
| GET    | `/api/invitations/:token`              | public preview `{householdName, inviterName, role, expiresAt, status: "valid"\|"expired"\|"revoked"\|"used"}` (no member data)                      |
| POST   | `/api/invitations/:token/accept`       | auth required → `{householdId}`; single-use, transactional                                                                                          |

Invitation tokens: 32 random bytes base64url; DB stores HMAC hash. URL: `${APP_URL}/einladung/<token>`.

### Dashboard

`GET /api/households/:hid/dashboard` →

```
{ itemCount: number,                 // number of inventory records (not summed quantities)
  inventoryValue: string,            // Σ quantity × unitPrice for priced items, 2 decimals
  unpricedItemCount: number,
  weeklyValueDelta: string,          // Σ activity.valueDelta over last 7 days
  openShoppingCount: number,
  recentItems: InventoryItemDto[3],  // most recently created/updated
  openShoppingItems: ShoppingItemDto[3],
  members: [{userId, displayName}],
  recentActivity: ActivityDto[5] }
```

### Inventory

| Method | Path                                                                                   | Notes                                                                              |
| ------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/api/households/:hid/items?search=&category=&sort=name\|recent\|value&cursor=&limit=` | `{items, nextCursor, total}`; search = case-insensitive `contains` on name         |
| POST   | `/api/households/:hid/items`                                                           | `{name, category, quantity, unit, unitPrice: string\|null, imageId: string\|null}` |
| GET    | `/api/households/:hid/items/:id`                                                       | `InventoryItemDto`                                                                 |
| PATCH  | `/api/households/:hid/items/:id`                                                       | partial update + `version` → `409 VERSION_CONFLICT` if stale                       |
| POST   | `/api/households/:hid/items/:id/quantity`                                              | `{delta: string}` atomic `GREATEST(quantity+delta,0)` → item                       |
| DELETE | `/api/households/:hid/items/:id`                                                       | 204                                                                                |
| POST   | `/api/households/:hid/images`                                                          | multipart `file` → `{id, width, height}`                                           |
| GET    | `/api/households/:hid/images/:imageId?variant=thumb\|full`                             | image/webp                                                                         |
| DELETE | `/api/households/:hid/images/:imageId`                                                 | only if unreferenced or owned by an item being edited                              |

`InventoryItemDto = {id, name, category, quantity, unit, unitPrice|null, totalValue|null, image: {id, thumbUrl, fullUrl}|null, createdBy: {id, displayName}|null, createdAt, updatedAt, version}`

### Shopping

| Method | Path                                            | Notes                                                                                         |
| ------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/api/households/:hid/shopping`                 | `{list:{id,name}, open: ShoppingItemDto[], completed: ShoppingItemDto[], stats:{done,total}}` |
| POST   | `/api/households/:hid/shopping/items`           | `{name, quantity?, unit?, unitPrice?, sourceItemId?}`                                         |
| PATCH  | `/api/households/:hid/shopping/items/:id`       | `{name?, quantity?, unit?, unitPrice?, completed?}`                                           |
| DELETE | `/api/households/:hid/shopping/items/:id`       |                                                                                               |
| POST   | `/api/households/:hid/shopping/clear-completed` | deletes completed items                                                                       |

Completing a shopping item never changes inventory quantities.

### Chat

| Method | Path                                                                     | Notes                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/households/:hid/conversations`                                     | `[{id,type,title,members:[{userId,displayName}], lastMessage\|null, unreadCount, updatedAt}]` (HOUSEHOLD title = household name; DIRECT title = other member) |
| POST   | `/api/households/:hid/conversations/direct`                              | `{userId}` → get-or-create (unique `directKey`)                                                                                                               |
| GET    | `/api/households/:hid/conversations/:cid/messages?before=<seq>&limit=50` | `{messages (asc), hasMore, members:[{userId,lastReadSeq}]}`                                                                                                   |
| POST   | `/api/households/:hid/conversations/:cid/messages`                       | `{clientId, content, kind?, meta?}` → message (idempotent)                                                                                                    |
| POST   | `/api/households/:hid/conversations/:cid/read`                           | `{seq}` (monotonic)                                                                                                                                           |

`MessageDto = {id, seq (string), conversationId, sender:{id,displayName}|null, kind, content, meta|null, createdAt, clientId}`

---

## 6. Realtime (Socket.IO)

- Path `/socket.io`, same origin, cookie auth in `io.use()`. Unauthenticated → `connect_error("UNAUTHORIZED")`.
- Rooms: `user:<uid>`, `household:<hid>` (all memberships).
- **Server → client**
  - `sync` `{householdId, scope: "inventory"|"shopping"|"dashboard"|"household"|"members"|"conversations", action: "created"|"updated"|"deleted"|"bulk", entityId?: string, actorId: string}` – broadcast to `household:<hid>` **after** the DB commit. The client invalidates matching TanStack Query keys (authoritative refetch). `inventory`/`shopping` mutations also emit `scope:"dashboard"`.
  - `chat:message` `{householdId, conversationId, message: MessageDto}` → each member's `user:` room
  - `chat:read` `{conversationId, userId, seq}`
  - `chat:typing` `{conversationId, userId, displayName, typing}`
  - `membership` `{householdId, action: "added"|"removed"}` → `user:<uid>` (client refetches `/auth/me`)
- **Client → server** (all validated with zod + membership checks; ack callbacks `{ok:true, ...}|{ok:false, error}`)
  - `chat:send` `{conversationId, clientId, content, kind?, meta?}` → ack `{ok, message}`
  - `chat:read` `{conversationId, seq}`
  - `chat:typing` `{conversationId, typing}` (rate-limited)
- Reconnect: client re-fetches (invalidates) all active-household queries and the open conversation.
- Rate limit chat sends: 20 msgs / 10 s per user; typing indicators at most 1 / s per user.
- Event payload types: `ServerToClientEvents` / `ClientToServerEvents` in `@homi/shared/src/realtime.ts`
  (typed on both the Socket.IO server and `socket.io-client`).
- Server API (`plugins/realtime.ts`, decorated as `app.realtime`): `emitSync(event)`,
  `emitToHousehold(hid, event, …)`, `emitToUsers(userIds, event, …)`, `syncUserRooms(userId)`,
  `disconnectUser(userId, {sessionId?|exceptSessionId?})`, and `onConnection(handler)` – feature modules
  (chat) attach their socket handlers through it instead of touching `io` directly. Emit only after the
  DB transaction has committed. On shutdown Socket.IO closes before the HTTP server.

---

## 7. Frontend architecture

- React 19, React Router 8 (data router), TanStack Query 5, Motion 14 (`motion/react`), Zustand 5 for UI state,
  socket.io-client, Tailwind 4 only for utilities; **appearance comes from `styles/tokens.css` + component CSS**.
- Query keys: `['me']`, `['household', hid]`, `['dashboard', hid]`, `['items', hid, params]`, `['item', hid, id]`,
  `['shopping', hid]`, `['conversations', hid]`, `['messages', hid, cid]`, `['invitations', hid]`
  (plus `['auth-config']`). Always build them with `queryKeys.*` from `api/queryKeys.ts` (prefix helpers
  `itemsAll`, `itemAll`, `messagesAll` for invalidation); `hooks/useRealtimeSync.ts` maps `sync` scopes to them.
- `api/client.ts`: `fetch` wrapper, `credentials: 'same-origin'`, adds `X-Homi-Request: 1` on mutations,
  maps error JSON to `ApiError {status, code, message}`; 401 → invalidate `['me']` → redirect to `/login`.
  Network failures and 502/504 mark the server unreachable (`OfflineBanner`, `/api/health` probe every 10 s).
  `/api/auth/me` answering anything but 200/401 shows the "Server nicht erreichbar" screen instead of the app.
- Active household: `useActiveHousehold()` – from `me.activeHouseholdId`, switch via PUT + local state;
  household-scoped pages use `useRequiredHouseholdId()`.
- Router shape: `createBrowserRouter([{ path: '*', Component: RootLayout }])`; the real route tree is a
  descendant `<Routes>` in `App.tsx` (`AppRoutes`) so the background screen stays mounted under modal
  sheets. Pages are lazy **named exports** matching their file name (`export function HomePage`), registered
  in `routes/lazyPages.ts`. Helpers: `paths.*` (`routes/paths.ts`), `useGoBack(fallback)`,
  `useOpenSheet()`, `useCloseSheet()` (`routes/navigation.ts`), `useScrollContainer()` (each screen layer
  owns the scroll container – pages and `Screen` must not create their own).
- Sheets: `SheetLayer` owns the `HomiBottomSheet` (page variant); sheet pages render `<SheetHeader title=…/>`,
  report unsaved input with `useSheetDirty(dirty)` (`routes/sheetDirty.ts`, triggers "Änderungen verwerfen?")
  and use `useSheet()?.requestClose()` for cancel buttons; `useCloseSheet()` closes without asking (after save).
- Toasts: `showToast({...})` from `@/components`; `<ToastHost />` is mounted once in `RootLayout`.
- Theme: `public/theme-boot.js` sets `html[data-theme]` before first paint (stored choice: system/light/dark,
  `lib/theme.ts`); `html[data-transparency='reduced']` forces opaque glass (also follows
  `prefers-reduced-transparency`).
- Routes (German paths):
  - public: `/login`, `/registrieren`, `/passwort-vergessen`, `/passwort-zuruecksetzen/:token`, `/einladung/:token`
  - `/willkommen` – create first household (or accept invitation) when user has no household
  - tab shell (with Liquid Glass tab bar, horizontal swipe between tabs): `/` Home, `/inventar`, `/einkauf`, `/chats`
  - pushed screens (no tab bar): `/inventar/:id`, `/chats/:cid`, `/haushalt`, `/haushalt/mitglieder/:userId`, `/profil`, `/einstellungen`
  - sheets (modal routes rendered over the previous screen): `/inventar/neu`, `/inventar/:id/bearbeiten`
  - dev only (not in production builds): `/__design` – design-system gallery (`?fixture=<slug>` renders one
    component like its reference PNG for `apps/web/scripts/visual-compare.ts`)
- iPhone: `viewport-fit=cover`, safe-area CSS vars `--safe-top/--safe-bottom` (from `env()`), `100dvh` shells,
  `overscroll-behavior: contain` on scroll containers, keyboard handling via `visualViewport` (`useKeyboardInset`).
- PWA: `vite-plugin-pwa` with **generateSW**, `registerType: 'prompt'` ("Update verfügbar" → "Aktualisieren"),
  `injectRegister: false` (registration in `src/pwa/usePwaUpdate.ts`; an inline register script would violate
  the CSP), app-shell precache, `NetworkOnly` for `/api` and `/socket.io`, offline fallback screen,
  `apple-mobile-web-app-*` meta, `apple-touch-icon`, theme-color light/dark. Icons are generated with
  `npm run pwa:assets -w @homi/web`.
- Dev: Vite on `:5173` proxies `/api` and `/socket.io` (ws) to `HOMI_API_TARGET` with `changeOrigin: false`, so
  the CSRF origin check sees `http://localhost:5173` (= dev `APP_URL`).
- Visual tests set `--safe-top: 54px; --safe-bottom: 34px` to emulate the iPhone status bar / home indicator of the design frames.

## 8. Design-system components (`apps/web/src/components`)

Names mirror the Freegma components (see `design/FIDELITY.md` for exact values):

| Freegma component                                                 | React component                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Tab Bar (Liquid Glass)                                            | `HomiTabBar`                                                        |
| Back Button / Icon Button / Toolbar (Glass) / Floating Add Button | `GlassButton`, `GlassToolbar`                                       |
| Profile Button / Avatar                                           | `Avatar`, `AvatarStack`, `ProfileButton`                            |
| Navigation Header (large + inline title)                          | `LargeTitleHeader`, `InlineHeader`                                  |
| Inventory Row / Product Image                                     | `InventoryItemRow`, `ProductImage`                                  |
| Category Chip                                                     | `Chip`, `ChipRow`                                                   |
| Shopping List Row / Checkbox                                      | `ShoppingItemRow`, `Checkbox`                                       |
| Message Preview Row / Chat Bubble                                 | `ConversationRow`, `ChatBubble`, `ChatComposer`, `SharedItemCard`   |
| Household Member Row / Settings Row                               | `ListRow` (+ variants), `GroupedList`                               |
| Dashboard Statistic                                               | `Stat`                                                              |
| Text Input / Price Input / Category Selector / Search Field       | `TextField`, `PriceField`, `SelectRow`, `HomiSearchField`           |
| Quantity Stepper                                                  | `QuantityStepper`                                                   |
| Image Upload Area                                                 | `ImageUploadArea`                                                   |
| Button                                                            | `Button` (primary/secondary/destructive/disabled, pressed state)    |
| Confirmation Dialog / Context Menu / Bottom Sheet / Toast         | `ConfirmDialog`, `ContextMenu`, `HomiBottomSheet`, `Toast`          |
| (new, same language)                                              | `SwipeableRow`, `EmptyState`, `Skeleton`, `OfflineBanner`, `Screen` |

Additional exports built in the foundation phase (all from the barrel `@/components`):
`Card`, `SectionHeader`, `FormCard`/`FormRow`, `SegmentedControl`, `ScrollEdge`, `SheetHeader`,
`BottomSheetOption`, `useSheet`, `ToastHost`/`showToast`/`dismissToast`, `SkeletonList`, `useLongPress`,
`useRowMenu`, `Portal`, `Icon` (`src/icons/Icon.tsx`; takes the design's viewBox `strokeWidth` or a rendered
`weight`). All component CSS lives in `styles/components.css` under the `homi-` prefix (plus `.type-*` text
helpers); glass material in `styles/glass.css`. Contracts: rows nested in `SwipeableRow` use `wrapper="div"`;
`SwipeableRow` sets `data-no-swipe` itself – any other horizontally draggable element must add it (tab-swipe
opt-out); inputs stay ≥ 16 px (iOS zoom); `HomiTabBar` renders real links
and calls `onSelect(key, event)` before navigating.

---

## 9. Foundation-phase deviations (recorded 2026-10-12)

The foundation phase (design extraction, server foundation, web foundation, design system, integration)
deviated from the first version of this contract in the following points. The sections above already
reflect them; this list exists so nobody "fixes" them back.

| #   | Area   | Original contract                                                                  | Reality (binding from now on)                                                                                                                                            |
| --- | ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Layout | `design/tokens.json`, `reference/*.png`                                            | `design/extracted/tokens.json`; references in `design/reference/{light,dark,components}/` at **1×** (393×852) with `manifest.json` – Penpot's exporter crashed at 2×/3×  |
| 2   | Layout | Dockerfile, `docker-compose.yml`, `docker-compose.build.yml`, `.github/workflows/` | not created yet (release phase); `docker-compose.dev.yml` (PostgreSQL 18, dbs `homi` + `homi_test`) added                                                                |
| 3   | Layout | `e2e/` with Playwright specs                                                       | empty; no `playwright.config.ts` – `npm run test:e2e` fails until the e2e team adds it; Playwright 1.64 needs `npx playwright install` (only chromium-1228 is installed) |
| 4   | Server | `buildApp(config)`                                                                 | `buildApp({ config, prisma?, storage?, mailer?, logger?, serveStatic?, rateLimit? })`                                                                                    |
| 5   | Server | path params `:hid`, `:id`, `:cid`                                                  | descriptive names (`:householdId`, …); identical URLs. Routes declared without the `/api` prefix                                                                         |
| 6   | Server | –                                                                                  | `src/generated/prisma` is gitignored: fresh clones/CI/Docker must run `npm run db:generate` before typecheck, test or build                                              |
| 7   | Server | rate limits for login/register/reset request                                       | additional presets: reset confirm, invitation, upload; typing 1/s                                                                                                        |
| 8   | Server | –                                                                                  | Prisma connection/init failures → `503 SERVICE_UNAVAILABLE`; `Sec-Fetch-Site: cross-site` rejected by CSRF                                                               |
| 9   | Schema | "Activity"                                                                         | model `HouseholdActivity`, `valueDelta Decimal(12,2)`                                                                                                                    |
| 10  | Env    | –                                                                                  | `DATABASE_URL_TEST` (integration tests), `HOMI_API_TARGET` (Vite proxy); dev `SESSION_SECRET` fallback; `TRUST_PROXY` accepts a hop count                                |
| 11  | Shared | –                                                                                  | CHF/quantity/date formatting is hand-written in `@homi/shared` (not `Intl`, whose de-CH output differs from the design); importing `@homi/shared` at runtime loads zod   |
| 12  | Web    | `src/{styles,components,icons,api,features,hooks,lib,pages}`                       | plus `src/routes/` (routing infrastructure), `src/app/`, `src/pwa/`, `src/test/`; styles plus `shell.css`, `components.css`                                              |
| 13  | Web    | React Router data router                                                           | data router with one splat route; the route tree is a descendant `<Routes>` (background-location sheet pattern); no loaders/actions                                      |
| 14  | Web    | PWA "injectManifest or generateSW"                                                 | generateSW, `registerType: 'prompt'`, `injectRegister: false` (CSP)                                                                                                      |
| 15  | Web    | –                                                                                  | dev-only route `/__design` (design gallery)                                                                                                                              |
| 16  | Web    | –                                                                                  | integration additions: `<ToastHost />` mounted in `RootLayout`; `useSheetDirty()` (`routes/sheetDirty.ts`) feeds the route sheet's `dirty` flag                          |
| 17  | Tokens | `tokens.css` as first drafted                                                      | corrected per `design/FIDELITY.md` D1–D10 (tab lens 0.06, dark fill-secondary `#232326`, three dim levels, 200/300 ms durations, keyword easings, FAB pressed fill, …)   |
