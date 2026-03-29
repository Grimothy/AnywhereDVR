<!-- Context: anywheredvr/examples | Priority: high | Version: 1.0 | Updated: 2026-03-29 -->
# Example: ffmpeg Recording Commands

**Purpose**: Exact ffmpeg commands used for IPTV stream recording
**Last Updated**: 2026-03-29

## Use Case

AnywhereDVR captures IPTV streams using ffmpeg in HLS mode, producing seekable segments that support play-while-recording. These are the exact command patterns the recorder service must use.

## Code

### HLS Recording (primary — works for both HLS and MPEG-TS input)

```bash
ffmpeg -y \
  -i "{streamUrl}" \
  -c copy \
  -copyts \
  -start_at_zero \
  -f hls \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_flags append_list+omit_endlist \
  -hls_segment_filename "/recordings/live/{id}/segment_%04d.ts" \
  "/recordings/live/{id}/stream.m3u8"
```

### HLS Concatenation (post-processing — combine segments into single file)

```bash
ffmpeg -y \
  -i "/recordings/live/{id}/stream.m3u8" \
  -c copy \
  "output.ts"
```

### Single-File HLS Wrapper (serve completed recording as HLS)

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:{duration}
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:{duration},
/recordings/{id}/file.ts
#EXT-X-ENDLIST
```

## Explanation

1. `-c copy` — No transcoding, just remux (fast, zero CPU)
2. `-copyts` — Preserve original timestamps from the stream
3. `-start_at_zero` — Reset timestamps to start from 0 (proper seeking)
4. `-f hls` — Output as HLS segments
5. `-hls_time 6` — Target 6-second segments
6. `-hls_list_size 0` — Keep ALL segments in playlist (full seekability)
7. `-hls_flags append_list+omit_endlist` — Keep appending + don't write end tag (live playback)

**Key points**:
- `omit_endlist` is **critical**: without it, players think the stream is complete
- `hls_list_size 0` is **critical**: without it, old segments drop from the playlist
- ffmpeg auto-detects input format — same command works for `.m3u8` and `.ts` inputs
- After stopping, manually append `#EXT-X-ENDLIST` to the m3u8 to mark stream as VOD

## Graceful Stop Sequence

```typescript
// 1. Send SIGINT for graceful finalization
childProcess.kill('SIGINT');

// 2. Wait for exit (writes final segment)
const timeout = setTimeout(() => {
  childProcess.kill('SIGKILL'); // last resort
}, 10000);

childProcess.on('exit', () => {
  clearTimeout(timeout);
  // 3. Mark stream as complete
  appendFileSync(m3u8Path, '\n#EXT-X-ENDLIST\n');
});
```

## 📂 Codebase References

**Full Implementation**:
- `packages/server/src/services/recorder.ts` - ffmpeg spawn/monitor/kill
- `packages/server/src/services/post-processor.ts` - HLS concatenation

**Related Code**:
- `packages/server/src/services/m3u-generator.ts` - HLS wrapper for completed recordings

## Related

- concepts/recording-lifecycle.md
- errors/ffmpeg-errors.md
