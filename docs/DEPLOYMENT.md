# Homi – Deployment

How to run Homi on your own computer, on the home network and on the internet, and how to back it up, upgrade it and
roll it back. The commands were run against the Compose stack in this repository; everything is relative to the
directory that contains `docker-compose.yml` and your `.env`.

## 1. What runs

| Service    | Image                                     | Purpose                                                    | Published port                   |
| ---------- | ----------------------------------------- | ---------------------------------------------------------- | -------------------------------- |
| `homi`     | `ghcr.io/julianhintermann-cmd/homi:<tag>` | API, Socket.IO and the built PWA on one origin (port 3000) | `${HOMI_BIND}:${HOMI_PORT}:3000` |
| `postgres` | `postgres:18-alpine`                      | Database                                                   | none (internal network only)     |

Volumes: `homi-db` (PostgreSQL data) and `homi-uploads` (item photos). With the project name `homi` they are called
`homi_homi-db` and `homi_homi-uploads`. Both are needed for a complete backup.

The container runs as the non-root user `node`, with `tini` as PID 1. It applies pending database migrations on start,
answers SIGTERM with a graceful shutdown (open sockets are closed, in-flight requests finish; normally under a second,
hard limit 10 s inside the app and `stop_grace_period: 20s` in Compose).

## 2. Choose a scenario

| Scenario            | `APP_URL`                  | HTTPS | `HOMI_BIND` | `TRUST_PROXY` | Notes                                                               |
| ------------------- | -------------------------- | ----- | ----------- | ------------- | ------------------------------------------------------------------- |
| Local, one computer | `http://localhost:3000`    | no    | `127.0.0.1` | `false`       | Service worker works (localhost is a secure context).               |
| Home network (LAN)  | `http://192.168.1.20:3000` | no    | `0.0.0.0`   | `false`       | iPhone on the same Wi-Fi. No service worker (not a secure context). |
| Internet / real use | `https://homi.example.ch`  | yes   | `127.0.0.1` | `1`           | Reverse proxy terminates TLS, section 3.                            |

Rules that apply everywhere:

- **`APP_URL` must be exactly what the browser shows** (scheme, host and port, no trailing slash). The server rejects
  state-changing requests and WebSocket handshakes whose `Origin` differs from it. If you change the hostname or port,
  change `APP_URL` and restart.
- `SESSION_SECRET` has at least 32 random characters and stays secret. `POSTGRES_PASSWORD` uses letters and digits only
  (it is embedded in a URL).
- `COOKIE_SECURE=auto` sets the `Secure` flag only for an `https://` `APP_URL`. Over plain http the cookie has no
  `Secure` flag (otherwise login would not work), and no HSTS header is sent.
- Find the LAN address of your computer (`ipconfig` on Windows, `ip addr` on Linux), allow the port in the firewall and
  open `http://<address>:3000` on the iPhone. Do not forward a plain-http port to the internet.

Start:

```bash
cp .env.production.example .env     # edit APP_URL, SESSION_SECRET, POSTGRES_PASSWORD (and the rows above)
docker compose up -d
docker compose ps
curl http://localhost:3000/api/health      # {"status":"ok","db":"ok"}
```

## 3. HTTPS behind a reverse proxy

Run the proxy on the same host and let it forward to `127.0.0.1:3000`. In `.env`:

```bash
APP_URL=https://homi.example.ch
HOMI_BIND=127.0.0.1
HOMI_PORT=3000
TRUST_PROXY=1             # exactly one proxy hop in front of the app
```

`TRUST_PROXY` makes the server use `X-Forwarded-For` for the client IP (rate limits are per IP; without it every user
would share the proxy's address). Only enable it when the app is reachable exclusively through your proxy, which
`HOMI_BIND=127.0.0.1` ensures. **Use the hop count (`1`), not `true`:** proxies append the real address to whatever
`X-Forwarded-For` the client sent, and `true` trusts the left-most, client-written entry – every client could then pick
its own IP and skip the login, registration and upload limits. With `1` the server takes the address your proxy added.
The server logs a warning at start when it runs in production with `TRUST_PROXY=true`. With an https `APP_URL` the server sends HSTS and `Secure` cookies; the proxy only has to
pass the request through. Point the DNS record of the host name at your server and open ports 80 and 443.

### Caddy (automatic certificates)

```caddyfile
homi.example.ch {
    encode zstd gzip
    request_body {
        max_size 20MB          # at least MAX_UPLOAD_MB (default 15)
    }
    reverse_proxy 127.0.0.1:3000
}
```

Caddy forwards WebSocket upgrades (`/socket.io/`) and sets the `X-Forwarded-*` headers without further configuration.

### nginx

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name homi.example.ch;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name homi.example.ch;

    ssl_certificate     /etc/letsencrypt/live/homi.example.ch/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/homi.example.ch/privkey.pem;

    client_max_body_size 20m;            # nginx default is 1m: photo uploads would fail with 413

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $remote_addr;   # overwrite: never pass a client-written value on
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;

        # WebSocket upgrade for Socket.IO (path /socket.io/)
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
        proxy_read_timeout  75s;
        proxy_send_timeout  75s;
    }
}
```

The `Upgrade`/`Connection` headers are what makes the live updates (chat, shopping list) work; without them the app
falls back to long polling or shows the offline indicator. Do not add a second HSTS or CSP header in the proxy, the
app already sends them. If the proxy runs in another container on the same Docker network instead, drop
`HOMI_BIND`/`ports` and use `proxy_pass http://homi:3000`.

