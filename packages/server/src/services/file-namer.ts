// packages/server/src/services/file-namer.ts

import { join, dirname } from 'node:path';

/**
 * FileNamer — Generates filesystem-safe paths for completed recordings.
 *
 * Naming conventions:
 *   With season/episode:  {Show}/Season {XX}/{Show} - S{XX}E{XX} - {Title}.ts
 *   With episode only:    {Show}/{Show} - E{XX} - {Title}.ts
 *   Date-based fallback:  {Show}/{Show} - {YYYY-MM-DD} - {Title}.ts
 *   No title fallback:    {Show}/{Show} - {YYYY-MM-DD}.ts
 *
 * Sanitization: replace / \ : * ? " < > | with hyphens, collapse whitespace,
 * trim edges, limit total path to 255 chars.
 */

/** Characters illegal on Windows + Unix filesystems */
const ILLEGAL_CHARS_RE = /[/\\:*?"<>|]/g;

/**
 * Sanitize a single path component (show name, episode title, etc.)
 * Replaces illegal chars with hyphens, collapses multiple hyphens/spaces,
 * and trims leading/trailing whitespace and dots.
 */
export function sanitizeComponent(raw: string): string {
  const sanitized = raw
    .replace(ILLEGAL_CHARS_RE, '-')       // replace illegal chars
    .replace(/\s+/g, ' ')                 // collapse whitespace
    .replace(/-{2,}/g, '-')               // collapse consecutive hyphens
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');     // strip leading/trailing dots+spaces

  // Prevent path traversal components
  if (sanitized === '..' || sanitized === '.') return 'Unknown';

  return sanitized || 'Unknown';
}

export interface NamingInput {
  title: string;          // Show name
  subtitle?: string | null;
  season?: number | null;
  episode?: number | null;
  scheduledStart: Date;   // Used for date-based fallback
}

export interface NamingResult {
  /** Relative path from recordings root, e.g. "library/Show/Season 01/Show - S01E03 - Title.ts" */
  relativePath: string;
  /** Relative directory, e.g. "library/Show/Season 01" */
  relativeDir: string;
  /** Final filename, e.g. "Show - S01E03 - Title.ts" */
  filename: string;
}

/**
 * Build the target path for a completed recording.
 * All paths are relative to the recordings base path root.
 */
export function buildRecordingPath(input: NamingInput): NamingResult {
  const showName = sanitizeComponent(input.title);
  const dateStr = formatDate(input.scheduledStart);

  let dir: string;
  let filename: string;

  if (input.season != null && input.episode != null) {
    // Season + episode: library/{Show}/Season {XX}/{Show} - S{XX}E{XX} - {Title}.ts
    const seasonFolder = `Season ${String(input.season).padStart(2, '0')}`;
    dir = join('library', showName, seasonFolder);

    const epTag = `S${String(input.season).padStart(2, '0')}E${String(input.episode).padStart(2, '0')}`;
    const epTitle = input.subtitle ? ` - ${sanitizeComponent(input.subtitle)}` : '';
    filename = `${showName} - ${epTag}${epTitle}.ts`;
  } else if (input.episode != null) {
    // Episode only (no season): library/{Show}/{Show} - E{XX} - {Title}.ts
    dir = join('library', showName);
    const epTag = `E${String(input.episode).padStart(2, '0')}`;
    const epTitle = input.subtitle ? ` - ${sanitizeComponent(input.subtitle)}` : '';
    filename = `${showName} - ${epTag}${epTitle}.ts`;
  } else {
    // Date-based fallback: library/{Show}/{Show} - {YYYY-MM-DD} - {Title}.ts
    dir = join('library', showName);
    const epTitle = input.subtitle ? ` - ${sanitizeComponent(input.subtitle)}` : '';
    filename = `${showName} - ${dateStr}${epTitle}.ts`;
  }

  // Enforce 255-char limit on total relative path
  const relativePath = enforcePathLimit(join(dir, filename), showName, dateStr);

  return {
    relativePath,
    relativeDir: dirname(relativePath),
    filename: relativePath.split('/').pop() ?? filename,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * If the relative path exceeds 255 chars, truncate the filename stem
 * (preserving the .ts extension) to fit.
 */
function enforcePathLimit(relativePath: string, showName: string, dateStr: string): string {
  if (relativePath.length <= 255) return relativePath;

  const parts = relativePath.split('/');
  const dir = parts.slice(0, -1).join('/');
  const ext = '.ts';
  const maxStem = 255 - dir.length - 1 /* slash */ - ext.length;

  if (maxStem < 1) {
    // Extreme edge case — use bare minimum name
    return `${dir}/${showName.slice(0, 20)}-${dateStr}${ext}`;
  }

  const stem = parts[parts.length - 1].slice(0, -ext.length).slice(0, maxStem);
  return `${dir}/${stem}${ext}`;
}
