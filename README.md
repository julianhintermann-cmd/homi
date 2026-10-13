# Homi

Homi is a self-hosted household inventory and collaboration app for the iPhone home screen. A household keeps its
belongings, a shared shopping list and a chat in one place, and everybody sees changes live. The UI language is
German (Swiss conventions, amounts in CHF).

|                                                     Home                                                      |                                              Inventory                                              |                                                Shopping list                                                 |                                              Chat                                               |
| :-----------------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------: |
| <img src="design/reference/light/01-home.png" width="180" alt="Home screen (design reference, light mode)" /> | <img src="design/reference/light/02-inventar.png" width="180" alt="Inventory (design reference)" /> | <img src="design/reference/light/03-einkaufsliste.png" width="180" alt="Shopping list (design reference)" /> | <img src="design/reference/light/08-chat-lisa.png" width="180" alt="Chat (design reference)" /> |

The images are the design references (`design/reference/`, 393 x 852 px) that the UI is built and visually tested
against, with a dark theme in `design/reference/dark/`. Fidelity rules are in [`design/FIDELITY.md`](design/FIDELITY.md).

## Features

- **Households** with roles (owner, admin, member), invitation links, member management, several households per
  account and a household switcher.
- **Home** dashboard: inventory value, weekly change, previews of recent items and open shopping entries.
- **Inventory**: search, categories, sorting, paging, item detail, quantity stepper, price and unit, photos (JPEG, PNG,
  WebP, GIF, HEIC; EXIF-rotated, metadata stripped, resized to thumbnail and full WebP variants).
- **Shopping list**: quick add with quantity and price, tick off, swipe actions, optimistic updates, progress, "add from
  inventory".
- **Chat**: household group chat and direct chats, unread badges, read receipts, typing indicator, offline outbox,
  shopping-item cards.
- **Realtime** over Socket.IO: every change shows up on the other members' devices without a reload.
- **Accounts**: registration, login, password reset by e-mail (optional SMTP), profile, password change, light/dark
  theme.
- **PWA**: installable, app-shell caching through a service worker, safe-area aware layout.

Status of every feature and the known open issues: [`docs/FEATURE_STATUS.md`](docs/FEATURE_STATUS.md).

## Tech stack

| Layer    | Technology                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Web      | React 19, Vite 8, TypeScript, TanStack Query, vite-plugin-pwa (Workbox), Tailwind CSS 4                   |
| Server   | Node.js 24, Fastify 5, Socket.IO 4, Zod, Argon2id (`@node-rs/argon2`), sharp                              |
| Database | PostgreSQL 18, Prisma 7 (`@prisma/adapter-pg`), versioned SQL migrations                                  |
| Shared   | `packages/shared`: Zod schemas and types of the API contract, formatters                                  |
| Tests    | Vitest (unit, integration against real PostgreSQL), Playwright (end-to-end and visual regression)         |
| Delivery | One Docker image (API, Socket.IO and the built PWA on one origin), Docker Compose, GitHub Actions to GHCR |

The architecture and the security model are described in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Quick start (published image)

Requirements: Docker with Compose v2.

```bash
git clone https://github.com/julianhintermann-cmd/homi.git
cd homi
cp .env.production.example .env
```

Edit `.env` and set at least:

```bash
APP_URL=http://localhost:3000        # exactly the URL you type into the browser
SESSION_SECRET=...                   # openssl rand -base64 48
POSTGRES_PASSWORD=...                # openssl rand -hex 24   (letters and digits only)
```

```bash
docker compose up -d
docker compose ps                    # both services should become "healthy"
```

Open <http://localhost:3000>, register and create your household. The database schema is created automatically on
the first start.

`docker-compose.yml` pulls `ghcr.io/julianhintermann-cmd/homi:${HOMI_IMAGE_TAG:-latest}` (linux/amd64 and linux/arm64,
published by [`.github/workflows/publish.yml`](.github/workflows/publish.yml) after the CI gate). If the pull is denied
or the tag does not exist yet, build from source instead.

Data lives in two named volumes, `homi_homi-db` (PostgreSQL) and `homi_homi-uploads` (item photos). They survive
`docker compose down`, restarts and image updates; only `docker compose down -v` deletes them. PostgreSQL is not
published to the host.

For anything beyond your own computer (LAN, internet, HTTPS reverse proxy, backups, upgrades) read
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Build from source

