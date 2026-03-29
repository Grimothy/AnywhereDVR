<!-- Context: anywheredvr/concepts | Priority: high | Version: 1.0 | Updated: 2026-03-29 -->
# Concept: M3U In, M3U Out

**Purpose**: Core data pipeline — ingest M3U sources, output M3U playlists of recordings
**Last Updated**: 2026-03-29

## Core Idea

AnywhereDVR consumes M3U playlists (or Xtream Codes APIs that produce equivalent data) as input, and generates M3U playlists as output. Input M3U provides channel lists + stream URLs. Output M3U provides completed recordings as VOD items and in-progress recordings as live streams. Any M3U-compatible app can consume the output.

## Key Points

- **Input**: M3U Plus playlists or Xtream Codes API credentials → parsed into Channel records
- **Output**: `/vod.m3u` (completed recordings) + `/live.m3u` (in-progress recordings)
- **HLS serving**: `/recordings/{id}/stream.m3u8` serves either live HLS segments or a wrapper around the final .ts file
- **Caching**: Output M3U endpoints cached for 30s to avoid DB overload from polling clients
- **Host header**: Output URLs must use the server's externally-accessible URL, not localhost

## Input Pipeline

```
M3U URL ──fetch──→ M3U Parser ──→ Channel records ──→ Database
                                                         ↓
XC Creds ──API──→ Xtream Client ──→ Channel records ──→ Database
                                                         ↓
EPG URL ──fetch──→ XMLTV Parser ──→ Program records (linked to channels)
```

## Output Pipeline

```
Database (COMPLETED recordings) ──→ M3U Generator ──→ /vod.m3u
Database (RECORDING status)     ──→ M3U Generator ──→ /live.m3u

/recordings/{id}/stream.m3u8:
  - If RECORDING: serve live HLS from /recordings/live/{id}/stream.m3u8
  - If COMPLETED: generate single-segment HLS wrapper for final .ts file
```

## M3U Plus Tags

```
#EXTINF:-1 tvg-id="CNN.us" tvg-name="CNN" tvg-logo="http://..." group-title="News",CNN HD
http://provider.com/live/user/pass/1234.ts
```

Key tags: `tvg-id` (EPG match), `tvg-name`, `tvg-logo`, `group-title`, `tvg-chno` (channel number)

## When to Use

- Implementing M3U parser or generator
- Understanding the data flow from source to recording to output
- Adding new source types or output formats

## 📂 Codebase References

**Implementation**:
- `packages/server/src/services/m3u-parser.ts` - Parse input M3U playlists
- `packages/server/src/services/xtream-client.ts` - Xtream Codes API client
- `packages/server/src/services/m3u-generator.ts` - Generate output M3U playlists
- `packages/server/src/services/source-manager.ts` - Source ingestion orchestrator

**Models/Types**:
- `packages/server/src/types/m3u.ts` - M3U tag types
- `packages/server/src/types/channel.ts` - Normalized channel model

## Deep Dive

**Reference**: `AnywhereDVR-Technical-Spec.md` sections 9.1, 9.2, 9.7, Appendix A

## Related

- concepts/architecture.md
- lookup/api-endpoints.md
- errors/iptv-errors.md
