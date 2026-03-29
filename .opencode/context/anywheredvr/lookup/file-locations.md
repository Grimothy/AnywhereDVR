<!-- Context: anywheredvr/lookup | Priority: high | Version: 1.0 | Updated: 2026-03-29 -->
# Lookup: File Locations

**Purpose**: Quick reference for directory structure and key file paths
**Last Updated**: 2026-03-29

## Project Root

```
anywhereDVR/
├── CLAUDE.md                    # Agent instructions
├── AnywhereDVR-Technical-Spec.md # Source of truth
├── docker-compose.yml           # Production deployment
├── docker-compose.dev.yml       # Development with hot reload
├── Dockerfile                   # Multi-stage build
├── .env.example                 # Environment template
├── package.json                 # Root workspace config
├── tsconfig.json                # Base TypeScript config
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── migrations/              # Prisma migrations
├── comskip/
│   └── comskip.ini              # Comskip config
├── packages/
│   ├── server/                  # Express backend
│   └── web/                     # React frontend
└── recordings/                  # Docker volume mount (NFS)
    ├── live/                    # In-progress HLS
    └── library/                 # Completed recordings
```

## Backend (`packages/server/src/`)

| Path | Purpose |
|------|---------|
| `index.ts` | Entry point — boot sequence |
| `config.ts` | Zod-validated env config |
| `db.ts` | Prisma client singleton |
| `logger.ts` | Pino logger setup |
| `api/router.ts` | Main Express router |
| `api/sources.routes.ts` | Source CRUD |
| `api/channels.routes.ts` | Channel listing/search |
| `api/epg.routes.ts` | EPG guide data |
| `api/rules.routes.ts` | Recording rules CRUD |
| `api/recordings.routes.ts` | Recording library |
| `api/schedule.routes.ts` | Upcoming recordings |
| `api/status.routes.ts` | System status |
| `api/settings.routes.ts` | App settings |
| `api/m3u-output.routes.ts` | M3U + HLS endpoints |
| `services/source-manager.ts` | Source ingestion |
| `services/m3u-parser.ts` | Parse M3U playlists |
| `services/xtream-client.ts` | Xtream Codes API |
| `services/epg-manager.ts` | EPG fetch/parse/store |
| `services/xmltv-parser.ts` | XMLTV XML parser |
| `services/scheduler.ts` | Cron loop — match EPG to rules |
| `services/recorder.ts` | ffmpeg process manager |
| `services/post-processor.ts` | Post-recording pipeline |
| `services/comskip-runner.ts` | Comskip + EDL parsing |
| `services/tmdb-client.ts` | TMDB metadata enrichment |
| `services/file-namer.ts` | Smart filename logic |
| `services/retention-manager.ts` | Quota enforcement |
| `services/m3u-generator.ts` | Generate output playlists |
| `services/notification-manager.ts` | In-app notifications |
| `services/socket-manager.ts` | Socket.IO broadcasting |
| `types/channel.ts` | Channel type definitions |
| `types/epg.ts` | EPG program types |
| `types/recording.ts` | Recording state types |
| `types/m3u.ts` | M3U tag types |

## Frontend (`packages/web/src/`)

| Path | Purpose |
|------|---------|
| `main.tsx` | React entry point |
| `App.tsx` | Root component + routing |
| `api/client.ts` | Axios instance + API hooks |
| `hooks/useSocket.ts` | Socket.IO connection |
| `hooks/useRecordings.ts` | Recording data hooks |
| `hooks/useEpg.ts` | EPG data hooks |
| `pages/Guide.tsx` | EPG grid guide view |
| `pages/Recordings.tsx` | Recording library |
| `pages/Schedule.tsx` | Upcoming recordings |
| `pages/Status.tsx` | System dashboard |
| `pages/Settings.tsx` | Source management + config |
| `components/Layout.tsx` | App shell with nav |
| `components/EpgGrid.tsx` | Time-based EPG grid |
| `components/RecordingCard.tsx` | Recording card |
| `components/RecordButton.tsx` | One-click record |

## Recordings Storage

```
/recordings/
├── live/{recording_id}/         # In-progress
│   ├── stream.m3u8              # HLS index (updated by ffmpeg)
│   └── segment_*.ts             # HLS segments
└── library/{Show Name}/         # Completed
    └── Season {XX}/
        ├── Show - S01E03 - Title.ts
        ├── Show - S01E03 - Title.json   # Sidecar metadata
        └── Show - S01E03 - Title.edl    # Commercial markers
```

## 📂 Codebase References

**Configuration**:
- `prisma/schema.prisma` - Database schema
- `.env.example` - Environment variables
- `packages/server/src/config.ts` - Runtime config validation

## Related

- concepts/architecture.md
- lookup/commands.md
