<!-- Context: anywheredvr/errors | Priority: high | Version: 1.0 | Updated: 2026-03-29 -->
# Errors: ffmpeg

**Purpose**: Common ffmpeg errors and gotchas when recording IPTV streams
**Last Updated**: 2026-03-29

## Error: HLS Playback Shows "Stream Ended" Immediately

**Symptom**:
```
Players report stream is complete after first segment
```

**Cause**: Missing `-hls_flags omit_endlist`. Without this flag, ffmpeg writes `#EXT-X-ENDLIST` after each segment update, telling players the stream is finished.

**Solution**:
1. Ensure ffmpeg command includes `-hls_flags append_list+omit_endlist`
2. Verify with: `tail -5 /recordings/live/{id}/stream.m3u8` — should NOT contain `#EXT-X-ENDLIST` while recording

**Code**:
```bash
# ❌ Before — playback breaks
ffmpeg -i "{url}" -c copy -f hls -hls_time 6 output.m3u8

# ✅ After — play-while-recording works
ffmpeg -i "{url}" -c copy -f hls -hls_time 6 -hls_list_size 0 -hls_flags append_list+omit_endlist output.m3u8
```

**Prevention**: Always use the full flag set from the spec. Never modify ffmpeg flags without testing playback.
**Frequency**: common

**Code References**:
- Error source: `packages/server/src/services/recorder.ts`

---

## Error: Old Segments Disappear from Playlist

**Symptom**:
```
Seeking to beginning of recording fails — early segments missing from m3u8
```

**Cause**: Missing `-hls_list_size 0`. Default behavior keeps only the last few segments in the playlist, removing older ones.

**Solution**:
1. Add `-hls_list_size 0` to keep ALL segments in the playlist
2. This allows full seekability from the beginning of the recording

**Prevention**: Always include `-hls_list_size 0` in ffmpeg HLS commands.
**Frequency**: common

---

## Error: Last Segment Corrupted After Stop

**Symptom**:
```
Final seconds of recording are garbled or missing
```

**Cause**: Used SIGKILL instead of SIGINT to stop ffmpeg. SIGKILL terminates immediately without writing the final segment.

**Solution**:
1. Send SIGINT first (graceful stop)
2. Wait up to 10 seconds for process to exit
3. Only SIGKILL as last resort after timeout

**Code**:
```typescript
// ❌ Before — corrupts last segment
process.kill('SIGKILL');

// ✅ After — graceful shutdown
process.kill('SIGINT');
setTimeout(() => {
  if (!exited) process.kill('SIGKILL');
}, 10000);
```

**Prevention**: Always follow SIGINT → wait → SIGKILL pattern.
**Frequency**: common

**Code References**:
- Error source: `packages/server/src/services/recorder.ts`

---

## Error: ffmpeg Exits with "Connection Refused" or Timeout

**Symptom**:
```
ffmpeg: Connection to tcp://... failed: Connection refused
```

**Cause**: Stream URL has expired. Some IPTV providers generate time-limited URLs.

**Solution**:
1. Catch the ffmpeg exit with non-zero code
2. Re-fetch the channel's stream URL from source (re-parse M3U or re-query XC API)
3. Retry once with the fresh URL
4. If retry fails, mark recording as FAILED

**Prevention**: Implement the retry-once-with-fresh-URL pattern in the recorder.
**Frequency**: occasional

**Code References**:
- Error handler: `packages/server/src/services/recorder.ts`
- URL refresh: `packages/server/src/services/source-manager.ts`

---

## Error: ffmpeg "No such file or directory" for Output

**Symptom**:
```
/recordings/live/{id}/stream.m3u8: No such file or directory
```

**Cause**: Output directory was not created before spawning ffmpeg.

**Solution**:
1. Always `mkdir -p /recordings/live/{recording.id}/` before spawning ffmpeg

**Prevention**: Directory creation is step 1 of the recorder `start()` method.
**Frequency**: rare

---

## Error: Server Crash Leaves Orphaned ffmpeg Processes

**Symptom**:
```
ffmpeg processes running with no parent, recordings stuck in RECORDING status
```

**Cause**: Server crashed or restarted without graceful shutdown. The `activeRecordings` Map is lost.

**Solution**:
1. On server startup, query all recordings with `status=RECORDING`
2. Mark them as `FAILED` with error "Server restarted during recording"
3. Orphaned ffmpeg processes will eventually exit when their input stream closes

**Prevention**: Implement crash recovery in the boot sequence (`index.ts`).
**Frequency**: rare

**Code References**:
- Error handler: `packages/server/src/index.ts` (startup recovery)

## 📂 Codebase References

**Error Handling**:
- `packages/server/src/services/recorder.ts` - ffmpeg process management
- `packages/server/src/index.ts` - Crash recovery on startup

**Prevention Logic**:
- `packages/server/src/services/source-manager.ts` - URL refresh for stale streams

## Related

- concepts/recording-lifecycle.md
- examples/recording-ffmpeg.md
