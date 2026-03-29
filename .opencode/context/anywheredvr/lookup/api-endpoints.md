<!-- Context: anywheredvr/lookup | Priority: critical | Version: 1.0 | Updated: 2026-03-29 -->
# Lookup: API Endpoints

**Purpose**: Quick reference for all REST API endpoints and M3U output routes
**Last Updated**: 2026-03-29

## Sources (`/api/v1/sources`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/sources` | List all sources |
| POST | `/api/v1/sources` | Add source (M3U or Xtream) |
| GET | `/api/v1/sources/:id` | Get source details |
| PUT | `/api/v1/sources/:id` | Update source |
| DELETE | `/api/v1/sources/:id` | Delete source + channels |
| POST | `/api/v1/sources/:id/sync` | Trigger manual source sync |

## Channels (`/api/v1/channels`)

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/v1/channels` | List channels (paginated) | `sourceId`, `group`, `search`, `page`, `perPage` |
| GET | `/api/v1/channels/:id` | Get channel details | |
| GET | `/api/v1/channels/search` | Search by name | `q` |

## EPG (`/api/v1/epg`)

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/v1/epg` | Get EPG for time range | `start`, `end`, `channelIds` |
| GET | `/api/v1/epg/:channelId` | EPG for specific channel | |
| POST | `/api/v1/epg/refresh` | Trigger manual EPG refresh | |

## Recording Rules (`/api/v1/rules`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/rules` | List all rules |
| POST | `/api/v1/rules` | Create rule (SERIES/ONCE/MANUAL) |
| GET | `/api/v1/rules/:id` | Get rule + recordings |
| PUT | `/api/v1/rules/:id` | Update rule |
| DELETE | `/api/v1/rules/:id` | Delete rule (keeps recordings) |

## Recordings (`/api/v1/recordings`)

| Method | Path | Description | Query Params |
|--------|------|-------------|--------------|
| GET | `/api/v1/recordings` | List recordings | `status`, `title`, `page`, `perPage` |
| GET | `/api/v1/recordings/:id` | Get recording details | |
| DELETE | `/api/v1/recordings/:id` | Delete recording + files | |
| POST | `/api/v1/recordings/:id/cancel` | Cancel recording | |
| POST | `/api/v1/recordings/:id/reprocess` | Re-run post-processing | |

## Schedule (`/api/v1/schedule`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/schedule` | Upcoming recordings (7 days) |
| GET | `/api/v1/schedule/conflicts` | Scheduling conflicts |

## Status (`/api/v1/status`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/status` | System status overview |
| GET | `/api/v1/status/active` | Active recordings + progress |
| GET | `/api/v1/status/disk` | Disk usage + quota |

## Settings (`/api/v1/settings`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/settings` | Get all settings |
| PUT | `/api/v1/settings` | Update settings (partial) |

## Notifications (`/api/v1/notifications`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/notifications` | List (newest first) |
| PUT | `/api/v1/notifications/:id/read` | Mark as read |
| POST | `/api/v1/notifications/read-all` | Mark all read |

## M3U Output (Root Level)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vod.m3u` | VOD playlist (completed recordings) |
| GET | `/live.m3u` | Live playlist (in-progress recordings) |
| GET | `/recordings/{id}/stream.m3u8` | HLS index for recording |
| GET | `/recordings/{id}/segment_{n}.ts` | Individual HLS segment |

## Response Format

```typescript
// Success
{ "data": T, "meta"?: { page, perPage, total } }

// Error
{ "error": { "code": string, "message": string } }
```

## 📂 Codebase References

**Implementation**:
- `packages/server/src/api/router.ts` - Main router
- `packages/server/src/api/*.routes.ts` - Individual route files
- `packages/server/src/api/m3u-output.routes.ts` - M3U output endpoints

## Related

- concepts/architecture.md
- lookup/file-locations.md
