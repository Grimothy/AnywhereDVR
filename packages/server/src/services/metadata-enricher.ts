// packages/server/src/services/metadata-enricher.ts

import { db } from '../db.js';
import { logger } from '../logger.js';
import { getTmdbClient } from './tmdb-client.js';
import { config } from '../config.js';

/**
 * Normalize a show title for consistent cache lookups.
 * Lowercase, trim, collapse multiple spaces.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/the\s+/i, '') // Strip leading "The " for better matching
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * MetadataEnricher
 *
 * Runs TMDB lookups for EPG program titles and caches results in the ShowMetadata table.
 * Called during EPG refresh so the guide is pre-enriched before the user browses.
 *
 * Key design decisions:
 * - Lookup is keyed by normalized title (no "The ", lowercase, trimmed)
 * - Per-season/episode stills stored separately (many episodes, one show)
 * - Runs in the background during EPG refresh — does not block program storage
 * - Idempotent: checks cache before TMDB call
 */
export class MetadataEnricher {
  private tmdb = () => getTmdbClient(config.tmdbApiKey);

  /**
   * Ensure metadata exists in cache for a given show title.
   * Returns the cached or freshly-fetched ShowMetadata record.
   * Does NOT update Programs — use enrichPrograms() for that.
   */
  async ensureMetadata(title: string): Promise<{
    id: string;
    posterUrl: string | null;
    backdropUrl: string | null;
    logoUrl: string | null;
    overview: string | null;
    genres: string[];
  } | null> {
    if (!config.tmdbApiKey) return null;

    const normalized = normalizeTitle(title);
    if (!normalized) return null;

    // Check cache
    const cached = await db.showMetadata.findUnique({
      where: { title: normalized },
    });

    if (cached) return cached;

    // Fresh TMDB lookup
    const match = await this.tmdb().enrich(title);
    if (!match) return null;

    try {
      const record = await db.showMetadata.upsert({
        where: { title: normalized },
        update: {
          tmdbId: match.tmdbId,
          tmdbType: match.tmdbType,
          posterUrl: match.posterUrl,
          backdropUrl: match.backdropUrl,
          logoUrl: match.logoUrl,
          overview: match.overview,
          genres: match.genres,
          firstAirDate: match.firstAirDate,
        },
        create: {
          title: normalized,
          tmdbId: match.tmdbId,
          tmdbType: match.tmdbType,
          posterUrl: match.posterUrl,
          backdropUrl: match.backdropUrl,
          logoUrl: match.logoUrl,
          overview: match.overview,
          genres: match.genres,
          firstAirDate: match.firstAirDate,
        },
      });

      logger.debug({ title: normalized, tmdbId: match.tmdbId }, 'ShowMetadata cached');
      return record;
    } catch (err) {
      logger.warn({ err, title: normalized }, 'Failed to cache ShowMetadata');
      return null;
    }
  }

  /**
   * Batch-enrich a set of program titles that appeared in the EPG refresh.
   * Deduplicates by normalized title and does one TMDB lookup per unique show.
   * Runs asynchronously — does not block the EPG store operation.
   */
  async enrichTitlesInBackground(titles: string[]): Promise<void> {
    if (!config.tmdbApiKey) return;

    const uniqueTitles = [...new Set(titles.map(normalizeTitle).filter(Boolean))];

    logger.info({ count: uniqueTitles.length }, 'Starting background metadata enrichment');

    // Process in chunks of 5 to avoid hammering TMDB API
    const chunkSize = 5;
    for (let i = 0; i < uniqueTitles.length; i += chunkSize) {
      const chunk = uniqueTitles.slice(i, i + chunkSize);

      await Promise.allSettled(
        chunk.map(title => this.ensureMetadata(title)),
      );

      // Small delay between chunks to be polite to TMDB
      if (i + chunkSize < uniqueTitles.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    logger.info({ count: uniqueTitles.length }, 'Background metadata enrichment complete');
  }

  /**
   * Get metadata for a specific program (title + season + episode).
   * Returns posterUrl preferring episode still over show poster.
   */
  async getProgramMetadata(
    title: string,
    season?: number | null,
    episode?: number | null,
  ): Promise<{
    posterUrl: string | null;
    backdropUrl: string | null;
    logoUrl: string | null;
    overview: string | null;
    genres: string[];
  } | null> {
    const base = await this.ensureMetadata(title);
    if (!base) return null;

    // If no season/episode, return show-level metadata
    if (!season || !episode) return base;

    // Fetch episode still via TMDB and overlay it
    const tmdb = this.tmdb();
    const tvMatch = await tmdb.searchTv(title, season, episode);
    if (!tvMatch) return base;

    return {
      posterUrl: tvMatch.episodeStillUrl ?? base.posterUrl,
      backdropUrl: base.backdropUrl,
      logoUrl: base.logoUrl,
      overview: base.overview,
      genres: base.genres,
    };
  }
}

// Singleton instance
export const metadataEnricher = new MetadataEnricher();
