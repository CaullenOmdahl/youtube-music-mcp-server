import { createLogger } from '../utils/logger.js';
import { MusicBrainzClient } from '../musicbrainz/client.js';
import { ListenBrainzClient } from '../listenbrainz/client.js';
import { YouTubeMusicClient } from '../youtube-music/client.js';
import type { MBArtist, MBRecording, Song, LBRecording } from '../types/index.js';

const logger = createLogger('recommendation-engine');

export interface RecommendationOptions {
  excludeArtists?: string[];
  preferTags?: string[];
  avoidTags?: string[];
  diversity?: 'focused' | 'balanced' | 'diverse';
  limit?: number;
}

export interface RecommendationResult {
  songs: Song[];
  notFound: Array<{ title: string; artist: string }>;
}

export class RecommendationEngine {
  private mbClient: MusicBrainzClient;
  private lbClient: ListenBrainzClient;
  private ytClient: YouTubeMusicClient;

  constructor(
    mbClient: MusicBrainzClient,
    lbClient: ListenBrainzClient,
    ytClient: YouTubeMusicClient
  ) {
    this.mbClient = mbClient;
    this.lbClient = lbClient;
    this.ytClient = ytClient;

    logger.info('Recommendation engine initialized');
  }

  /**
   * Resolve artist name to MBID and get tags
   */
  async resolveArtist(name: string): Promise<MBArtist | null> {
    logger.debug('Resolving artist', { name });

    try {
      const artists = await this.mbClient.searchArtist(name, 1);
      if (artists.length === 0) {
        logger.warn('Artist not found', { name });
        return null;
      }

      const artist = artists[0];
      if (!artist) return null;

      // Get tags for the artist
      const tags = await this.mbClient.getArtistTags(artist.mbid);

      return {
        ...artist,
        tags: tags.slice(0, 10),
      };
    } catch (error) {
      logger.error('Failed to resolve artist', { name, error });
      return null;
    }
  }

  /**
   * Resolve track to MBID
   */
  async resolveTrack(title: string, artist: string): Promise<MBRecording | null> {
    logger.debug('Resolving track', { title, artist });

    try {
      const recordings = await this.mbClient.searchRecording(title, artist, 1);
      if (recordings.length === 0) {
        logger.warn('Track not found', { title, artist });
        return null;
      }

      return recordings[0] ?? null;
    } catch (error) {
      logger.error('Failed to resolve track', { title, artist, error });
      return null;
    }
  }

  /**
   * Build recommendations from seed artists
   */
  async buildRecommendations(
    seedArtists: MBArtist[],
    seedTracks: MBRecording[],
    options: RecommendationOptions = {}
  ): Promise<LBRecording[]> {
    const {
      excludeArtists = [],
      preferTags = [],
      avoidTags = [],
      diversity = 'balanced',
      limit = 50,
    } = options;

    logger.debug('Building recommendations', {
      seedArtists: seedArtists.length,
      seedTracks: seedTracks.length,
      diversity,
      limit,
    });

    // Build prompt for LB Radio
    const artistNames = seedArtists.map((a) => a.name);
    const prompt = ListenBrainzClient.buildArtistPrompt(artistNames);

    // Get recordings from LB Radio
    const mode = ListenBrainzClient.diversityToMode(diversity);
    let recordings = await this.lbClient.getLBRadioRecordings(
      mode,
      prompt,
      limit * 2 // Get extra for filtering
    );

    // Filter excluded artists
    if (excludeArtists.length > 0) {
      const excludeLower = excludeArtists.map((a) => a.toLowerCase());
      recordings = recordings.filter(
        (rec) => !excludeLower.includes(rec.creator.toLowerCase())
      );
    }

    // Score and sort by tag preferences
    if (preferTags.length > 0 || avoidTags.length > 0) {
      recordings = await this.scoreByTags(recordings, preferTags, avoidTags);
    }

    return recordings.slice(0, limit);
  }

  /**
   * Score recordings by tag preferences
   */
  private async scoreByTags(
    recordings: LBRecording[],
    preferTags: string[],
    avoidTags: string[]
  ): Promise<LBRecording[]> {
    // For simplicity, we'll score based on artist tags
    // In a full implementation, we'd look up each recording's tags

    const scored: Array<{ rec: LBRecording; score: number }> = [];

    for (const rec of recordings) {
      let score = 0;

      // Look up artist to get tags
      try {
        const artists = await this.mbClient.searchArtist(rec.creator, 1);
        if (artists.length > 0 && artists[0]) {
          const tags = await this.mbClient.getArtistTags(artists[0].mbid);
          const tagNames = tags.map((t) => t.name.toLowerCase());

          for (const tag of preferTags) {
            if (tagNames.includes(tag.toLowerCase())) {
              score += 1;
            }
          }

          for (const tag of avoidTags) {
            if (tagNames.includes(tag.toLowerCase())) {
              score -= 2;
            }
          }
        }
      } catch {
        // Skip scoring if lookup fails
      }

      scored.push({ rec, score });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.map((s) => s.rec);
  }

  /**
   * Search YouTube Music for recommended recordings
   */
  async searchOnYouTubeMusic(
    recordings: LBRecording[]
  ): Promise<RecommendationResult> {
    logger.debug('Searching YouTube Music for recommendations', {
      count: recordings.length,
    });

    const songs: Song[] = [];
    const notFound: Array<{ title: string; artist: string }> = [];

    for (const rec of recordings) {
      const query = `${rec.title} ${rec.creator}`;

      try {
        const searchResult = await this.ytClient.search(query, {
          filter: 'songs',
          limit: 1,
        });

        if (searchResult.songs && searchResult.songs.length > 0) {
          const song = searchResult.songs[0];
          if (song) {
            songs.push({
              ...song,
              // Mark as recommendation source
            });
          }
        } else {
          notFound.push({
            title: rec.title,
            artist: rec.creator,
          });
        }
      } catch (error) {
        logger.warn('Track search failed', {
          title: rec.title,
          artist: rec.creator,
          error,
        });
        notFound.push({
          title: rec.title,
          artist: rec.creator,
        });
      }
    }

    logger.info('YouTube Music search complete', {
      found: songs.length,
      notFound: notFound.length,
    });

    return { songs, notFound };
  }

  /**
   * Get aggregate tags from seed artists
   */
  getAggregatedTags(seedArtists: MBArtist[]): Map<string, number> {
    const tagCounts = new Map<string, number>();

    for (const artist of seedArtists) {
      if (artist.tags) {
        for (const tag of artist.tags) {
          const current = tagCounts.get(tag.name) ?? 0;
          tagCounts.set(tag.name, current + tag.count);
        }
      }
    }

    return tagCounts;
  }

  /**
   * Get top tags from aggregated tags
   */
  getTopTags(tagCounts: Map<string, number>, limit: number = 10): string[] {
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name]) => name);
  }
}
