<!-- Context: anywheredvr/guides | Priority: critical | Version: 1.0 | Updated: 2026-03-29 -->
# Guide: Implementation Phases

**Purpose**: 6-phase build order — each phase produces a testable partial app
**Last Updated**: 2026-03-29

## Prerequisites

- Node.js 20 LTS installed
- PostgreSQL 16 accessible at `DATABASE_URL`
- NFS storage mounted at `/recordings` (or local dir for dev)

**Estimated time**: Weeks (full project)

## Steps

### Phase 1: Foundation (get data flowing)

1. Initialize monorepo: root `package.json` with workspaces, TypeScript configs
2. `prisma/schema.prisma` + first migration (`npm run db:migrate`)
3. Express server skeleton: `packages/server/src/index.ts` with health check
4. Config + env validation: `config.ts` with zod schema
5. M3U parser service: `services/m3u-parser.ts`
6. Source CRUD API: `api/sources.routes.ts` — add M3U source, parse it, store channels

**Verify**: Add an M3U URL → channels appear in database
**Implementation**: `packages/server/src/services/m3u-parser.ts`, `packages/server/src/api/sources.routes.ts`

### Phase 2: EPG (understand what's on)

1. XMLTV parser service: `services/xmltv-parser.ts`
2. EPG manager: fetch + parse + store programs, link to channels via `tvgId`
3. EPG API endpoints: `api/epg.routes.ts`

**Verify**: Fetch EPG → programs appear linked to channels
**Implementation**: `packages/server/src/services/xmltv-parser.ts`, `packages/server/src/services/epg-manager.ts`

### Phase 3: Recording Engine (capture video)

1. Recording rule CRUD: `api/rules.routes.ts`
2. Scheduler: `services/scheduler.ts` — match EPG to rules, create Recording entries
3. Recorder: `services/recorder.ts` — spawn ffmpeg, manage processes
4. M3U output: `api/m3u-output.routes.ts` — live buffer playlist + HLS serving

**Verify**: Create series rule → ffmpeg captures to disk → HLS playback works
**Implementation**: `packages/server/src/services/scheduler.ts`, `packages/server/src/services/recorder.ts`

### Phase 4: Post-Processing (finish recordings)

1. HLS concatenation to single `.ts` file
2. Smart file naming + directory organization (`services/file-namer.ts`)
3. Sidecar JSON generation
4. VOD M3U playlist output

**Verify**: Recording flows through post-processing → appears in `/vod.m3u`
**Implementation**: `packages/server/src/services/post-processor.ts`, `packages/server/src/services/file-namer.ts`

### Phase 5: Web UI (make it usable)

1. React app skeleton: routing, Tailwind, layout
2. Settings page: add/manage sources
3. Guide page: EPG grid with time navigation
4. Record buttons: one-click record from guide
5. Recordings page: library browser with filters
6. Schedule page: upcoming recordings
7. Status page: dashboard
8. Socket.IO integration: live updates

**Verify**: Full UI workflow — browse guide → record → see in library
**Implementation**: `packages/web/src/`

### Phase 6: Polish (production-ready)

1. Xtream Codes API client
2. Comskip integration
3. TMDB enrichment
4. Retention manager
5. Notification system
6. Error handling + logging improvements
7. Dockerfile + docker-compose production
8. End-to-end test with real IPTV provider

**Verify**: Full Docker deployment with real IPTV source

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Prisma migration fails | Check `DATABASE_URL`, ensure PostgreSQL is reachable |
| ffmpeg not found | Install via `apt`/`apk`, verify with `ffmpeg -version` |
| HLS playback broken | Verify `-hls_flags append_list+omit_endlist` and `-hls_list_size 0` |

## 📂 Codebase References

**Workflow Orchestration**:
- `packages/server/src/index.ts` - Boot sequence initializes all services

**Tests**:
- Unit: M3U parser, XMLTV parser, file namer, scheduler logic
- Integration: Source sync, EPG sync, recording lifecycle

## Related

- concepts/architecture.md
- lookup/commands.md
- lookup/file-locations.md
