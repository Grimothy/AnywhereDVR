<!-- Context: anywheredvr/errors | Priority: high | Version: 1.0 | Updated: 2026-03-29 -->
# Errors: IPTV / M3U / Xtream

**Purpose**: Common errors with IPTV sources, M3U parsing, and Xtream Codes API
**Last Updated**: 2026-03-29

## Error: M3U Parser Returns Zero Channels

**Symptom**:
```
Source sync completes but no channels stored in database
```

**Cause**: M3U format mismatch — file may not have `#EXTM3U` header, or `#EXTINF` lines use non-standard formatting.

**Solution**:
1. Log the raw M3U content (first 20 lines) for debugging
2. Check for BOM (byte order mark) at file start — strip it
3. Handle both `\r\n` and `\n` line endings
4. Ensure parser matches `#EXTINF:` case-insensitively

**Prevention**: Test parser with multiple M3U samples (standard, plus, minimal).
**Frequency**: occasional

**Code References**:
- Error source: `packages/server/src/services/m3u-parser.ts`

---

## Error: EPG Programs Not Linking to Channels

**Symptom**:
```
EPG data loaded but guide shows "No programs" for channels
```

**Cause**: XMLTV `channel@id` doesn't match any channel's `tvgId` field. Providers often use inconsistent IDs between M3U and XMLTV.

**Solution**:
1. Match XMLTV `channel@id` → `Channel.tvgId` (primary)
2. Fallback: match XMLTV `display-name` → `Channel.tvgName` or `Channel.name`
3. Log unmatched XMLTV channels for debugging

**Code**:
```typescript
// ❌ Strict match only — misses many channels
const channel = channels.find(c => c.tvgId === xmltvId);

// ✅ Multi-strategy matching
const channel = channels.find(c => c.tvgId === xmltvId)
  || channels.find(c => c.tvgName?.toLowerCase() === displayName.toLowerCase())
  || channels.find(c => c.name.toLowerCase() === displayName.toLowerCase());
```

**Prevention**: Implement multi-strategy channel matching in EPG manager.
**Frequency**: common

**Code References**:
- Error source: `packages/server/src/services/epg-manager.ts`
- Matching logic: `packages/server/src/services/xmltv-parser.ts`

---

## Error: XMLTV Date Parsing Produces Wrong Times

**Symptom**:
```
Programs appear at wrong times in the guide (off by hours)
```

**Cause**: XMLTV dates include timezone offsets (`20260328210000 +0000` or `+0500`) that were ignored during parsing.

**Solution**:
1. Parse the full date string including offset: `YYYYMMDDHHmmss +HHMM`
2. Convert to UTC before storing in PostgreSQL
3. Never assume offset is `+0000`

**Code**:
```typescript
// ❌ Ignores timezone offset
const date = parse('20260328210000', 'yyyyMMddHHmmss');

// ✅ Includes offset
const date = parse('20260328210000 +0000', 'yyyyMMddHHmmss X');
```

**Prevention**: Always parse the full XMLTV date format with offset.
**Frequency**: common

**Code References**:
- Error source: `packages/server/src/services/xmltv-parser.ts`

---

## Error: Xtream API Returns Empty or 404

**Symptom**:
```
XC source sync fails — no categories or streams returned
```

**Cause**: Not all Xtream Codes providers implement all API endpoints. Some return 404 for certain actions, some return empty arrays, some return malformed JSON.

**Solution**:
1. Wrap each XC API call in try/catch
2. Handle HTTP 404 gracefully (return empty arrays)
3. Validate response shape with zod before processing
4. Log which endpoints failed for provider debugging

**Prevention**: Never assume all XC endpoints are available. Always handle partial responses.
**Frequency**: occasional

**Code References**:
- Error source: `packages/server/src/services/xtream-client.ts`

---

## Error: Filename Contains Illegal Characters

**Symptom**:
```
ENOENT or EINVAL errors when creating recording files
```

**Cause**: Show titles from EPG contain characters illegal in filesystem paths: `/ \ : * ? " < > |`

**Solution**:
1. Replace illegal chars with hyphens: `title.replace(/[/\\:*?"<>|]/g, '-')`
2. Trim leading/trailing whitespace and dots
3. Limit total path length to 255 characters
4. Handle empty string after sanitization (use fallback name)

**Prevention**: All filenames go through `file-namer.ts` sanitization — never construct paths manually.
**Frequency**: common

**Code References**:
- Prevention: `packages/server/src/services/file-namer.ts`

---

## Error: Compressed XMLTV Feed Fails to Parse

**Symptom**:
```
fast-xml-parser throws on XMLTV content — not valid XML
```

**Cause**: Many EPG providers serve XMLTV as gzip-compressed (`.xml.gz`). The raw response is binary, not XML.

**Solution**:
1. Check response `Content-Encoding` or URL extension for `.gz`
2. Decompress with `zlib.gunzip()` before parsing
3. Handle both compressed and uncompressed responses

**Prevention**: EPG manager should auto-detect and decompress gzip feeds.
**Frequency**: common

**Code References**:
- Error source: `packages/server/src/services/epg-manager.ts`

## 📂 Codebase References

**Error Handling**:
- `packages/server/src/services/m3u-parser.ts` - M3U parse errors
- `packages/server/src/services/xmltv-parser.ts` - XMLTV parse errors
- `packages/server/src/services/xtream-client.ts` - XC API errors
- `packages/server/src/services/file-namer.ts` - Filename sanitization

## Related

- concepts/m3u-in-m3u-out.md
- errors/ffmpeg-errors.md
