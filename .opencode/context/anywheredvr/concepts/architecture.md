<!-- Context: anywheredvr/concepts | Priority: critical | Version: 1.0 | Updated: 2026-03-29 -->
# Concept: System Architecture

**Purpose**: Monorepo structure, service layers, and runtime dependencies
**Last Updated**: 2026-03-29

## Core Idea

AnywhereDVR is a single Docker container running a Node.js monorepo with two packages: `packages/server/` (Express API + recording engine) and `packages/web/` (React SPA). It connects to an external PostgreSQL 16 database and writes recordings to an NFS-mounted volume at `/recordings`.

## Key Points

- **Single process**: Express serves both the API and the built React static files
- **Monorepo**: npm workspaces — `packages/server/` and `packages/web/`
- **ORM**: Prisma 5 with schema at `prisma/schema.prisma`
- **Real-time**: Socket.IO 4 broadcasts recording status events to connected clients
- **Child processes**: ffmpeg/comskip spawned via `child_process`, tracked in a `Map<recordingId, ChildProcess>`
- **External deps**: PostgreSQL 16 (configurable via `DATABASE_URL`), NFS storage, optional TMDB API

## Service Layer

```
Express → API Routes (/api/v1/*)
       → M3U Output Routes (/vod.m3u, /live.m3u, /recordings/*)
       → Static Files (React SPA)

Services: SourceManager → M3U Parser / Xtream Client
          EpgManager → XMLTV Parser
          Scheduler → matches EPG to rules every 60s
          Recorder → spawns/monitors/kills ffmpeg
          PostProcessor → comskip → rename → TMDB → sidecar JSON
          RetentionManager → per-series + global quota
          SocketManager → broadcasts events
          NotificationManager → in-app notifications
```

## When to Use

- Understanding how components connect before adding features
- Deciding where new code belongs (route vs. service vs. type)
- Debugging cross-service interactions

## 📂 Codebase References

**Implementation**:
- `packages/server/src/index.ts` - Application entry point, boot sequence
- `packages/server/src/config.ts` - Zod-validated environment config
- `packages/server/src/db.ts` - Prisma client singleton
- `packages/server/src/api/router.ts` - Main Express router

**Models/Types**:
- `prisma/schema.prisma` - Database schema (Source, Channel, Program, Recording, etc.)
- `packages/server/src/types/` - TypeScript type definitions

**Frontend**:
- `packages/web/src/App.tsx` - Root React component with routing
- `packages/web/src/api/client.ts` - Axios instance + API hooks

## Deep Dive

**Reference**: `AnywhereDVR-Technical-Spec.md` sections 2, 3, 11

## Related

- concepts/recording-lifecycle.md
- concepts/m3u-in-m3u-out.md
- lookup/file-locations.md
