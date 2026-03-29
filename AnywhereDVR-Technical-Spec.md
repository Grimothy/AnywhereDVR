# AnywhereDVR — Complete Technical Specification

> **Purpose of this document:** This is the authoritative technical specification for building AnywhereDVR. It is written for AI coding agents (Claude Code, Cursor, Copilot, etc.) and contains everything needed to implement the application from scratch. When in doubt, this document is the source of truth.

---

## 1. Project Overview

### What is AnywhereDVR?

AnywhereDVR is a **headless, containerized DVR engine** for IPTV streams. It accepts M3U playlists or Xtream Codes API credentials as input, records scheduled programs using ffmpeg, and re-exposes completed recordings as M3U playlists that any downstream app can consume. It is NOT a player, NOT a media server — it is purely the recording engine.

**Analogy:** AnywhereDVR is to live TV what Sonarr is to torrents — the scheduling and acquisition brain, not the playback experience.

### Core Principles

1. **M3U in, M3U out** — standardized interfaces on both ends
2. **Single Docker container** — no microservices, no orchestration complexity
3. **Play while recording** — HLS segment-based capture allows playback from the start of an in-progress recording
4. **Bring your own frontend** — output M3U playlists work with Jellyfin, Emby, Plex, VLC, TiviMate, m3u-editor, or any M3U-compatible app
5. **Wife-friendly web UI** — simple enough for a non-technical user to browse the guide and manage recordings

---

## 2. Tech Stack

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| Runtime | Node.js | 20 LTS | Single language across frontend/backend, excellent child_process for ffmpeg |
| Language | TypeScript | 5.x | Type safety, better AI code generation |
| Backend framework | Express.js | 4.x | Minimal, well-understood, serves both API and static files |
| Frontend framework | React | 18.x | Best AI-assisted code generation support |
| Frontend build | Vite | 5.x | Fast dev server, clean production builds |
| Frontend styling | Tailwind CSS | 3.x | Utility-first, rapid UI development |
| Database | PostgreSQL | 16 | External instance (already running in homelab) |
| ORM | Prisma | 5.x | Type-safe database access, excellent migration tooling |
| Real-time | Socket.IO | 4.x | WebSocket for live status updates to UI |
| Process management | Node child_process | built-in | Spawn/monitor/kill ffmpeg processes |
| Video capture | ffmpeg | 6.x+ | Installed in Docker image, called via child_process |
| Commercial detection | comskip | latest | Installed in Docker image, run as post-processing step |
| Task scheduling | node-cron | 3.x | Lightweight cron-like scheduling within the process |
| HTTP client | axios | 1.x | Fetch M3U playlists, EPG data, TMDB API |
| XML parsing | fast-xml-parser | 4.x | Parse XMLTV EPG data |
| Validation | zod | 3.x | Runtime validation of API inputs and config |
| Logging | pino | 8.x | Structured JSON logging |

### External Dependencies (Not in container)

- **PostgreSQL 16** — at `192.168.1.5:5432` (configurable via env var)
- **NFS storage** — mounted as Docker volume at `/recordings`
- **TMDB API** — free API key required for metadata enrichment

---

## 3. Directory Structure

```
anywhereDVR/
├── CLAUDE.md                    # Symlink or copy of this spec for Claude Code
├── .cursorrules                 # Cursor-specific rules (copy relevant sections)
├── docker-compose.yml           # Production deployment
├── docker-compose.dev.yml       # Development with hot reload
├── Dockerfile                   # Multi-stage build
├── .env.example                 # Environment variable template
├── package.json                 # Root workspace package.json
├── tsconfig.json                # Base TypeScript config
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── migrations/              # Prisma migrations
├── packages/
│   ├── server/                  # Backend application
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                 # Entry point: start Express + all services
│   │       ├── config.ts                # Environment config with zod validation
│   │       ├── db.ts                    # Prisma client singleton
│   │       ├── logger.ts                # Pino logger setup
│   │       ├── api/
│   │       │   ├── router.ts            # Main Express router
│   │       │   ├── sources.routes.ts    # CRUD for stream sources
│   │       │   ├── channels.routes.ts   # Channel listing and search
│   │       │   ├── epg.routes.ts        # EPG guide data
│   │       │   ├── rules.routes.ts      # Recording rules CRUD
│   │       │   ├── recordings.routes.ts # Recording library
│   │       │   ├── schedule.routes.ts   # Upcoming scheduled recordings
│   │       │   ├── status.routes.ts     # System status + active recordings
│   │       │   ├── settings.routes.ts   # App settings
│   │       │   └── m3u-output.routes.ts # M3U playlist + HLS segment endpoints
│   │       ├── services/
│   │       │   ├── source-manager.ts    # M3U + XC API source ingestion
│   │       │   ├── m3u-parser.ts        # Parse M3U/M3U8 playlists
│   │       │   ├── xtream-client.ts     # Xtream Codes API client
│   │       │   ├── epg-manager.ts       # XMLTV + XC EPG fetch/parse/store
│   │       │   ├── xmltv-parser.ts      # XMLTV XML parser
│   │       │   ├── scheduler.ts         # Cron loop: match EPG to rules, queue recordings
│   │       │   ├── recorder.ts          # ffmpeg process manager (spawn/monitor/kill)
│   │       │   ├── post-processor.ts    # Pipeline: comskip → rename → TMDB → sidecar JSON
│   │       │   ├── comskip-runner.ts    # Run comskip, parse EDL output
│   │       │   ├── tmdb-client.ts       # TMDB API for metadata enrichment
│   │       │   ├── file-namer.ts        # Smart file naming logic
│   │       │   ├── retention-manager.ts # Per-series + global quota enforcement
│   │       │   ├── m3u-generator.ts     # Generate VOD + live buffer M3U playlists
│   │       │   ├── notification-manager.ts # In-app notification system
│   │       │   └── socket-manager.ts    # Socket.IO event broadcasting
│   │       └── types/
│   │           ├── channel.ts           # Normalized channel model
│   │           ├── epg.ts               # EPG program types
│   │           ├── recording.ts         # Recording state machine types
│   │           └── m3u.ts               # M3U tag types
│   └── web/                     # Frontend React application
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx                 # React entry point
│           ├── App.tsx                  # Root component with routing
│           ├── api/
│           │   └── client.ts            # Axios instance + API hooks
│           ├── hooks/
│           │   ├── useSocket.ts         # Socket.IO connection hook
│           │   ├── useRecordings.ts     # Recording data hooks
│           │   └── useEpg.ts            # EPG data hooks
│           ├── pages/
│           │   ├── Guide.tsx            # EPG grid guide view
│           │   ├── Recordings.tsx       # Recording library browser
│           │   ├── Schedule.tsx         # Upcoming scheduled recordings
│           │   ├── Status.tsx           # System dashboard
│           │   └── Settings.tsx         # Source management + app config
│           └── components/
│               ├── EpgGrid.tsx          # Time-based EPG grid
│               ├── ChannelRow.tsx       # Single channel in the guide
│               ├── ProgramCell.tsx      # Single program block in the guide
│               ├── RecordingCard.tsx    # Recording thumbnail + metadata card
│               ├── RecordButton.tsx     # One-click record from guide
│               ├── SeriesRuleForm.tsx   # Create/edit series recording rule
│               ├── ManualRuleForm.tsx   # Create/edit manual recording
│               ├── ActiveRecording.tsx  # Live recording status indicator
│               ├── DiskUsageBar.tsx     # Storage quota visualization
│               ├── NotificationToast.tsx # In-app notification popups
│               └── Layout.tsx           # App shell with nav
└── recordings/                  # Docker volume mount point (NFS storage)
    ├── live/                    # In-progress HLS recordings
    │   └── {recording_id}/
    │       ├── stream.m3u8      # HLS index (updated by ffmpeg)
    │       └── segment_*.ts     # HLS segments
    └── library/                 # Completed recordings
        └── {Show Name}/
            └── Season {XX}/
                ├── Show Name - S01E03 - Episode Title.ts
                ├── Show Name - S01E03 - Episode Title.json  # Sidecar metadata
                └── Show Name - S01E03 - Episode Title.edl   # Commercial markers
```

