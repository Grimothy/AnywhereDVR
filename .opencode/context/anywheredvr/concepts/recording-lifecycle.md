<!-- Context: anywheredvr/concepts | Priority: critical | Version: 1.0 | Updated: 2026-03-29 -->
# Concept: Recording Lifecycle

**Purpose**: State machine for recordings from scheduling through completion
**Last Updated**: 2026-03-29

## Core Idea

A Recording transitions through a strict state machine: SCHEDULED → RECORDING → POST_PROCESSING → COMPLETED. Failures at any stage set status to FAILED. Users can CANCEL scheduled or in-progress recordings. The scheduler creates SCHEDULED entries, the recorder manages the RECORDING state, and the post-processor handles everything after ffmpeg stops.

## Key Points

- **State machine**: `SCHEDULED → RECORDING → POST_PROCESSING → COMPLETED | FAILED | CANCELLED`
- **Scheduler tick**: Runs every 60s, matches EPG programs to recording rules, creates SCHEDULED entries
- **Conflict resolution**: If matches exceed `maxConcurrentStreams`, highest `priority` wins; losers are FAILED
- **Graceful stop**: SIGINT → wait 10s → SIGKILL (SIGKILL corrupts the last segment)
- **Crash recovery**: On startup, any recordings with status=RECORDING are marked FAILED

## State Transitions

```
SCHEDULED ──start time──→ RECORDING ──ffmpeg stops──→ POST_PROCESSING ──pipeline done──→ COMPLETED
    │                        │                              │
    ├──user cancel──→ CANCELLED  ├──ffmpeg crash──→ FAILED  ├──step 1 fails──→ FAILED
    └──conflict────→ FAILED     └──user cancel──→ CANCELLED └──steps 2-5 fail──→ COMPLETED (partial)
```

## Post-Processing Pipeline

1. **Finalize HLS** — concatenate .ts segments into single file (fatal if fails)
2. **Smart rename** — `{Show} - S{XX}E{XX} - {Episode}.ts` (non-fatal)
3. **Comskip** — detect commercials, write .edl file (non-fatal, optional)
4. **TMDB enrichment** — fetch poster/backdrop/metadata (non-fatal, optional)
5. **Sidecar JSON** — write metadata file alongside recording (non-fatal)
6. **Cleanup** — delete `live/{id}/` temp directory, update DB

## When to Use

- Implementing the recorder or scheduler services
- Understanding what happens when a recording fails
- Debugging incomplete or stuck recordings

## 📂 Codebase References

**Implementation**:
- `packages/server/src/services/scheduler.ts` - Creates SCHEDULED recordings, triggers starts/stops
- `packages/server/src/services/recorder.ts` - Manages ffmpeg processes (RECORDING state)
- `packages/server/src/services/post-processor.ts` - Pipeline after recording (POST_PROCESSING state)

**Models/Types**:
- `prisma/schema.prisma` - RecordingStatus enum, Recording model
- `packages/server/src/types/recording.ts` - Recording TypeScript types

## Deep Dive

**Reference**: `AnywhereDVR-Technical-Spec.md` sections 9.4, 9.5, 9.6

## Related

- concepts/architecture.md
- examples/recording-ffmpeg.md
- errors/ffmpeg-errors.md
