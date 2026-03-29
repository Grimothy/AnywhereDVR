# AnywhereDVR Agent Guidelines

**Stack**: Node.js 20 LTS, TypeScript 5.x, Express 4.x, React 18, Vite 5, Tailwind CSS 3, PostgreSQL 16, Prisma 5, Socket.IO 4.
**Runtime**: Single Docker container with ffmpeg 6+ and comskip.

## Context

AnywhereDVR is a headless, containerized DVR engine for IPTV streams. It accepts M3U playlists or Xtream Codes API credentials, records scheduled programs via ffmpeg, and re-exposes completed recordings as M3U playlists. It is NOT a player or media server — purely the recording engine.

**Source of truth**: `AnywhereDVR-Technical-Spec.md` — consult for all implementation details.

## Architecture

- **Monorepo**: `packages/server/` (Express backend) + `packages/web/` (React frontend)
- **Database**: External PostgreSQL 16 at `192.168.1.5:5432` (configurable via `DATABASE_URL`)
- **Storage**: NFS mount at `/recordings` with `live/` (in-progress HLS) and `library/` (completed)
- **ORM**: Prisma — schema at `prisma/schema.prisma`
- **Real-time**: Socket.IO for live recording status updates

## Conventions

- Follow existing code conventions. Check sibling files before creating new ones.
- Use descriptive names: `isRecordingActive`, not `active()`.
- All API endpoints prefixed `/api/v1`. M3U output endpoints at root (`/vod.m3u`, `/live.m3u`).
- API responses: `{ "data": T, "meta"?: {...} }` for success, `{ "error": { "code", "message" } }` for errors.
- Validate all inputs with `zod` schemas.
- Use `pino` for structured JSON logging.
- Store all times as UTC in PostgreSQL. Convert to local only in frontend.

## Critical Implementation Rules

1. **Play-while-recording**: ffmpeg flags `-hls_flags append_list+omit_endlist` and `-hls_list_size 0` are essential. Without them, playback breaks.
2. **Graceful ffmpeg shutdown**: Always SIGINT first, wait 10s, then SIGKILL. SIGKILL corrupts the last segment.
3. **Filename sanitization**: Replace `/ \ : * ? " < > |` with hyphens. Limit path to 255 chars.
4. **EPG timezones**: XMLTV dates include offsets — always parse to UTC.
5. **M3U output caching**: Cache `/vod.m3u` and `/live.m3u` for 30s to avoid DB overload.
6. **Stream URL expiration**: If recording fails on stale URL, re-fetch from source and retry once.
7. **Concurrent streams**: Respect `maxConcurrentStreams` setting before starting new recordings.

## Commands

```bash
# Development
npm run dev                    # Start both server + web with hot reload
npm run dev:server             # Backend only
npm run dev:web                # Frontend only

# Build
npm run build                  # Build web then server
npm run build:server
npm run build:web

# Database
npm run db:migrate             # Prisma migrate dev
npm run db:push                # Prisma db push
npm run db:seed                # Seed default settings
npm run db:studio              # Prisma Studio GUI

# Testing
npm run test                   # Vitest
npm run lint                   # ESLint

# Docker
docker compose up -d           # Production
docker compose -f docker-compose.dev.yml up  # Development
```

## Testing

- **Unit tests**: Vitest — M3U parser, XMLTV parser, file namer, scheduler logic, retention manager.
- **Integration tests**: Source sync, EPG sync, full recording lifecycle.
- **E2E** (optional): Playwright for web UI.
- Write tests alongside implementation. Every service should have corresponding test coverage.

## External Dependencies

- **PostgreSQL 16** — external, not in container
- **NFS storage** — Docker volume at `/recordings`
- **TMDB API** — free key for metadata enrichment (optional, graceful degradation)

## Implementation Order

Build in phases (each produces a testable partial app):
1. Foundation — monorepo, Prisma, Express, M3U parser, Source CRUD
2. EPG — XMLTV parser, EPG manager, EPG API
3. Recording Engine — rules, scheduler, recorder, HLS serving
4. Post-Processing — concatenation, naming, sidecar JSON, VOD playlist
5. Web UI — React app with Guide, Recordings, Schedule, Status, Settings
6. Polish — Xtream, comskip, TMDB, retention, notifications, Docker

## Do NOT

- Create documentation files unless explicitly requested.
- Change dependencies without approval.
- Create new root directories without approval.
- Skip input validation — all API inputs must use zod.
- Use `console.log` — use `pino` logger.
- Store non-UTC timestamps in the database.
