# Memex: one image that serves the API and the built web app on a single port.
#
#   docker compose up -d        (needs JWT_SECRET in .env; Postgres starts first, migrations apply on boot)
#
# Local AI (Ollama) is NOT inside this image: use your native Ollama, or `docker compose --profile ollama up -d`.

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY client/package.json client/package-lock.json client/
COPY server/package.json server/package-lock.json server/
# `npm install`, not `npm ci`: the lock files were generated on Windows and omit Linux-only optional packages (esbuild's
# platform binaries), so `npm ci` fails here. CI uses the same workaround.
# Optional: certs/*.crt (see certs/README.md) lets the build trust a network that re-signs HTTPS (antivirus scanning, proxies).
# It is mounted for this step only and never lands in an image layer.
RUN --mount=type=bind,source=certs,target=/certs sh -c 'cat /certs/*.crt > /tmp/extra-ca.pem 2>/dev/null; [ -s /tmp/extra-ca.pem ] && export NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem; cd client && npm install --no-audit --no-fund && cd ../server && npm install --no-audit --no-fund'

COPY shared shared
COPY client client
COPY server server
RUN cd client && npm run build && cd ../server && npm run build

# ── run ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS run
ENV NODE_ENV=production \
    PORT=3002 \
    HOST=0.0.0.0 \
    MEMEX_AUTO_MIGRATE=true \
    MEMEX_IN_DOCKER=1 \
    MEMEX_CLIENT_DIR=/app/client/dist
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN --mount=type=bind,source=certs,target=/certs sh -c 'cat /certs/*.crt > /tmp/extra-ca.pem 2>/dev/null; [ -s /tmp/extra-ca.pem ] && export NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem; npm install --omit=dev --no-audit --no-fund && npm cache clean --force && rm -f /tmp/extra-ca.pem'

COPY --from=build /app/server/dist ./dist
# tsc does not copy .sql files; the migrator reads them next to the compiled code.
COPY --from=build /app/server/src/db/migrations ./dist/server/src/db/migrations
COPY --from=build /app/client/dist /app/client/dist
RUN chown -R node:node /app

USER node
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3002/api/health || exit 1
CMD ["node", "dist/server/src/index.js"]
