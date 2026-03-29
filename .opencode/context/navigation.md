# AnywhereDVR Context Navigation

**Purpose**: Root navigation for all project context files

---

## Structure

```
.opencode/context/
├── navigation.md
└── anywheredvr/
    ├── navigation.md
    ├── concepts/
    │   ├── architecture.md
    │   ├── recording-lifecycle.md
    │   └── m3u-in-m3u-out.md
    ├── examples/
    │   └── recording-ffmpeg.md
    ├── guides/
    │   ├── implementation-phases.md
    │   └── adding-service.md
    ├── lookup/
    │   ├── api-endpoints.md
    │   ├── file-locations.md
    │   └── commands.md
    └── errors/
        ├── ffmpeg-errors.md
        └── iptv-errors.md
```

---

## Quick Routes

| Task | Path |
|------|------|
| **Understand the system** | `anywheredvr/concepts/architecture.md` |
| **Recording state machine** | `anywheredvr/concepts/recording-lifecycle.md` |
| **M3U pipeline** | `anywheredvr/concepts/m3u-in-m3u-out.md` |
| **API reference** | `anywheredvr/lookup/api-endpoints.md` |
| **Find a file** | `anywheredvr/lookup/file-locations.md` |
| **Dev commands** | `anywheredvr/lookup/commands.md` |
| **Build order** | `anywheredvr/guides/implementation-phases.md` |
| **Add a service** | `anywheredvr/guides/adding-service.md` |
| **ffmpeg issues** | `anywheredvr/errors/ffmpeg-errors.md` |
| **IPTV issues** | `anywheredvr/errors/iptv-errors.md` |
| **ffmpeg examples** | `anywheredvr/examples/recording-ffmpeg.md` |

---

## Loading Strategy

**For backend work**: architecture.md → file-locations.md → api-endpoints.md
**For recording work**: recording-lifecycle.md → recording-ffmpeg.md → ffmpeg-errors.md
**For frontend work**: architecture.md → api-endpoints.md → file-locations.md
**For new contributors**: architecture.md → implementation-phases.md → commands.md

---

## Source of Truth

**Technical Spec**: `AnywhereDVR-Technical-Spec.md` (root) — the authoritative specification