---

## 4. Database Schema (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// SOURCES — Where streams come from
// ============================================================

enum SourceType {
  M3U
  XTREAM
}

model Source {
  id          String     @id @default(uuid())
  name        String                          // User-friendly name ("My IPTV Provider")
  type        SourceType
  // M3U fields
  m3uUrl      String?                         // M3U playlist URL
  // Xtream fields
  xcHost      String?                         // Xtream server URL
  xcUsername  String?
  xcPassword  String?
  // EPG
  epgUrl      String?                         // XMLTV URL (null if using XC EPG)
  // Sync
  lastSyncAt  DateTime?
  syncError   String?
  refreshDaily Boolean   @default(true)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  // Relations
  channels    Channel[]
}

// ============================================================
// CHANNELS — Normalized from M3U or Xtream
// ============================================================

model Channel {
  id              String   @id @default(uuid())
  sourceId        String
  source          Source   @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  // Identity
  name            String                      // Channel display name
  channelNumber   Int?                        // Channel number if available
  groupTitle      String?                     // Group/category from M3U
  // Stream
  streamUrl       String                      // Direct stream URL
  streamType      String   @default("hls")    // "hls" or "mpegts"
  // Metadata
  tvgId           String?                     // EPG matching ID
  tvgName         String?                     // EPG matching name
  tvgLogo         String?                     // Channel logo URL
  // Xtream-specific
  xcStreamId      Int?                        // Xtream stream ID
  xcCategoryId    Int?                        // Xtream category ID
  // State
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  // Relations
  programs        Program[]
  recordingRules  RecordingRule[]
  recordings      Recording[]

  @@index([tvgId])
  @@index([sourceId])
  @@index([name])
}

// ============================================================
// EPG — Program guide data
// ============================================================

model Program {
  id          String   @id @default(uuid())
  channelId   String
  channel     Channel  @relation(fields: [channelId], references: [id], onDelete: Cascade)
  // Program info
  title       String
  subtitle    String?                         // Episode title
  description String?
  category    String?                         // Genre/category
  // Timing
  startTime   DateTime
  endTime     DateTime
  // Episode info (from EPG)
  season      Int?
  episode     Int?
  // Metadata
  iconUrl     String?                         // Program artwork from EPG
  isNew       Boolean  @default(false)        // New episode flag
  // Relations
  recordings  Recording[]

  @@index([channelId, startTime])
  @@index([title])
  @@index([startTime, endTime])
}

// ============================================================
// RECORDING RULES — What to record
// ============================================================

enum RuleType {
  SERIES                                       // Record all matching episodes
  ONCE                                         // Record one specific airing
  MANUAL                                       // Record channel + time window (no EPG match)
}

enum NewOnlyMode {
  ALL                                          // Record all airings
  NEW_ONLY                                     // Only new episodes
}

model RecordingRule {
  id          String      @id @default(uuid())
  type        RuleType
  // What to match
  channelId   String?                          // Specific channel (null = any channel)
  channel     Channel?    @relation(fields: [channelId], references: [id], onDelete: SetNull)
  seriesTitle String?                          // Title pattern to match in EPG (for SERIES)
  programId   String?                          // Specific program (for ONCE)
  // Manual recording fields
  manualStart DateTime?                        // Manual start time
  manualEnd   DateTime?                        // Manual end time
  // Options
  newOnly     NewOnlyMode @default(ALL)
  priority    Int         @default(50)         // Higher = more important (1-100)
  enabled     Boolean     @default(true)
  // Retention
  keepLast    Int?                             // Keep last N episodes (null = use global)
  // Timing adjustments
  startEarly  Int         @default(0)          // Seconds to start before EPG time
  endLate     Int         @default(0)          // Seconds to continue after EPG time
  // State
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  // Relations
  recordings  Recording[]

  @@index([seriesTitle])
  @@index([type])
}

// ============================================================
// RECORDINGS — Actual recorded content
// ============================================================

enum RecordingStatus {
  SCHEDULED                                    // Queued, waiting for start time
  RECORDING                                    // ffmpeg actively capturing
  POST_PROCESSING                              // comskip/rename/TMDB in progress
  COMPLETED                                    // Done, in library
  FAILED                                       // Recording failed
  CANCELLED                                    // Cancelled by user
}

model Recording {
  id              String          @id @default(uuid())
  // Links
  ruleId          String?
  rule            RecordingRule?  @relation(fields: [ruleId], references: [id], onDelete: SetNull)
  channelId       String
  channel         Channel         @relation(fields: [channelId], references: [id])
  programId       String?
  program         Program?        @relation(fields: [programId], references: [id], onDelete: SetNull)
  // Program metadata (denormalized for when EPG data gets purged)
  title           String                       // Show name
  subtitle        String?                      // Episode title
  description     String?
  season          Int?
  episode         Int?
  category        String?
  // Timing
  scheduledStart  DateTime
  scheduledEnd    DateTime
  actualStart     DateTime?
  actualEnd       DateTime?
  // File info
  filePath        String?                      // Final file path after post-processing
  livePath        String?                      // HLS path during recording (live/{id}/stream.m3u8)
  fileSize        BigInt?                      // Bytes
  duration        Int?                         // Seconds
  // Post-processing
  comskipStatus   String?                      // "pending" | "running" | "done" | "failed" | "skipped"
  edlPath         String?                      // Path to EDL file
  tmdbId          Int?                         // TMDB show/movie ID
  posterUrl       String?                      // TMDB poster URL
  backdropUrl     String?                      // TMDB backdrop URL
  sidecarPath     String?                      // Path to sidecar JSON
  // State
  status          RecordingStatus @default(SCHEDULED)
  errorMessage    String?
  ffmpegPid       Int?                         // PID of active ffmpeg process
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([status])
  @@index([scheduledStart])
  @@index([title])
  @@index([ruleId])
}

// ============================================================
// NOTIFICATIONS — In-app notification log
// ============================================================

enum NotificationType {
  RECORDING_STARTED
  RECORDING_COMPLETED
  RECORDING_FAILED
  DISK_WARNING
  SOURCE_SYNC_ERROR
  SYSTEM
}

model Notification {
  id        String           @id @default(uuid())
  type      NotificationType
  title     String
  message   String
  read      Boolean          @default(false)
  data      Json?                              // Optional structured data
  createdAt DateTime         @default(now())

  @@index([createdAt])
  @@index([read])
}

