# syntax=docker/dockerfile:1.7
#
# Homi – production image (single process: REST API + Socket.IO + built PWA).
#
#   docker build -t homi:local .
#
# Stages:
#   deps      – full workspace install (dev deps for building)
#   build     – Prisma client generation, web (Vite/PWA) + server (esbuild) builds
#   prod-deps – production dependencies of @homi/server only (+ Prisma CLI for migrations)
#   runtime   – minimal Debian slim image, non-root, tini as PID 1

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
WORKDIR /app

# ── deps ────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci

# ── build ───────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN npm run db:generate \
 && npm run build \
 && test -f apps/server/dist/index.js \
 && test -f apps/web/dist/index.html

# ── prod-deps ───────────────────────────────────────────────────────────
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# Only the server workspace's runtime dependencies (the web app ships as static files).
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --workspace @homi/server --include-workspace-root=false \
 && rm -rf node_modules/@homi \
 # Homi only talks to PostgreSQL: drop the query-compiler runtimes of the other Prisma providers (~53 MB).
 && find node_modules/@prisma/client/runtime -type f \( -name '*mysql*' -o -name '*sqlite*' -o -name '*sqlserver*' -o -name '*cockroachdb*' \) -delete

# ── runtime ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Homi" \
      org.opencontainers.image.description="A modern household inventory and collaboration web application." \
      org.opencontainers.image.source="https://github.com/julianhintermann-cmd/homi" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 # The app never runs npm/npx/corepack: keep them (and their dependency tree) out of the runtime.
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads \
    WEB_DIST_DIR=/app/apps/web/dist \
    MIGRATE_ON_START=true \
    HOMI_VERSION=${VERSION}

WORKDIR /app
# Application files stay owned by root (read-only for the `node` user that runs the server); only
# the uploads volume is writable, so a compromised process cannot rewrite the app.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/apps/server/prisma.config.ts ./apps/server/prisma.config.ts
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/homi-entrypoint

RUN mkdir -p /data/uploads && chown -R node:node /data \
 # As root, once: lets the Prisma CLI fetch the schema engine for this platform into the (root-owned)
 # node_modules, so `migrate deploy` never needs to write there at runtime.
 && cd /app/apps/server && node /app/node_modules/prisma/build/index.js validate --config prisma.config.ts

# Fail the build (not the first container start) if the migration CLI or the native modules are unusable.
USER node
RUN cd /app/apps/server \
 && node /app/node_modules/prisma/build/index.js validate --config prisma.config.ts \
 && node -e "Promise.all(['@prisma/adapter-pg','@node-rs/argon2','sharp','pg','dotenv'].map((m)=>import(m))).then(()=>console.log('runtime modules ok'))" \
 && if touch /app/apps/server/dist/.write-test 2>/dev/null; then echo 'app files must not be writable by node' >&2; exit 1; fi
VOLUME ["/data/uploads"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/homi-entrypoint"]
CMD ["node", "--enable-source-maps", "apps/server/dist/index.js"]
