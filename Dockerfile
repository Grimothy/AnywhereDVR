# Dockerfile — Production multi-stage build
# Builds frontend + backend, produces a minimal image with ffmpeg + comskip.
# comskip is optional — image builds successfully even if comskip compilation fails.

# ── Stage 1: Build frontend ──────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json tsconfig.json ./
COPY prisma/ ./prisma/

# Copy web package
COPY packages/web/package.json packages/web/tsconfig.json ./packages/web/

# Copy root lockfile provides all workspace deps; web has no own lockfile
RUN npm ci --ignore-scripts

# Copy and build web
COPY packages/web/ ./packages/web/
RUN npm run build --workspace=packages/web

# ── Stage 2: Build backend ───────────────────────────────────
FROM node:20-alpine AS backend-build
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY prisma/ ./prisma/
COPY packages/server/package.json packages/server/tsconfig.json ./packages/server/

RUN npm ci --ignore-scripts
RUN npx prisma generate

COPY packages/server/ ./packages/server/
RUN npm run build --workspace=packages/server

# Prune dev dependencies after build
RUN npm prune --production

# ── Stage 3: Production image ────────────────────────────────
FROM node:20-alpine

# Install ffmpeg and openssl (required by Prisma)
RUN apk add --no-cache ffmpeg openssl

# Build comskip from source (optional — compilation failure is non-fatal)
# comskip-runner.ts gracefully skips commercial detection if binary is absent
RUN apk add --no-cache argtable2-dev autoconf automake libtool build-base git \
    && (git clone --depth=1 https://github.com/erikkaashoek/Comskip.git /tmp/comskip \
        && cd /tmp/comskip \
        && ./autogen.sh \
        && ./configure \
        && make \
        && make install \
        || echo "comskip build failed — commercial detection will be skipped at runtime") \
    && rm -rf /tmp/comskip \
    && apk del autoconf automake libtool build-base git

WORKDIR /app

# Copy built backend + production node_modules
COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=backend-build /app/packages/server/dist ./packages/server/dist
COPY --from=backend-build /app/prisma ./prisma
COPY --from=backend-build /app/package.json ./

# Copy built frontend into backend's static directory
COPY --from=frontend-build /app/packages/web/dist ./packages/server/dist/public

# Copy comskip config
COPY comskip/comskip.ini /etc/comskip/comskip.ini

# Create recordings directories
RUN mkdir -p /recordings/live /recordings/library

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Run migrations then start server
# migrate deploy: applies migration files (idempotent)
# db push: syncs schema to DB without migration files (idempotent, safe for fresh dbs)
# Both are safe to run on every start — no-op if schema matches
CMD ["sh", "-c", "npx prisma migrate deploy; npx prisma db push --skip-generate; node packages/server/dist/index.js"]