// ============================================================
// SETTINGS — Key-value app settings
// ============================================================

model Setting {
  key       String   @id
  value     String                             // JSON-encoded value
  updatedAt DateTime @updatedAt
}
```

### Default Settings (seed data)

```typescript
// These are inserted on first run if not present
const DEFAULT_SETTINGS = {
  "maxConcurrentStreams": "2",
  "globalDiskQuotaGB": "100",
  "recordingsBasePath": "/recordings",
  "tmdbApiKey": "",
  "epgRefreshIntervalHours": "12",
  "sourceRefreshIntervalHours": "24",
  "startEarlySeconds": "30",
  "endLateSeconds": "60",
  "enableComskip": "true",
  "enableTmdbEnrichment": "true",
  "ffmpegPath": "/usr/bin/ffmpeg",
  "comskipPath": "/usr/bin/comskip",
};
```

---

## 5. Environment Variables

```bash
# .env.example

# Database
DATABASE_URL="postgresql://anywhereDVR:password@192.168.1.5:5432/anywhereDVR"

# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Recordings storage
RECORDINGS_PATH=/recordings

# TMDB (get free key at https://www.themoviedb.org/settings/api)
TMDB_API_KEY=

# Timezone (for schedule display)
TZ=America/New_York
```

---

## 6. Configuration Validation

```typescript
// packages/server/src/config.ts

import { z } from 'zod';

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('production'),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  databaseUrl: z.string().url(),
  recordingsPath: z.string().default('/recordings'),
  tmdbApiKey: z.string().default(''),
  tz: z.string().default('America/New_York'),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse({
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  logLevel: process.env.LOG_LEVEL,
  databaseUrl: process.env.DATABASE_URL,
  recordingsPath: process.env.RECORDINGS_PATH,
  tmdbApiKey: process.env.TMDB_API_KEY,
  tz: process.env.TZ,
});
```

---

## 7. API Contract

All API endpoints are prefixed with `/api/v1`. Responses use standard JSON format:

```typescript
// Success
{ "data": T, "meta"?: { page, perPage, total } }

// Error
{ "error": { "code": string, "message": string } }
```

### 7.1 Sources

```
GET    /api/v1/sources                    — List all sources
POST   /api/v1/sources                    — Add a new source (M3U or Xtream)
GET    /api/v1/sources/:id                — Get source details
PUT    /api/v1/sources/:id                — Update source
DELETE /api/v1/sources/:id                — Delete source + its channels
POST   /api/v1/sources/:id/sync           — Trigger manual source sync (re-fetch M3U/XC)
```

**POST /api/v1/sources request body:**

```typescript
// M3U source
{
  "name": "My Provider",
  "type": "M3U",
  "m3uUrl": "http://provider.com/get.php?username=USER&password=PASS&type=m3u_plus&output=ts",
  "epgUrl": "http://provider.com/xmltv.php?username=USER&password=PASS",
  "refreshDaily": true
}

// Xtream source
{
  "name": "My XC Provider",
  "type": "XTREAM",
  "xcHost": "http://provider.com",
  "xcUsername": "user",
  "xcPassword": "pass",
  "refreshDaily": true
}
// Note: Xtream sources derive EPG from the XC API automatically
```

### 7.2 Channels

```
GET    /api/v1/channels                   — List channels (paginated, filterable)
GET    /api/v1/channels/:id               — Get channel details
GET    /api/v1/channels/search?q=fox      — Search channels by name
```

**Query params for GET /api/v1/channels:**
- `sourceId` — filter by source
- `group` — filter by group title
- `search` — search by name
- `page` — page number (default 1)
- `perPage` — results per page (default 50)

### 7.3 EPG (Electronic Program Guide)

```
GET    /api/v1/epg                        — Get EPG for time range
GET    /api/v1/epg/:channelId             — Get EPG for specific channel
POST   /api/v1/epg/refresh                — Trigger manual EPG refresh
```

**Query params for GET /api/v1/epg:**
- `start` — ISO 8601 start time (default: now)
- `end` — ISO 8601 end time (default: now + 24h)
- `channelIds` — comma-separated channel IDs (optional, for filtered view)

**Response shape:**
```typescript
{
  "data": {
    "channels": [
      {
        "channelId": "uuid",
        "channelName": "Fox News",
        "channelLogo": "http://...",
        "programs": [
          {
            "id": "uuid",
            "title": "Hannity",
            "subtitle": "Episode Title",
            "description": "...",
            "startTime": "2026-03-28T21:00:00Z",
            "endTime": "2026-03-28T22:00:00Z",
            "season": 15,
            "episode": 142,
            "category": "News",
            "isNew": true,
            "isScheduled": false,    // Whether a recording rule matches this
            "isRecording": false,    // Whether currently being recorded
            "recordingId": null      // If scheduled or recording, the recording ID
          }
        ]
      }
    ]
  }
}
```

### 7.4 Recording Rules

```
GET    /api/v1/rules                      — List all recording rules
POST   /api/v1/rules                      — Create recording rule
GET    /api/v1/rules/:id                  — Get rule details + associated recordings
PUT    /api/v1/rules/:id                  — Update rule
DELETE /api/v1/rules/:id                  — Delete rule (does NOT delete existing recordings)
```

**POST /api/v1/rules request bodies:**

```typescript
// Series recording (record all episodes matching title on a channel)
{
  "type": "SERIES",
  "channelId": "uuid",          // optional: null = any channel
  "seriesTitle": "Hannity",     // case-insensitive EPG title match
  "newOnly": "NEW_ONLY",        // or "ALL"
  "priority": 50,
  "keepLast": 5,                // optional: keep last 5 episodes
  "startEarly": 30,
  "endLate": 60
}

// One-off recording (record a specific EPG program)
{
  "type": "ONCE",
  "programId": "uuid",          // Specific EPG program entry
  "priority": 50,
  "startEarly": 30,
  "endLate": 60
}

