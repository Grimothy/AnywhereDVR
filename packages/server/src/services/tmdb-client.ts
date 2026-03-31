// packages/server/src/services/tmdb-client.ts

import axios from 'axios';
import { logger } from '../logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TmdbMatch {
  tmdbId: number;
  tmdbType: 'tv' | 'movie';
  posterUrl: string | null;
  backdropUrl: string | null;
  logoUrl: string | null;
  overview: string | null;
  genres: string[];
  firstAirDate: string | null;
}

export interface TmdbEpisodeMatch extends TmdbMatch {
  episodeStillUrl: string | null;
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

// ── TmdbClient ────────────────────────────────────────────────────────────────

export class TmdbClient {
  constructor(private readonly apiKey: string) {}

  /**
   * Search for a TV show by title (optionally with season/episode).
   * Returns show-level metadata + optional episode still.
   */
  async searchTv(
    title: string,
    season?: number | null,
    episode?: number | null,
  ): Promise<TmdbEpisodeMatch | null> {
    try {
      // Step 1: Search for the show
      const searchRes = await axios.get<{
        results: Array<{
          id: number;
          name: string;
          poster_path: string | null;
          backdrop_path: string | null;
          overview: string | null;
          genre_ids: number[];
          first_air_date: string | null;
        }>;
      }>(`${TMDB_BASE}/search/tv`, {
        params: { api_key: this.apiKey, query: title },
        timeout: 10_000,
      });

      const results = searchRes.data?.results ?? [];
      if (results.length === 0) return null;

      const show = results[0];
      const genreMap = await this.getGenreMap();
      const genres = (show.genre_ids ?? [])
        .map((id: number) => genreMap[id])
        .filter(Boolean);

      // Step 2: Fetch show-level images (logo)
      const imagesRes = await this.getShowImages(show.id);
      const logoPath = imagesRes?.logos?.[0]?.file_path ?? null;
      const logoUrl = logoPath ? `${IMAGE_BASE}/w300${logoPath}` : null;

      // Step 3: Optionally fetch episode still
      let episodeStillUrl: string | null = null;
      if (season && episode) {
        episodeStillUrl = await this.getEpisodeStill(show.id, season, episode);
      }

      return {
        tmdbId: show.id,
        tmdbType: 'tv',
        posterUrl: show.poster_path ? `${IMAGE_BASE}/w500${show.poster_path}` : null,
        backdropUrl: show.backdrop_path ? `${IMAGE_BASE}/w1280${show.backdrop_path}` : null,
        logoUrl,
        overview: show.overview ?? null,
        genres,
        firstAirDate: show.first_air_date ?? null,
        episodeStillUrl,
      };
    } catch (err) {
      logger.debug({ title, err }, 'TMDB TV search failed');
      return null;
    }
  }

  /**
   * Search for a movie by title.
   */
  async searchMovie(title: string): Promise<TmdbMatch | null> {
    try {
      const searchRes = await axios.get<{
        results: Array<{
          id: number;
          title: string;
          poster_path: string | null;
          backdrop_path: string | null;
          overview: string | null;
          genre_ids: number[];
          release_date: string | null;
        }>;
      }>(`${TMDB_BASE}/search/movie`, {
        params: { api_key: this.apiKey, query: title },
        timeout: 10_000,
      });

      const results = searchRes.data?.results ?? [];
      if (results.length === 0) return null;

      const movie = results[0];
      const genreMap = await this.getGenreMap();
      const genres = (movie.genre_ids ?? [])
        .map((id: number) => genreMap[id])
        .filter(Boolean);

      return {
        tmdbId: movie.id,
        tmdbType: 'movie',
        posterUrl: movie.poster_path ? `${IMAGE_BASE}/w500${movie.poster_path}` : null,
        backdropUrl: movie.backdrop_path ? `${IMAGE_BASE}/w1280${movie.backdrop_path}` : null,
        logoUrl: null,
        overview: movie.overview ?? null,
        genres,
        firstAirDate: movie.release_date ?? null,
      };
    } catch (err) {
      logger.debug({ title, err }, 'TMDB movie search failed');
      return null;
    }
  }

  /**
   * Enrich a recording/show with TMDB metadata.
   * Tries TV first, falls back to movie.
   */
  async enrich(
    title: string,
    season?: number | null,
    episode?: number | null,
  ): Promise<TmdbMatch | null> {
    if (!this.apiKey) return null;

    const tvMatch = await this.searchTv(title, season, episode);
    if (tvMatch) return tvMatch;
    return this.searchMovie(title);
  }

  private async getShowImages(showId: number): Promise<{
    logos: Array<{ file_path: string; iso_639_1: string | null }>;
  } | null> {
    try {
      const res = await axios.get(`${TMDB_BASE}/tv/${showId}/images`, {
        params: { api_key: this.apiKey },
        timeout: 10_000,
      });
      return res.data ?? null;
    } catch {
      return null;
    }
  }

  private async getEpisodeStill(
    showId: number,
    season: number,
    episode: number,
  ): Promise<string | null> {
    try {
      const res = await axios.get<{ still_path: string | null }>(
        `${TMDB_BASE}/tv/${showId}/season/${season}/episode/${episode}/images`,
        { params: { api_key: this.apiKey }, timeout: 10_000 },
      );
      return res.data?.still_path ? `${IMAGE_BASE}/w500${res.data.still_path}` : null;
    } catch {
      return null;
    }
  }

  private _genreCache: Record<string, string> | null = null;

  private async getGenreMap(): Promise<Record<string, string>> {
    if (this._genreCache) return this._genreCache;

    try {
      const [tvRes, movieRes] = await Promise.all([
        axios.get<{ genres: Array<{ id: number; name: string }> }>(
          `${TMDB_BASE}/genre/tv/list`,
          { params: { api_key: this.apiKey }, timeout: 10_000 },
        ),
        axios.get<{ genres: Array<{ id: number; name: string }> }>(
          `${TMDB_BASE}/genre/movie/list`,
          { params: { api_key: this.apiKey }, timeout: 10_000 },
        ),
      ]);

      const map: Record<string, string> = {};
      for (const g of tvRes.data?.genres ?? []) {
        map[g.id] = g.name;
      }
      for (const g of movieRes.data?.genres ?? []) {
        map[g.id] = g.name;
      }
      this._genreCache = map;
    } catch {
      this._genreCache = {};
    }

    return this._genreCache ?? {};
  }
}

// Singleton — key loaded from config at runtime
let _client: TmdbClient | null = null;

export function getTmdbClient(apiKey: string): TmdbClient {
  if (!_client || (_client as unknown as { apiKey: string }).apiKey !== apiKey) {
    _client = new TmdbClient(apiKey);
  }
  return _client;
}
