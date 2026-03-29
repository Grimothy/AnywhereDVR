# AnywhereDVR Domain Navigation

**Purpose**: Navigate AnywhereDVR project-specific context

---

## Structure

```
anywheredvr/
├── navigation.md
├── concepts/
│   ├── architecture.md          # System architecture + tech stack
│   ├── recording-lifecycle.md   # Recording state machine
│   └── m3u-in-m3u-out.md       # Core M3U pipeline concept
├── examples/
│   └── recording-ffmpeg.md      # ffmpeg command patterns
├── guides/
│   ├── implementation-phases.md # 6-phase build order
│   └── adding-service.md       # How to add backend services
├── lookup/
│   ├── api-endpoints.md         # All REST API endpoints
│   ├── file-locations.md        # Directory structure + key paths
│   └── commands.md              # NPM, Docker, Prisma commands
└── errors/
    ├── ffmpeg-errors.md         # ffmpeg recording gotchas
    └── iptv-errors.md           # M3U/Xtream common issues
```

---

## Quick Routes

| Task | Path |
|------|------|
| **System overview** | `concepts/architecture.md` |
| **How recordings work** | `concepts/recording-lifecycle.md` |
| **Input/output model** | `concepts/m3u-in-m3u-out.md` |
| **API endpoints** | `lookup/api-endpoints.md` |
| **File paths** | `lookup/file-locations.md` |
| **Dev commands** | `lookup/commands.md` |
| **What to build next** | `guides/implementation-phases.md` |
| **New service pattern** | `guides/adding-service.md` |
| **ffmpeg commands** | `examples/recording-ffmpeg.md` |
| **Fix ffmpeg issue** | `errors/ffmpeg-errors.md` |
| **Fix IPTV issue** | `errors/iptv-errors.md` |

---

## By Type

**Concepts** → Architecture, recording lifecycle, M3U pipeline
**Examples** → ffmpeg recording commands
**Guides** → Build phases, adding services
**Lookup** → API endpoints, file paths, commands
**Errors** → ffmpeg gotchas, IPTV/M3U issues

---

## Related Context

- **Source of truth** → `../../AnywhereDVR-Technical-Spec.md`
- **Agent instructions** → `../../CLAUDE.md`