// Manual recording (record a channel for a time window, no EPG match)
{
  "type": "MANUAL",
  "channelId": "uuid",
  "manualStart": "2026-03-29T20:00:00Z",
  "manualEnd": "2026-03-29T21:00:00Z"
}
```

### 7.5 Recordings

```
GET    /api/v1/recordings                 — List recordings (paginated, filterable)
GET    /api/v1/recordings/:id             — Get recording details
DELETE /api/v1/recordings/:id             — Delete recording + files from disk
POST   /api/v1/recordings/:id/cancel      — Cancel an in-progress or scheduled recording
POST   /api/v1/recordings/:id/reprocess   — Re-run post-processing on a completed recording
```

**Query params for GET /api/v1/recordings:**
- `status` — filter by status (SCHEDULED, RECORDING, COMPLETED, FAILED, etc.)
- `title` — filter by show title
- `page`, `perPage` — pagination

### 7.6 Schedule (Read-only view)

```
GET    /api/v1/schedule                   — List upcoming scheduled recordings (next 7 days)
GET    /api/v1/schedule/conflicts         — List scheduling conflicts
```

### 7.7 Status

```
GET    /api/v1/status                     — System status overview
GET    /api/v1/status/active              — Currently active recordings with progress
GET    /api/v1/status/disk                — Disk usage and quota info
```

**GET /api/v1/status response:**
```typescript
{
  "data": {
    "activeRecordings": 1,
    "maxConcurrentStreams": 2,
    "scheduledToday": 3,
    "totalRecordings": 47,
    "diskUsedGB": 23.5,
    "diskQuotaGB": 100,
    "diskFreePercent": 76.5,
    "uptime": 86400,
    "lastEpgSync": "2026-03-28T06:00:00Z",
    "lastSourceSync": "2026-03-28T03:00:00Z"
  }
}
```

### 7.8 Settings

```
GET    /api/v1/settings                   — Get all settings
PUT    /api/v1/settings                   — Update settings (partial update, key-value pairs)
```

### 7.9 M3U Output Endpoints

These are the endpoints that downstream M3U clients consume. They are **NOT** under `/api/v1` — they are at the root level for clean URLs.

```
GET    /vod.m3u                           — VOD playlist of all completed recordings
GET    /live.m3u                          — Live buffer playlist of in-progress recordings
GET    /recordings/{id}/stream.m3u8       — HLS index for a specific recording (live or completed)
GET    /recordings/{id}/segment_{n}.ts    — Individual HLS segment file
```

### 7.10 Notifications

```
GET    /api/v1/notifications              — List notifications (newest first)
PUT    /api/v1/notifications/:id/read     — Mark as read
POST   /api/v1/notifications/read-all     — Mark all as read
```

---

## 8. WebSocket Events (Socket.IO)

The server emits real-time events to connected clients:

```typescript
// Server → Client events
interface ServerEvents {
  // Recording lifecycle
  "recording:started":     { recordingId: string, title: string, channelName: string }
  "recording:progress":    { recordingId: string, duration: number, fileSize: number }
  "recording:completed":   { recordingId: string, title: string, filePath: string }
  "recording:failed":      { recordingId: string, title: string, error: string }
  "recording:cancelled":   { recordingId: string }

  // Post-processing
  "postprocess:started":   { recordingId: string, step: string }
  "postprocess:completed": { recordingId: string }

  // Notifications
  "notification":          { id: string, type: string, title: string, message: string }

  // Status
  "status:diskWarning":    { usedGB: number, quotaGB: number, percentUsed: number }
  "status:sourceSync":     { sourceId: string, status: "success" | "error", error?: string }
  "status:epgSync":        { status: "success" | "error", channelsUpdated: number }
}
```

---

## 9. Core Service Implementations

### 9.1 M3U Parser

```typescript
// packages/server/src/services/m3u-parser.ts

/**
 * Parses M3U/M3U8 playlists into normalized channel objects.
 * Must handle both standard M3U and M3U Plus (extended) formats.
 *
 * M3U Plus format example:
 * #EXTM3U
 * #EXTINF:-1 tvg-id="CNN.us" tvg-name="CNN" tvg-logo="http://logo.png" group-title="News",CNN HD
 * http://provider.com/live/user/pass/1234.ts
 *
 * Key tags to extract from #EXTINF line:
 * - tvg-id: EPG matching identifier
 * - tvg-name: EPG matching name
 * - tvg-logo: Channel logo URL
 * - group-title: Channel category/group
 * - tvg-chno: Channel number
 * - The display name after the comma
 * - The URL on the next line
 *
 * Also parse the #EXTM3U header for:
 * - x-tvg-url: Default EPG URL
 * - url-tvg: Alternative EPG URL tag
 *
 * Implementation approach:
 * 1. Split file by lines
 * 2. Find #EXTM3U header, extract EPG URL if present
 * 3. Iterate lines, pairing #EXTINF lines with their following URL line
 * 4. Use regex to extract tag="value" pairs from #EXTINF
 * 5. Return array of NormalizedChannel objects
 */

export interface ParsedM3uChannel {
  name: string;
  streamUrl: string;
  tvgId: string | null;
  tvgName: string | null;
  tvgLogo: string | null;
  groupTitle: string | null;
  channelNumber: number | null;
  streamType: "hls" | "mpegts";   // Infer from URL: .m3u8 = hls, .ts = mpegts
}

export interface ParsedM3u {
  epgUrl: string | null;           // From header x-tvg-url
  channels: ParsedM3uChannel[];
}

export function parseM3u(content: string): ParsedM3u { /* ... */ }
```

### 9.2 Xtream Codes API Client

```typescript
// packages/server/src/services/xtream-client.ts

/**
 * Xtream Codes API client for fetching channels, EPG, and stream URLs.
 *
 * Base URL pattern: {host}/player_api.php?username={user}&password={pass}
 *
 * Key endpoints:
 *
 * GET &action=get_live_categories
 *   Returns: [{ category_id, category_name, parent_id }]
 *
 * GET &action=get_live_streams
 *   Returns: [{ num, name, stream_type, stream_id, stream_icon,
 *               epg_channel_id, category_id, tv_archive, ... }]
 *
 * GET &action=get_short_epg&stream_id={id}
 *   Returns: { epg_listings: [{ id, title, description, start, end, ... }] }
 *
 * GET &action=get_simple_data_table&stream_id={id}
 *   Returns: Full EPG data for a stream
 *
 * Stream URL construction:
 *   Live: {host}/live/{username}/{password}/{stream_id}.ts
 *   Live HLS: {host}/live/{username}/{password}/{stream_id}.m3u8
 *
 * XMLTV EPG URL:
 *   {host}/xmltv.php?username={username}&password={password}
 *
 * Server info:
 *   GET &action=  (no action = server info)
 *   Returns: { user_info: { max_connections, ... }, server_info: { ... } }
 *
 * Implementation notes:
 * - Always prefer .m3u8 (HLS) over .ts (MPEG-TS) for stream URLs
 * - Cache category list, refresh on source sync
 * - max_connections from user_info can populate the default maxConcurrentStreams setting
 * - Some providers don't implement all endpoints — handle 404/empty gracefully
 */

export interface XtreamConfig {
  host: string;
  username: string;
  password: string;
}

export class XtreamClient {
  constructor(private config: XtreamConfig) {}

  async getServerInfo(): Promise<XtreamServerInfo> { /* ... */ }
  async getCategories(): Promise<XtreamCategory[]> { /* ... */ }
  async getLiveStreams(): Promise<XtreamStream[]> { /* ... */ }
  async getEpg(streamId: number): Promise<XtreamEpgEntry[]> { /* ... */ }
  async getFullXmltvUrl(): string { /* ... */ }

  buildStreamUrl(streamId: number, format: "ts" | "m3u8" = "m3u8"): string {
    return `${this.config.host}/live/${this.config.username}/${this.config.password}/${streamId}.${format}`;
  }
}
```

### 9.3 XMLTV EPG Parser

```typescript
// packages/server/src/services/xmltv-parser.ts