### Check the result

```bash
curl -sI https://homi.example.ch/ | grep -i -E "^HTTP|strict-transport|content-security"
curl -s  https://homi.example.ch/api/health
curl -s -o /dev/null -w "%{http_code}\n" "https://homi.example.ch/socket.io/?EIO=4&transport=polling"   # 200
```

Then register in the browser; the session cookie should be `HttpOnly; Secure; SameSite=Lax`. On the iPhone use
Safari, **Teilen**, **Zum Home-Bildschirm**.

## 4. Health checks and logs

- `GET /api/health` returns `200 {"status":"ok","db":"ok"}`, or `503 {"status":"error","db":"down"}` when PostgreSQL is
  unreachable. It is unauthenticated and never cached.
- The image has a built-in `HEALTHCHECK` (30 s interval, 40 s start period) calling that endpoint; PostgreSQL has
  `pg_isready`. `docker compose ps` shows `healthy` once both pass, and `homi` starts only after the database is healthy.
- Logs are JSON lines (`docker compose logs -f homi`); cookies, passwords and tokens in URLs are redacted. Set
  `LOG_LEVEL=debug` temporarily if needed.
- External monitoring (Uptime Kuma, Healthchecks and similar) can poll `https://homi.example.ch/api/health`.

## 5. Backups

Back up **both** the database and the uploads, from the same moment if possible. Run the commands in the directory with
`docker-compose.yml`.

```bash
mkdir -p backups
STAMP=$(date +%F-%H%M)

# 1) Database (custom format, compressed, restorable with pg_restore)
docker compose exec -T postgres pg_dump -U homi -d homi --format=custom > backups/homi-db-$STAMP.dump

# 2) Uploaded photos
docker compose exec -T homi tar czf - -C /data/uploads . > backups/homi-uploads-$STAMP.tar.gz
```

If you changed `POSTGRES_USER` or `POSTGRES_DB`, use those names for `-U` and `-d`. On Windows with Git Bash prefix the
second command with `MSYS_NO_PATHCONV=1` so that `/data/uploads` is not rewritten to a Windows path.

Keep copies off the machine (another disk, NAS, cloud storage) and test a restore now and then. `.env` is part of the
backup too (store it in a password manager; without `SESSION_SECRET` old invitation and reset links stop working, though
accounts and data survive).

### Restore

Into a stack with the same `.env`; an empty fresh one works, as does an existing one (`--clean` replaces its tables):

```bash
docker compose up -d postgres
docker compose stop homi 2>/dev/null || true

# database
docker compose exec -T postgres pg_restore -U homi -d homi --clean --if-exists --no-owner < backups/homi-db-<stamp>.dump

# photos (extracts as the app user, so ownership is right)
docker compose up -d homi
docker compose exec -T homi tar xzf - -C /data/uploads < backups/homi-uploads-<stamp>.tar.gz

docker compose restart homi
```

The dump contains Prisma's migration history, so the app starts normally on it. This procedure was tested: a stack
populated with an account, household, item with photo, shopping entry and chat message was dumped, restored into a new,
empty stack and returned identical data, including byte-identical image variants.

For a rough but cheap safety net, a daily cron entry running the two commands plus `find backups -mtime +30 -delete`
is enough for a household-sized installation.

## 6. Upgrades

Releases are image tags on GHCR: `latest` (main branch), `sha-<commit>`, and `1.2.3`, `1.2`, `1` for version tags `v1.2.3`.
Pinning a version (`HOMI_IMAGE_TAG=1.2.3` in `.env`) makes upgrades deliberate.

```bash
# 1) back up (section 5)
# 2) pull and recreate
docker compose pull
docker compose up -d
# 3) verify
docker compose ps
docker compose logs --tail 30 homi         # "[homi] applying database migrations", then "Server listening"
curl -s http://localhost:3000/api/health
```