```bash
cp .env.production.example .env      # set APP_URL, SESSION_SECRET, POSTGRES_PASSWORD
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

This builds `homi:local` from the [`Dockerfile`](Dockerfile): multi-stage, production dependencies of the server only,
non-root user (`node`), `tini` as PID 1, health check on `/api/health`, pending migrations applied on start
(`docker/entrypoint.sh`), graceful shutdown on SIGTERM. The image is about 200 MB compressed.

## Local development

Requirements: Node.js >= 22.22 (24 recommended), npm, Docker (for PostgreSQL).

```bash
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL 18 on 127.0.0.1:5432 (databases homi and homi_test)
cp .env.example .env                              # development defaults, no secrets needed
npm ci
npm run db:generate                               # generates the Prisma client (gitignored)
npm run db:deploy                                 # applies the migrations to the dev database
npm run dev                                       # API on :3000, Vite on http://localhost:5173
```

| Script                                      | What it does                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`                               | Server (`tsx watch`) and web (Vite with proxy to the API) together             |
| `npm run build`                             | Production build: web (`apps/web/dist`) and server bundle (`apps/server/dist`) |
| `npm run typecheck` / `npm run lint`        | TypeScript in all workspaces / ESLint                                          |
| `npm run format`                            | Prettier (`npx prettier --check .` verifies)                                   |
| `npm test`                                  | Unit tests of all workspaces                                                   |
| `npm run test:integration`                  | Server integration tests against PostgreSQL (`DATABASE_URL_TEST`)              |
| `npm run test:e2e`                          | Playwright end-to-end and visual tests (needs a production build)              |
| `npm run db:migrate`                        | Create and apply a new migration in development (`prisma migrate dev`)         |
| `npm run db:deploy` / `npm run db:generate` | Apply committed migrations / regenerate the Prisma client                      |

## Testing

- **Unit**: `npm test` (shared, server, web).
- **Integration**: `npm run test:integration`. Runs the real Fastify app against the `homi_test` database from the dev
  compose file; the database is truncated between test files, so the name must contain "test".
- **End-to-end**: Playwright drives the production build on an iPhone viewport (393 x 852) in Chromium and WebKit.
  Prepare once, then run:

  ```bash
  docker compose -f docker-compose.dev.yml exec db createdb -U homi homi_e2e   # disposable database, reset on each run
  npx playwright install chromium webkit
  npm run db:generate && npm run build
  npm run test:e2e
  ```

  Set `E2E_DATABASE_URL` to use another database; its name must contain "e2e" or "demo".

- **Visual**: the Playwright projects `visual` (Chromium) and `visual-webkit` compare screenshots with
  `design/reference/` within per-screen budgets: `npx playwright test --project=visual`. On CI the WebKit variant is
  opt-in (`E2E_VISUAL_WEBKIT=1`). Component-level pixel diffs: `apps/web/scripts/visual-compare.ts`.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, type check, Prettier, unit, integration and end-to-end
tests plus a Docker image build with a Compose smoke test.

## Configuration

Set variables in `.env` next to `docker-compose.yml` (Compose passes them on) or directly in the environment of
the server process. Only `APP_URL`, `SESSION_SECRET` and `DATABASE_URL` (built from `POSTGRES_*` by Compose) are required in production.