/**
 * Parses XMLTV format EPG data into Program objects.
 *
 * XMLTV structure:
 * <tv>
 *   <channel id="CNN.us">
 *     <display-name>CNN</display-name>
 *     <icon src="http://logo.png"/>
 *   </channel>
 *   <programme start="20260328210000 +0000" stop="20260328220000 +0000" channel="CNN.us">
 *     <title lang="en">Anderson Cooper 360</title>
 *     <sub-title lang="en">Episode Title</sub-title>
 *     <desc lang="en">Description text</desc>
 *     <category lang="en">News</category>
 *     <episode-num system="onscreen">S15E142</episode-num>
 *     <episode-num system="xmltv_ns">14.141.</episode-num>
 *     <icon src="http://artwork.png"/>
 *     <new/>
 *   </programme>
 * </tv>
 *
 * Date format: YYYYMMDDHHmmss +HHMM (or -HHMM)
 *
 * Episode number formats to handle:
 * - onscreen: "S15E142" → season=15, episode=142
 * - xmltv_ns: "14.141." → season=14+1=15, episode=141+1=142 (0-indexed)
 * - SxxExx pattern in title or subtitle
 *
 * Channel matching:
 * - Match XMLTV channel@id to Channel.tvgId
 * - Fallback: match display-name to Channel.tvgName or Channel.name
 *
 * Implementation:
 * - Use fast-xml-parser to parse XML
 * - Handle compressed (gzip) XMLTV feeds
 * - Parse dates to proper UTC Date objects
 * - Store only programs within ±7 days of now (purge older)
 */

export interface ParsedProgram {
  channelXmltvId: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  startTime: Date;
  endTime: Date;
  season: number | null;
  episode: number | null;
  iconUrl: string | null;
  isNew: boolean;
}

export function parseXmltv(xml: string): ParsedProgram[] { /* ... */ }
```

### 9.4 Scheduler

```typescript
// packages/server/src/services/scheduler.ts

/**
 * The scheduler runs every 60 seconds and performs the following:
 *
 * 1. MATCH: Query upcoming programs (next 30 minutes) from EPG
 *    that match enabled recording rules.
 *
 *    Matching logic:
 *    - SERIES rules: program.title ILIKE rule.seriesTitle (case-insensitive contains)
 *      If rule.channelId set, must also match channel.
 *      If rule.newOnly = NEW_ONLY, program.isNew must be true.
 *    - ONCE rules: program.id = rule.programId
 *    - MANUAL rules: check if current time is within manualStart/manualEnd window
 *
 * 2. DEDUPLICATE: Skip programs that already have a Recording entry
 *    (prevents double-scheduling the same airing)
 *
 * 3. CONFLICT RESOLUTION: If matched programs exceed maxConcurrentStreams,
 *    sort by rule.priority (descending), keep top N, skip the rest.
 *    Create FAILED recordings for skipped programs with error message.
 *
 * 4. CREATE: Insert Recording rows with status=SCHEDULED for matched programs.
 *    Apply startEarly/endLate time adjustments.
 *
 * 5. TRIGGER: For recordings where scheduledStart <= now, call recorder.start().
 *
 * 6. CLEANUP: Stop recordings where scheduledEnd <= now by calling recorder.stop().
 *
 * 7. EPG SYNC: Every N hours (epgRefreshIntervalHours setting), trigger EPG refresh.
 *
 * 8. SOURCE SYNC: Every N hours (sourceRefreshIntervalHours setting), trigger source refresh.
 *
 * 9. RETENTION: Run retention manager to enforce per-series and global quota rules.
 */
```

### 9.5 Recorder (ffmpeg Process Manager)

```typescript
// packages/server/src/services/recorder.ts

/**
 * Manages ffmpeg child processes for active recordings.
 *
 * STARTING A RECORDING:
 *
 * 1. Create the live output directory: /recordings/live/{recording.id}/
 * 2. Determine stream URL from channel record
 * 3. Spawn ffmpeg with appropriate arguments (see below)
 * 4. Update Recording: status=RECORDING, actualStart=now, ffmpegPid=pid
 * 5. Monitor the process for exit/errors
 * 6. Emit socket event "recording:started"
 *
 * ffmpeg COMMAND FOR HLS INPUT (most IPTV streams):
 *
 *   ffmpeg -y \
 *     -i "{streamUrl}" \
 *     -c copy \
 *     -copyts \
 *     -start_at_zero \
 *     -f hls \
 *     -hls_time 6 \
 *     -hls_list_size 0 \
 *     -hls_flags append_list+omit_endlist \
 *     -hls_segment_filename "/recordings/live/{id}/segment_%04d.ts" \
 *     "/recordings/live/{id}/stream.m3u8"
 *
 * Key ffmpeg flags explained:
 * - `-c copy`: No transcoding, just remux (fast, no CPU usage)
 * - `-copyts`: Preserve original timestamps
 * - `-start_at_zero`: Reset timestamps to start from 0
 * - `-f hls`: Output as HLS segments
 * - `-hls_time 6`: Target 6-second segments
 * - `-hls_list_size 0`: Keep ALL segments in playlist (not just last N)
 * - `-hls_flags append_list+omit_endlist`: Keep appending + don't write end tag
 *     (omit_endlist is critical: it tells players the stream is still live)
 * - `-hls_segment_filename`: Segment naming pattern
 *
 * ffmpeg COMMAND FOR MPEG-TS INPUT:
 *   Same command works — ffmpeg auto-detects input format.
 *   The key difference is the input URL format (.ts vs .m3u8).
 *
 * STOPPING A RECORDING:
 *
 * 1. Send SIGINT to the ffmpeg process (graceful stop, writes final segment)
 * 2. Wait for process exit (timeout 10 seconds, then SIGKILL)
 * 3. Add #EXT-X-ENDLIST to the m3u8 file (marks stream as complete/VOD)
 * 4. Update Recording: status=POST_PROCESSING, actualEnd=now, ffmpegPid=null
 * 5. Calculate file size from all segments
 * 6. Trigger post-processor
 * 7. Emit socket event "recording:completed" or "recording:failed"
 *
 * MONITORING:
 * - Parse ffmpeg stderr for progress (frame count, time, bitrate)
 * - Emit "recording:progress" events every 10 seconds
 * - If ffmpeg exits unexpectedly (non-zero exit, non-SIGINT):
 *   Set status=FAILED, store error message
 *
 * ACTIVE RECORDINGS MAP:
 * - Maintain Map<recordingId, ChildProcess> for all active ffmpeg processes
 * - On server startup, check for RECORDING status entries and mark them FAILED
 *   (server crashed during recording — can't resume ffmpeg)
 *
 * MAX CONCURRENT STREAMS:
 * - Before starting, check activeRecordings.size < maxConcurrentStreams
 * - If at limit, do not start — leave as SCHEDULED for next scheduler tick
 */

export class Recorder {
  private activeRecordings: Map<string, ChildProcess> = new Map();

  async start(recordingId: string): Promise<void> { /* ... */ }
  async stop(recordingId: string): Promise<void> { /* ... */ }
  async cancel(recordingId: string): Promise<void> { /* ... */ }
  getActive(): Map<string, ChildProcess> { return this.activeRecordings; }
  isAtCapacity(): boolean { /* ... */ }
}
```

### 9.6 Post-Processor

```typescript
// packages/server/src/services/post-processor.ts

