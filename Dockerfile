# Dockerfile — Production multi-stage build
# Builds frontend + backend, produces a minimal image with ffmpeg.
# Comskip is deferred to Phase 6 — recording works without it.

# ── Stage 1: Build frontend ──────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/packages/web
COPY packages/web/package.json ./
# Web has no lockfile of its own; workspace install handles it
# For now (Phase 5 not started), this stage is a no-op placeholder
RUN echo "Web build placeholder — Phase 5"

# ── Stage 2: Build backend ───────────────────────────────────
FROM node:20-alpine AS backend-build
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY prisma/ ./prisma/
COPY packages/server/package.json packages/server/tsconfig.json ./packages/server/
COPY packages/web/package.json packages/web/tsconfig.json ./packages/web/

RUN npm ci --ignore-scripts
RUN npx prisma generate

COPY packages/server/ ./packages/server/
RUN npm run build --workspace=packages/server

# Prune dev dependencies after build
RUN npm prune --production

# ── Stage 3: Production image ────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache ffmpeg openssl

WORKDIR /app

# Copy built backend + production node_modules
COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=backend-build /app/packages/server/dist ./packages/server/dist
COPY --from=backend-build /app/prisma ./prisma
COPY --from=backend-build /app/package.json ./

# Copy built frontend into backend's static directory (Phase 5)
# COPY --from=frontend-build /app/packages/web/dist ./packages/server/dist/public

# Create recordings directories
RUN mkdir -p /recordings/live /recordings/library

EXPOSE 3000

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node packages/server/dist/index.js"]