Only the `homi` container is recreated; the database and the uploads volume stay. **Migrations run automatically** on
container start (`prisma migrate deploy`: applies only committed, pending migrations, never resets data). A start without
pending migrations prints "No pending migrations to apply". If the database is not ready yet the entrypoint retries for
about 30 seconds.

Building from source instead: `git pull`, then
`docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`.

### Running migrations manually

Set `MIGRATE_ON_START=false` in `.env` to keep the start free of schema changes (for example when several replicas or a
separate release process own migrations). Then apply them explicitly after each upgrade:

```bash
docker compose pull
docker compose run --rm homi homi-migrate     # applies pending migrations and exits
docker compose up -d
```

`docker compose run` does not publish the service ports, so it does not collide with the running stack.

## 7. Rollback

1. Stop the new version and pin the previous tag: set `HOMI_IMAGE_TAG=<previous>` (a version, or `sha-<commit>`) in `.env`.
2. `docker compose up -d`.

Images can be rolled back at any time, but **database migrations are forward-only**. If the release you are leaving
applied a schema migration, the older image may not work with the new schema. In that case restore the database dump taken
before the upgrade (section 5, database part only; the uploads can stay) and then start the older tag. This is why a
backup before every upgrade is part of the procedure. Releases without a migration roll back by changing the tag alone.

## 8. Stopping, removing, moving

- `docker compose stop` / `start` / `restart`: data stays.
- `docker compose down`: removes containers and the network, **keeps the volumes**. `docker compose up -d` brings the
  same data back (tested, together with a forced recreate and a rebuilt image).
- `docker compose down -v`: also deletes the volumes, meaning **all data**. Only use it to start from scratch.
- Moving to another host: install Docker, copy the repository files and `.env`, start the stack, restore the backup.

## 9. Troubleshooting

| Symptom                                                                | Likely cause and fix                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `required variable ... is missing a value`                             | `.env` lacks `APP_URL`, `SESSION_SECRET` or `POSTGRES_PASSWORD`. Compose refuses to start without them.                  |
| Container exits with "Invalid configuration"                           | `SESSION_SECRET` shorter than 32 characters or `APP_URL` is not an http(s) URL; see `docker compose logs homi`.          |
| Login or registration answers 403 `CSRF`                               | The address in the browser differs from `APP_URL` (other host, port or scheme), or the proxy strips the `Origin` header. |
| Registered, but logged out again at once                               | `COOKIE_SECURE=true` while the site is opened over plain http (the browser drops a `Secure` cookie there).               |
| Everybody hits "too many requests" at the same time                    | Behind a proxy without `TRUST_PROXY=1`: all users share one IP.                                                          |
| Photo upload fails with 413                                            | Proxy body limit below the file size (nginx `client_max_body_size`) or `MAX_UPLOAD_MB` too small.                        |
| No live updates, "offline" hint                                        | WebSocket upgrade not forwarded (nginx `Upgrade`/`Connection` headers), or `Origin` mismatch with `APP_URL`.             |
| `password authentication failed` after changing the password in `.env` | `POSTGRES_PASSWORD` is only read when the database volume is created. Change it in PostgreSQL (`ALTER USER`) as well.    |
| Service worker does not register on the iPhone                         | Plain http on a LAN address is not a secure context. Use HTTPS (section 3).                                              |

## 10. Security notes for internet-facing instances

- **Sign-up:** anyone who can reach the instance can create an account. For a private instance create the accounts
  (and households, invitations) first, then set `REGISTRATION_ENABLED=false` and recreate the container – registration
  then answers `403`, logins and invitations of existing accounts keep working.
- **Built-in abuse limits** (per process, in memory): login 10/min per IP and 5/min per e-mail and IP (plus 50 per
  15 min per e-mail across all IPs), registration 5/min per IP, inventory writes 150/min per user, photo uploads
  30/min per IP and 30 per 10 min per user, at most 30 unattached uploads per user and household, 2 photos decoded at a
  time (more than 8 waiting → `503`), 5000 items per household, 20 owned households per user, 50 active invitation
  links per household. They rely on correct client IPs, so set `TRUST_PROXY` as described in section 3.
- **Image:** the app files are owned by root and read-only for the `node` user that runs the server; only
  `/data/uploads` is writable. npm/npx are not part of the runtime image.
- **Known audit findings (accepted):** `npm audit --omit=dev` reports advisories in `mysql2` and `deepmerge-ts`, pulled
  in by the Prisma CLI (`prisma`, `@prisma/config`), which the image needs for `prisma migrate deploy` at start. The
  server never loads these modules and Homi only talks to PostgreSQL. Track Prisma releases and drop the note once a
  release ships patched dependencies; image scanners will flag them until then.