/**
 * Runs after a recording completes. Steps execute in sequence:
 *
 * STEP 1: FINALIZE HLS
 * - Concatenate all .ts segments into a single .ts file using:
 *     ffmpeg -y -i "/recordings/live/{id}/stream.m3u8" -c copy "output.ts"
 *   This reads the m3u8 index and produces a single seekable transport stream.
 * - Calculate duration from the output file
 *
 * STEP 2: SMART RENAME
 * - Build target filename: "{Show Name} - S{XX}E{XX} - {Episode Title}.ts"
 * - Season/episode come from: Recording.season/episode (from EPG) or TMDB lookup
 * - If no season/episode info: "{Show Name} - {YYYY-MM-DD} - {Episode Title}.ts"
 * - Sanitize filename: remove illegal chars, limit length
 * - Build target directory: /recordings/library/{Show Name}/Season {XX}/
 * - Create directories, move file
 *
 * STEP 3: COMSKIP (if enabled)
 * - Run: comskip --ini=/etc/comskip/comskip.ini "{filePath}"
 * - comskip outputs: .edl file (Edit Decision List) alongside the video
 * - EDL format: each line is "{start_seconds}\t{end_seconds}\t{type}"
 *   where type 3 = commercial break
 * - If comskip fails or is disabled, skip (non-fatal)
 * - Update Recording.comskipStatus and Recording.edlPath
 *
 * STEP 4: TMDB ENRICHMENT (if enabled and API key set)
 * - Search TMDB: GET /search/tv?query={title}
 * - If match found:
 *   - GET /tv/{id}?append_to_response=images for poster/backdrop
 *   - GET /tv/{id}/season/{season}/episode/{episode} for episode details
 *   - Update Recording: tmdbId, posterUrl, backdropUrl
 *   - May also correct season/episode numbering
 * - If no match, try movie search as fallback
 * - If no match at all, skip (non-fatal)
 *
 * STEP 5: WRITE SIDECAR JSON
 * - Write a .json file alongside the recording with all metadata:
 *
 *   {
 *     "title": "Hannity",
 *     "subtitle": "Episode Title",
 *     "description": "...",
 *     "season": 15,
 *     "episode": 142,
 *     "airDate": "2026-03-28",
 *     "recordedAt": "2026-03-28T21:00:00Z",
 *     "duration": 3580,
 *     "channel": "Fox News",
 *     "category": "News",
 *     "posterUrl": "https://image.tmdb.org/...",
 *     "backdropUrl": "https://image.tmdb.org/...",
 *     "tmdbId": 12345,
 *     "commercials": [
 *       { "start": 482.5, "end": 662.1 },
 *       { "start": 1201.3, "end": 1381.0 }
 *     ],
 *     "source": {
 *       "provider": "My Provider",
 *       "channelId": "uuid",
 *       "streamUrl": "http://..."
 *     }
 *   }
 *
 * STEP 6: CLEANUP
 * - Delete /recordings/live/{id}/ directory (temp HLS segments)
 * - Update Recording: status=COMPLETED, filePath, sidecarPath, fileSize, duration
 * - Emit socket event "postprocess:completed"
 *
 * ERROR HANDLING:
 * - Each step is wrapped in try/catch
 * - If step 1 (finalize) fails → mark FAILED, abort
 * - If steps 2-5 fail → log error, continue to next step
 * - Non-fatal failures should not prevent the recording from being marked COMPLETED
 */
```

### 9.7 M3U Output Generator

```typescript
// packages/server/src/services/m3u-generator.ts

/**
 * Generates M3U playlists from the recording database.
 *
 * VOD PLAYLIST (/vod.m3u):
 * Includes all recordings with status=COMPLETED.
 * Grouped by show title.
 *
 * Output format:
 *
 * #EXTM3U
 * #EXTINF:{duration} tvg-id="{recording.id}" tvg-name="{title} S{XX}E{XX}" tvg-logo="{posterUrl}" group-title="{title}",{title} - S{XX}E{XX} - {subtitle}
 * http://{server}:{port}/recordings/{id}/stream.m3u8
 *
 * LIVE BUFFER PLAYLIST (/live.m3u):
 * Includes all recordings with status=RECORDING.
 *
 * #EXTM3U
 * #EXTINF:-1 tvg-id="{recording.id}" tvg-name="{title}" tvg-logo="{channelLogo}" group-title="Recording Now",{title} (Recording)
 * http://{server}:{port}/recordings/{id}/stream.m3u8
 *
 * HLS SEGMENT SERVING:
 * GET /recordings/{id}/stream.m3u8
 * - If recording is RECORDING: serve from /recordings/live/{id}/stream.m3u8
 * - If recording is COMPLETED: generate an m3u8 pointing to the single .ts file
 *   with proper duration and #EXT-X-ENDLIST
 *
 * GET /recordings/{id}/segment_{n}.ts
 * - Serve the raw segment file from disk
 *
 * For completed single-file recordings, generate a simple HLS playlist:
 *
 * #EXTM3U
 * #EXT-X-VERSION:3
 * #EXT-X-TARGETDURATION:{duration}
 * #EXT-X-MEDIA-SEQUENCE:0
 * #EXTINF:{duration},
 * /recordings/{id}/file.ts
 * #EXT-X-ENDLIST
 *
 * IMPORTANT: The M3U output endpoints must use the server's externally-accessible
 * URL, not localhost. This should be configurable via an environment variable
 * or auto-detected from the request Host header.
 */
```

### 9.8 Retention Manager

```typescript
// packages/server/src/services/retention-manager.ts

/**
 * Enforces retention policies. Runs after each recording completes and
 * periodically (every hour).
 *
 * ORDER OF OPERATIONS:
 *
 * 1. PER-SERIES RULES:
 *    For each RecordingRule with keepLast set:
 *    - Query COMPLETED recordings for that rule, ordered by scheduledStart DESC
 *    - If count > keepLast, delete the oldest excess recordings
 *    - "Delete" = delete file from disk + update Recording status to CANCELLED
 *      (or just delete the row entirely)
 *
 * 2. GLOBAL QUOTA:
 *    - Calculate total disk usage of all COMPLETED recordings
 *    - If totalUsedGB > globalDiskQuotaGB:
 *      - Query COMPLETED recordings ordered by scheduledStart ASC (oldest first)
 *      - Delete oldest recordings one at a time until under quota
 *      - Never delete a recording that is the ONLY episode for a series rule
 *        (warn instead)
 *    - If over 90% quota, emit disk warning notification
 *
 * FILE DELETION:
 * - Delete the .ts file
 * - Delete the .json sidecar
 * - Delete the .edl file (if exists)
 * - Remove empty parent directories
 * - Update or delete the database Recording row
 */
```

---

## 10. Docker Configuration

### Dockerfile

```dockerfile
# Dockerfile

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/packages/web
COPY packages/web/package.json packages/web/package-lock.json ./
RUN npm ci
COPY packages/web/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY prisma/ ./prisma/
COPY packages/server/package.json packages/server/tsconfig.json ./packages/server/
RUN npm ci
COPY packages/server/ ./packages/server/
RUN npx prisma generate
RUN npm run build --workspace=packages/server

# Stage 3: Production image
FROM node:20-alpine

# Install ffmpeg and comskip
RUN apk add --no-cache ffmpeg
# comskip needs to be built or installed from a binary
# TODO: Add comskip installation — may need to compile from source or use a pre-built binary
# For initial development, comskip can be optional (skip if not present)
RUN apk add --no-cache argtable2-dev autoconf automake libtool build-base git \
    && git clone https://github.com/erikkaashoek/Comskip.git /tmp/comskip \
    && cd /tmp/comskip \
    && ./autogen.sh \
    && ./configure \
    && make \
    && make install \
    && cd / \
    && rm -rf /tmp/comskip \
    && apk del autoconf automake libtool build-base git

