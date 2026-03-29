<!-- Context: anywheredvr/lookup | Priority: high | Version: 1.0 | Updated: 2026-03-29 -->
# Lookup: Commands

**Purpose**: Quick reference for development, build, database, and Docker commands
**Last Updated**: 2026-03-29

## Development

```bash
npm run dev                    # Start server + web with hot reload
npm run dev:server             # Backend only (Express)
npm run dev:web                # Frontend only (Vite)
```

## Build

```bash
npm run build                  # Build web then server
npm run build:server           # Backend only
npm run build:web              # Frontend only
```

## Database (Prisma)

```bash
npm run db:migrate             # prisma migrate dev (create + apply migration)
npm run db:push                # prisma db push (push schema, no migration file)
npm run db:seed                # Seed default settings
npm run db:studio              # Prisma Studio GUI (visual DB browser)
npx prisma generate            # Regenerate Prisma client after schema change
```

## Testing

```bash
npm run test                   # Vitest (all tests)
npm run lint                   # ESLint
```

## Docker

```bash
# Production
docker compose up -d
docker compose down
docker compose logs -f anywhereDVR

# Development (hot reload, source mounted)
docker compose -f docker-compose.dev.yml up
```

## Environment

```bash
# Required
DATABASE_URL="postgresql://anywhereDVR:password@192.168.1.5:5432/anywhereDVR"
PORT=3000
NODE_ENV=production
RECORDINGS_PATH=/recordings

# Optional
LOG_LEVEL=info                 # trace|debug|info|warn|error
TMDB_API_KEY=                  # TMDB metadata enrichment
TZ=America/New_York            # Timezone for display
```

## Default Settings (seeded)

| Key | Default | Description |
|-----|---------|-------------|
| `maxConcurrentStreams` | `2` | Parallel ffmpeg processes |
| `globalDiskQuotaGB` | `100` | Storage limit |
| `recordingsBasePath` | `/recordings` | Storage root |
| `epgRefreshIntervalHours` | `12` | EPG auto-refresh |
| `sourceRefreshIntervalHours` | `24` | Source auto-refresh |
| `startEarlySeconds` | `30` | Record before EPG start |
| `endLateSeconds` | `60` | Record after EPG end |
| `enableComskip` | `true` | Commercial detection |
| `enableTmdbEnrichment` | `true` | TMDB metadata |

## 📂 Codebase References

**Configuration**:
- `package.json` - NPM scripts (root)
- `.env.example` - Environment template
- `docker-compose.yml` - Production Docker
- `docker-compose.dev.yml` - Development Docker

## Related

- lookup/file-locations.md
- guides/implementation-phases.md