| Variable                                | Default                                | Description                                                                                                                          |
| --------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `APP_URL`                               | `http://localhost:5173` (dev)          | Public origin, no trailing slash. Used for the CSRF/origin check and for invitation and reset links. Must match the browser.         |
| `SESSION_SECRET`                        | none (required in production)          | HMAC key for token hashing, at least 32 characters. Changing it signs everybody out and invalidates open links.                      |
| `DATABASE_URL`                          | none (required)                        | `postgresql://user:password@host:5432/db`. With Compose it is assembled from `POSTGRES_*`.                                           |
| `POSTGRES_USER`/`_PASSWORD`/`_DB`       | `homi` / none (required) / `homi`      | Compose only. Use a URL-safe password (letters and digits); it is applied when the volume is first created.                          |
| `COOKIE_SECURE`                         | `auto`                                 | Secure flag of the session cookie: `auto` = only when `APP_URL` starts with `https://`; `true` or `false` force it.                  |
| `TRUST_PROXY`                           | `false`                                | Hop count of the reverse proxy in front (normally `1`), so client IPs and rate limits are correct. Avoid `true` (see DEPLOYMENT.md). |
| `REGISTRATION_ENABLED`                  | `true`                                 | `false` closes public sign-up (`403`); existing accounts keep working. For private instances.                                        |
| `SESSION_TTL_DAYS`                      | `30`                                   | Sliding session lifetime.                                                                                                            |
| `UPLOAD_DIR`                            | `./uploads`, `/data/uploads` in Docker | Where item photos are stored (the `homi-uploads` volume).                                                                            |
| `MAX_UPLOAD_MB`                         | `15`                                   | Upload size limit (1 to 100). A reverse proxy must allow at least this much.                                                         |
| `SMTP_HOST`                             | unset                                  | Enables password reset by e-mail. Without it the reset flow cannot send mail.                                                        |
| `SMTP_PORT`                             | `587`                                  | `465` with `SMTP_SECURE=true`.                                                                                                       |
| `SMTP_USER`, `SMTP_PASS`                | unset                                  | SMTP credentials, if the server requires authentication.                                                                             |
| `SMTP_FROM`                             | unset                                  | Sender, for example `Homi <no-reply@example.ch>`. Required when `SMTP_HOST` is set.                                                  |
| `SMTP_SECURE`                           | `false`                                | `true` for implicit TLS (port 465), `false` for STARTTLS.                                                                            |
| `LOG_LEVEL`                             | `info`                                 | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`.                                                                      |
| `MIGRATE_ON_START`                      | `true`                                 | Container only. `false` skips `prisma migrate deploy` at start (run `homi-migrate` yourself, see DEPLOYMENT.md).                     |
| `HOMI_PORT`, `HOMI_BIND`                | `3000`, `0.0.0.0`                      | Compose only. Host port and bind address. Use `HOMI_BIND=127.0.0.1` behind a reverse proxy on the same host.                         |
| `HOMI_IMAGE_TAG`                        | `latest`                               | Compose only. Image tag: `latest`, `sha-<commit>`, or a release such as `1.0.0`.                                                     |
| `PORT`, `HOST`                          | `3000`, `0.0.0.0`                      | Listen address inside the container; normally left alone.                                                                            |
| `NODE_ENV`                              | `development`; `production` in Docker  | `production` enforces the required settings above and enables HSTS on https.                                                         |
| `WEB_DIST_DIR`                          | `apps/web/dist`                        | Directory of the built PWA served by the server.                                                                                     |
| `DATABASE_URL_TEST`, `E2E_DATABASE_URL` | local databases                        | Development only: integration tests and Playwright runs.                                                                             |
| `HOMI_API_TARGET`                       | `http://localhost:3000`                | Development only: API target of the Vite proxy.                                                                                      |

## Install on the iPhone

1. Open the app's URL in **Safari**.
2. Tap **Teilen** (the share icon), then **Zum Home-Bildschirm**, then **Hinzufügen**.

The service worker (app-shell caching, update prompt) and installability need a secure context: HTTPS, or `localhost`.
A plain `http://192.168.x.x` address on the home network works for trying the app, but a real deployment should sit
behind HTTPS, see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Use the same URL that is set as `APP_URL`.

## Security notes

- Sessions: random 32-byte token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` on https); only an HMAC of the token is
  stored. No tokens in `localStorage`. Passwords use Argon2id with a 10-character minimum.
- CSRF: every state-changing request needs the `X-Homi-Request` header, and the `Origin` must equal `APP_URL`. No CORS.
- Tenant isolation: all household data is URL-scoped and checked against the membership; unknown or foreign ids return 404.
- Uploads: the type is detected from the content, images are re-encoded (metadata stripped) and served only after a
  membership check.
- Headers: strict Content-Security-Policy (`script-src 'self'`), `nosniff`, `Referrer-Policy: no-referrer`, HSTS when
  `APP_URL` is https. Rate limits on login, registration, reset, invitations and uploads. Tokens are redacted from logs.
- Deployment: PostgreSQL is only reachable inside the Compose network, the container runs as a non-root user, and secrets
  come from `.env`, which is never committed.

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) section 4. Please report vulnerabilities privately to the
repository owner instead of opening a public issue.

## Project structure

```
apps/server        Fastify API, Socket.IO, Prisma schema and migrations, tests
apps/web           React PWA (Vite), design-system components, feature modules, tests
packages/shared    Zod schemas, types and formatters shared by server and web
e2e                Playwright support files and specs (end-to-end, visual)
design             Design spec (FIDELITY.md), reference screenshots, tokens, product demo images
docker             Container entrypoint (migrations, then start)
docs               ARCHITECTURE.md, FEATURE_STATUS.md, DEPLOYMENT.md
Dockerfile         Production image
docker-compose.yml           Production stack (GHCR image + PostgreSQL)
docker-compose.build.yml     Override: build the image from this checkout
docker-compose.dev.yml       Development PostgreSQL
.github/workflows  CI and image publishing
```

## License

No license has been chosen yet; all rights reserved by the author until a license is added. There is deliberately no
`LICENSE` file, so nobody may copy, modify or redistribute the code without permission.