WORKDIR /app

# Copy built backend
COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=backend-build /app/packages/server/dist ./packages/server/dist
COPY --from=backend-build /app/prisma ./prisma
COPY --from=backend-build /app/package.json ./

# Copy built frontend into backend's static serving directory
COPY --from=frontend-build /app/packages/web/dist ./packages/server/dist/public

# Copy comskip config
COPY comskip/comskip.ini /etc/comskip/comskip.ini

# Create recordings directory
RUN mkdir -p /recordings/live /recordings/library

EXPOSE 3000

# Run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node packages/server/dist/index.js"]
```

### docker-compose.yml

```yaml
# docker-compose.yml

version: "3.8"

services:
  anywhereDVR:
    build: .
    container_name: anywhereDVR
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://anywhereDVR:password@192.168.1.5:5432/anywhereDVR
      - PORT=3000
      - NODE_ENV=production
      - LOG_LEVEL=info
      - RECORDINGS_PATH=/recordings
      - TMDB_API_KEY=${TMDB_API_KEY}
      - TZ=America/New_York
    volumes:
      - /mnt/Pool3/containers/anywhereDVR/recordings:/recordings
    # Optional: pass through GPU for future transcoding support
    # devices:
    #   - /dev/dri:/dev/dri
```

### docker-compose.dev.yml

```yaml
# docker-compose.dev.yml

version: "3.8"

services:
  anywhereDVR:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: anywhereDVR-dev
    ports:
      - "3000:3000"
      - "5173:5173"    # Vite dev server
    environment:
      - DATABASE_URL=postgresql://anywhereDVR:password@192.168.1.5:5432/anywhereDVR_dev
      - PORT=3000
      - NODE_ENV=development
      - LOG_LEVEL=debug
      - RECORDINGS_PATH=/recordings
      - TMDB_API_KEY=${TMDB_API_KEY}
      - TZ=America/New_York
    volumes:
      - ./packages:/app/packages          # Mount source for hot reload
      - ./prisma:/app/prisma
      - /mnt/Pool3/containers/anywhereDVR/recordings-dev:/recordings
```

---

## 11. Server Entry Point

```typescript
// packages/server/src/index.ts

/**
 * Application entry point. Initializes all services and starts the server.
 *
 * Boot sequence:
 * 1. Load and validate config
 * 2. Initialize Prisma client + verify database connection
 * 3. Seed default settings if first run
 * 4. Initialize logger
 * 5. Create Express app
 *    - Serve React static files from ./public
 *    - Mount API router at /api/v1
 *    - Mount M3U output routes at root (/, /vod.m3u, /live.m3u, /recordings/*)
 * 6. Create HTTP server + Socket.IO
 * 7. Initialize services:
 *    - SourceManager (handles source syncing)
 *    - EpgManager (handles EPG fetching/parsing)
 *    - Scheduler (cron loop)
 *    - Recorder (ffmpeg process manager)
 *    - PostProcessor (post-recording pipeline)
 *    - RetentionManager (disk cleanup)
 *    - NotificationManager (in-app notifications)
 *    - SocketManager (real-time events)
 * 8. On startup: mark any RECORDING status entries as FAILED (server crashed)
 * 9. Start the scheduler cron (runs every 60 seconds)
 * 10. Start listening on configured port
 *
 * Graceful shutdown:
 * - On SIGTERM/SIGINT:
 *   1. Stop the scheduler cron
 *   2. Stop all active ffmpeg processes (SIGINT → wait → SIGKILL)
 *   3. Close Socket.IO connections
 *   4. Close Prisma client
 *   5. Exit
 */
```

---

## 12. Frontend Pages

### 12.1 Guide Page (primary page)

```
Layout: Full-width EPG grid, similar to a traditional TV guide.
- Horizontal axis: time (scrollable, 30-minute increments)
- Vertical axis: channels (scrollable, grouped by category)
- Each cell: program name, time, click to expand
- Expanded program: show details, "Record Once" button, "Record Series" button
- Color coding: green border = scheduled to record, red pulse = recording now
- "Now" line: vertical red line showing current time
- Time navigation: "Now" button, forward/back 3 hours
```

### 12.2 Recordings Page

```
Layout: Grid of recording cards, filterable by show title.
- Each card: poster image (from TMDB), show name, SxxExx, recorded date, status badge
- Status badges: "Recording" (red), "Processing" (yellow), "Completed" (green), "Failed" (red)
- Click card: expand to show description, file size, duration, play button (link to HLS)
- Filters: All, Completed, In Progress, Failed
- Sort: Newest first, Oldest first, By show name
- Delete button with confirmation
```

### 12.3 Schedule Page

```
Layout: List of upcoming scheduled recordings, next 7 days.
- Group by date (Today, Tomorrow, Monday, etc.)
- Each row: time, channel, show name, episode info, rule type badge (Series/Once/Manual)
- Conflict indicators: orange warning icon if recording may be skipped due to stream limit
- Cancel button per entry
```

### 12.4 Status Page

```
Layout: Dashboard with status cards.
- Active recordings card: currently recording shows with progress
- Upcoming card: next 3 scheduled recordings
- Disk usage: progress bar showing used/quota
- Recent activity: last 10 notifications
- Source health: list of sources with last sync time and status
```

### 12.5 Settings Page

```
Layout: Grouped settings form.
- Sources section: list of configured sources, add/edit/delete
- Recording settings: max concurrent streams, default start early/end late
- Storage settings: recordings path, global disk quota
- Post-processing: enable/disable comskip, TMDB API key
- Maintenance: manual EPG refresh, manual source sync, clear old recordings
```

---

## 13. Implementation Order

Build the application in this order. Each phase produces a working (partial) application that can be tested.

### Phase 1: Foundation (get data flowing)
1. Initialize project: monorepo structure, package.json files, TypeScript configs
2. Prisma schema + first migration
3. Express server skeleton with health check endpoint
4. Config + environment validation
5. M3U parser service
6. Source CRUD API (add an M3U source, parse it, store channels)
7. Test: add an M3U URL, verify channels appear in database

### Phase 2: EPG (understand what's on)
1. XMLTV parser service
2. EPG manager (fetch + parse + store programs, link to channels)
3. EPG API endpoints
4. Test: fetch EPG, verify programs appear linked to channels

### Phase 3: Recording Engine (capture video)
1. Recording rule CRUD API
2. Scheduler service (match EPG to rules, create Recording entries)
3. Recorder service (spawn ffmpeg, manage processes)
4. M3U output endpoints (live buffer playlist + HLS serving)
5. Test: create a series rule, verify ffmpeg captures to disk, verify HLS playback

### Phase 4: Post-Processing (finish recordings)
1. HLS concatenation to single .ts file
2. Smart file naming + directory organization
3. Sidecar JSON generation
4. M3U VOD playlist output
5. Test: complete recording flows through post-processing to VOD M3U

### Phase 5: Web UI (make it usable)
1. React app skeleton with routing and Tailwind
2. Settings page (add/manage sources)
3. Guide page (EPG grid)
4. Record buttons (one-click recording from guide)
5. Recordings page (library browser)
6. Schedule page (upcoming recordings)
7. Status page (dashboard)
8. Socket.IO integration for live updates

### Phase 6: Polish (production-ready)
1. Xtream Codes API client
2. comskip integration
3. TMDB enrichment
4. Retention manager
5. Notification system
6. Error handling + logging improvements
7. Dockerfile + docker-compose production setup
8. Test end-to-end with real IPTV provider

---

## 14. Important Implementation Notes

### CRITICAL: Play-while-recording

The entire value proposition depends on HLS segments being immediately playable. The ffmpeg flags `-hls_flags append_list+omit_endlist` and `-hls_list_size 0` are essential. Without `omit_endlist`, players will see the stream as finished after the first segment. Without `hls_list_size 0`, old segments get removed from the playlist and become unseekable.

### CRITICAL: Graceful ffmpeg shutdown

Always send SIGINT first, not SIGKILL. SIGINT lets ffmpeg write the final segment and clean up. SIGKILL corrupts the last segment. After SIGINT, wait up to 10 seconds for the process to exit, then SIGKILL as a last resort.

### CRITICAL: Filename sanitization

Show titles from EPG data can contain any Unicode characters, colons, slashes, quotes, etc. The file-namer MUST sanitize these for filesystem safety. Replace `/ \ : * ? " < > |` with spaces or hyphens. Trim whitespace. Limit total path length to 255 characters.

