# SecNews CMS API — multi-stage build, runs as non-root `appuser`.
# Node 22 pinned (matches "engines": ">=22" in package.json).
FROM node:22-alpine AS build

# openssl: Prisma engine dependency on musl (alpine)
RUN apk add --no-cache openssl

WORKDIR /app

# Install exact dependency tree first (cached until lockfile changes).
COPY package.json package-lock.json ./
RUN npm ci

# Prisma 7 config (prisma.config.ts) + schema; generate the typed client
# into src/generated/prisma (prisma-client generator output).
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
# Placeholder URL is required: prisma.config.ts resolves DATABASE_URL at load
# time even for `generate` (which never connects). Real URL injected at runtime.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM node:22-alpine

RUN apk add --no-cache openssl \
    && addgroup -S appuser \
    && adduser -S -G appuser -h /app appuser

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

COPY --from=build --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/src ./src
COPY --from=build --chown=appuser:appuser /app/prisma ./prisma
COPY --from=build --chown=appuser:appuser /app/tsconfig.json /app/prisma.config.ts ./
COPY --chown=appuser:appuser package.json ./

USER appuser

EXPOSE 3000

# Prisma client is (re)generated, pending migrations applied against the live
# database, then the API starts. Runs via tsx (present in node_modules).
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npm start"]