### CRITICAL: EPG timezone handling

XMLTV dates include timezone offsets (e.g., `20260328210000 +0000`). Always parse to UTC, store as UTC in PostgreSQL, and convert to local time only in the frontend.

### CRITICAL: Concurrent access to M3U output

The M3U output endpoints (`/vod.m3u`, `/live.m3u`) may be hit frequently by downstream players polling for updates. These should be generated from database queries, not from filesystem scans. Cache the generated M3U for 30 seconds to avoid excessive database load.

### NOTE: comskip compilation

comskip may be difficult to compile in Alpine Linux. If compilation fails in Docker build, make comskip support optional — the app should work without it, just skip the commercial detection step. Consider providing an alternative Docker image based on Ubuntu if Alpine compilation is problematic.

### NOTE: Xtream API inconsistencies

Not all Xtream Codes providers implement the API consistently. Some return different JSON shapes, some omit fields, some don't support EPG endpoints. Always handle missing fields gracefully with fallback defaults.

### NOTE: Stream URL expiration

Some IPTV providers generate stream URLs that expire after a period. If a recording fails because the stream URL is stale, the recorder should re-fetch the channel's stream URL from the source (re-parse M3U or re-query XC API) and retry once before marking as failed.

---

## 15. Testing Strategy

### Unit Tests (Vitest)
- M3U parser: test with various M3U formats (standard, plus, with/without tags)
- XMLTV parser: test with real-world XMLTV samples
- File namer: test with edge-case titles (unicode, long names, special chars)
- Scheduler matching logic: test rule types against mock EPG data
- Retention manager: test quota enforcement logic

### Integration Tests
- Source sync: add M3U URL, verify channels stored correctly
- EPG sync: fetch XMLTV, verify programs linked to channels
- Recording lifecycle: create rule → scheduler creates recording → ffmpeg captures → post-process → VOD M3U

### E2E Tests (optional, Phase 6)
- Playwright tests for web UI flows
- Full recording workflow with a test M3U stream

---

## 16. File: comskip/comskip.ini

```ini
; comskip.ini — Default configuration for AnywhereDVR
; Tuned for IPTV recordings (720p/1080p, US broadcast style commercials)

detect_method=111
verbose=0
max_brightness=60
max_avg_brightness=25
min_silence=12
noise_level=5
max_volume=500
min_show_segment_length=250
max_commercial_length=600
min_commercial_length=15
output_edl=1
output_chapters=0
```

---

## 17. Key NPM Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:web\"",
    "dev:server": "npm run --workspace=packages/server dev",
    "dev:web": "npm run --workspace=packages/web dev",
    "build": "npm run build:web && npm run build:server",
    "build:server": "npm run --workspace=packages/server build",
    "build:web": "npm run --workspace=packages/web build",
    "db:migrate": "npx prisma migrate dev",
    "db:push": "npx prisma db push",
    "db:seed": "npx prisma db seed",
    "db:studio": "npx prisma studio",
    "test": "vitest",
    "lint": "eslint packages/*/src/**/*.ts packages/*/src/**/*.tsx"
  }
}
```

---

## Appendix A: Example M3U Output (VOD)

```m3u
#EXTM3U x-tvg-url=""
#EXTINF:3580 tvg-id="rec-abc123" tvg-name="Hannity S15E142" tvg-logo="https://image.tmdb.org/t/p/w300/poster.jpg" group-title="Hannity",Hannity - S15E142 - Interview with Senator
http://192.168.1.5:3000/recordings/abc123/stream.m3u8
#EXTINF:3600 tvg-id="rec-def456" tvg-name="Hannity S15E143" tvg-logo="https://image.tmdb.org/t/p/w300/poster.jpg" group-title="Hannity",Hannity - S15E143 - Economic Update
http://192.168.1.5:3000/recordings/def456/stream.m3u8
#EXTINF:2700 tvg-id="rec-ghi789" tvg-name="The Five S12E078" tvg-logo="https://image.tmdb.org/t/p/w300/poster2.jpg" group-title="The Five",The Five - S12E078 - Daily Roundtable
http://192.168.1.5:3000/recordings/ghi789/stream.m3u8
```

## Appendix B: Example Sidecar JSON

```json
{
  "version": 1,
  "title": "Hannity",
  "subtitle": "Interview with Senator",
  "description": "Sean Hannity interviews a prominent senator about the latest policy debates.",
  "season": 15,
  "episode": 142,
  "airDate": "2026-03-28",
  "recordedAt": "2026-03-28T21:00:00Z",
  "duration": 3580,
  "fileSize": 2147483648,
  "channel": {
    "name": "Fox News",
    "number": 360,
    "logo": "http://provider.com/logos/fox.png"
  },
  "category": "News",
  "poster": "https://image.tmdb.org/t/p/w300/poster.jpg",
  "backdrop": "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
  "tmdbId": 12345,
  "commercials": [
    { "start": 482.5, "end": 662.1 },
    { "start": 1201.3, "end": 1381.0 },
    { "start": 1920.0, "end": 2100.5 },
    { "start": 2640.2, "end": 2820.0 }
  ],
  "source": {
    "provider": "My IPTV Provider",
    "type": "M3U",
    "channelId": "uuid-of-channel"
  }
}
```

## Appendix C: Example XMLTV EPG Entry

```xml
<programme start="20260328210000 +0000" stop="20260328220000 +0000" channel="fox.news.us">
  <title lang="en">Hannity</title>
  <sub-title lang="en">Interview with Senator</sub-title>
  <desc lang="en">Sean Hannity interviews a prominent senator about the latest policy debates.</desc>
  <category lang="en">News</category>
  <episode-num system="onscreen">S15E142</episode-num>
  <episode-num system="xmltv_ns">14.141.</episode-num>
  <icon src="https://artwork.example.com/hannity-ep142.jpg"/>
  <new/>
</programme>
```
