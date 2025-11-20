import type {
  Profile,
  Context,
  Track,
  RecommendationResult,
  Database,
  AdaptivePlaylistContext,
} from './types.js';
import { SongFeatureExtractor } from './song-features.js';
import { calculateFinalScore } from './scoring/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('recommendation-engine');

/**
 * Recommendation engine - generates personalized playlists using scoring system
 */
export class RecommendationEngine {
  private featureExtractor: SongFeatureExtractor;

  constructor(
    private context: AdaptivePlaylistContext,
    private db: Database
  ) {
    // Note: context.musicBrainz should be an instance of MusicBrainzClient
    // We're passing it directly assuming the ServerContext provides the proper type
    this.featureExtractor = new SongFeatureExtractor(context.musicBrainz as any, db);
  }

  /**
   * Generate recommendations for a profile
   */
  async generateRecommendations(
    profile: Profile,
    context: Context,
    targetCount: number = 30,
    searchQueries?: string[]
  ): Promise<RecommendationResult[]> {
    logger.info('Generating recommendations', {
      userId: profile.userId,
      targetCount,
      confidence: profile.confidence,
    });

    // Step 1: Get candidate tracks
    const candidates = await this.getCandidates(profile, searchQueries);
    logger.debug('Retrieved candidates', { count: candidates.length });

    if (candidates.length === 0) {
      logger.warn('No candidates found, using fallback search');
      const fallbackCandidates = await this.getFallbackCandidates();
      candidates.push(...fallbackCandidates);
    }

    // Step 2: Extract features for all candidates
    const tracksWithFeatures = await this.extractFeaturesForCandidates(candidates);
    logger.debug('Extracted features', { count: tracksWithFeatures.length });

    // Step 3: Enrich with user-specific data
    const enrichedTracks = await this.enrichWithUserData(tracksWithFeatures, profile.userId!);

    // Step 4: Score each track
    const scoredTracks = enrichedTracks.map((track) => {
      const scoring = calculateFinalScore(track, profile, context);

      return {
        track,
        score: scoring.finalScore,
        breakdown: scoring.breakdown,
        modulation: scoring.modulation,
        exploration: scoring.exploration,
      } as RecommendationResult;
    });

    // Step 5: Sort by score descending
    scoredTracks.sort((a, b) => b.score - a.score);

    // Step 6: Apply diversity filtering
    const diverseRecommendations = this.applyDiversityFiltering(
      scoredTracks,
      targetCount,
      profile
    );

    logger.info('Recommendations generated', {
      candidates: candidates.length,
      scored: scoredTracks.length,
      returned: diverseRecommendations.length,
      avgScore: diverseRecommendations.reduce((sum, r) => sum + r.score, 0) / diverseRecommendations.length,
    });

    return diverseRecommendations;
  }

  /**
   * Get candidate tracks from YouTube Music
   */
  private async getCandidates(
    profile: Profile,
    searchQueries?: string[]
  ): Promise<{ videoId: string; title: string; artist: string; year?: number }[]> {
    const candidates: { videoId: string; title: string; artist: string; year?: number }[] = [];

    try {
      // Use provided search queries or generate from profile
      const queries =
        searchQueries || this.generateSearchQueries(profile);

      for (const query of queries.slice(0, 5)) {
        // Limit to 5 queries
        try {
          const searchResult = await this.context.ytMusic.search(query, {
            filter: 'songs',
            limit: 20,
          });

          const songs = (searchResult as { songs?: unknown[] })?.songs || [];

          for (const song of songs.slice(0, 15)) {
            // Max 15 per query
            const s = song as {
              videoId: string;
              title: string;
              artists: { name: string }[];
              year?: number;
            };

            candidates.push({
              videoId: s.videoId,
              title: s.title,
              artist: s.artists?.[0]?.name || 'Unknown',
              year: s.year,
            });
          }
        } catch (error) {
          logger.warn('Search query failed', { query, error });
        }
      }

      // Also get from user's library
      try {
        const librarySongs = await this.context.ytMusic.getLibrarySongs(50);

        for (const song of librarySongs.slice(0, 30)) {
          const s = song as {
            videoId: string;
            title: string;
            artists: { name: string }[];
            year?: number;
          };

          candidates.push({
            videoId: s.videoId,
            title: s.title,
            artist: s.artists?.[0]?.name || 'Unknown',
            year: s.year,
          });
        }
      } catch (error) {
        logger.debug('Failed to get library songs', { error });
      }
    } catch (error) {
      logger.error('Failed to get candidates', { error });
    }

    // Deduplicate by videoId
    const uniqueCandidates = Array.from(
      new Map(candidates.map((c) => [c.videoId, c])).values()
    );

    return uniqueCandidates;
  }

  /**
   * Generate search queries from profile
   */
  private generateSearchQueries(profile: Profile): string[] {
    const queries: string[] = [];

    // Based on familiar styles
    if (profile.familiarStyles) {
      for (const genre of profile.familiarStyles.genres.slice(0, 3)) {
        queries.push(genre);
      }
    }

    // Based on MUSIC dimensions
    if (profile.dimensions.mellow > 25) {
      queries.push('relaxing music', 'chill music');
    }
    if (profile.dimensions.intense > 25) {
      queries.push('energetic music', 'intense music');
    }
    if (profile.dimensions.sophisticated > 25) {
      queries.push('jazz', 'classical');
    }
    if (profile.dimensions.contemporary > 25) {
      queries.push('pop hits', 'new music');
    }

    // Based on activity
    if (profile.activity === 1) {
      queries.push('workout music', 'gym music');
    } else if (profile.activity === 2) {
      queries.push('study music', 'focus music');
    } else if (profile.activity === 3) {
      queries.push('relaxing music', 'meditation music');
    }

    // Fallback
    if (queries.length === 0) {
      queries.push('popular music', 'top songs');
    }

    return queries;
  }

  /**
   * Get fallback candidates when search fails
   */
  private async getFallbackCandidates(): Promise<
    { videoId: string; title: string; artist: string; year?: number }[]
  > {
    try {
      const searchResult = await this.context.ytMusic.search('popular music', {
        filter: 'songs',
        limit: 50,
      });

      const songs = (searchResult as { songs?: unknown[] })?.songs || [];

      return songs.slice(0, 30).map((song) => {
        const s = song as {
          videoId: string;
          title: string;
          artists: { name: string }[];
          year?: number;
        };

        return {
          videoId: s.videoId,
          title: s.title,
          artist: s.artists?.[0]?.name || 'Unknown',
          year: s.year,
        };
      });
    } catch (error) {
      logger.error('Fallback search failed', { error });
      return [];
    }
  }

  /**
   * Extract features for candidate tracks
   */
  private async extractFeaturesForCandidates(
    candidates: { videoId: string; title: string; artist: string; year?: number }[]
  ): Promise<Track[]> {
    const tracks: Track[] = [];

    for (const candidate of candidates) {
      try {
        const features = await this.featureExtractor.extractFeatures(
          candidate.videoId,
          candidate.title,
          candidate.artist,
          candidate.year
        );

        if (features) {
          tracks.push(features);
        }
      } catch (error) {
        logger.debug('Feature extraction failed for track', {
          videoId: candidate.videoId,
          error,
        });
      }
    }

    return tracks;
  }

  /**
   * Enrich tracks with user-specific data (play count, artist familiarity, etc.)
   */
  private async enrichWithUserData(tracks: Track[], userId: string): Promise<Track[]> {
    try {
      // Get user's listening history
      const historyResult = await this.db.query(
        'SELECT video_id, play_count, last_played_at FROM user_listening_history WHERE user_id = $1',
        [userId]
      );

      const historyMap = new Map<string, { playCount: number; lastPlayed: Date }>();
      for (const row of historyResult.rows) {
        const r = row as { video_id: string; play_count: number; last_played_at: Date };
        historyMap.set(r.video_id, {
          playCount: r.play_count,
          lastPlayed: new Date(r.last_played_at),
        });
      }

      // Get user's artist familiarity
      const artistsResult = await this.db.query(
        `SELECT artist, SUM(play_count) as total_plays
         FROM user_listening_history h
         JOIN song_features f ON h.video_id = f.video_id
         WHERE h.user_id = $1
         GROUP BY artist`,
        [userId]
      );

      const artistFamiliarityMap = new Map<string, number>();
      const maxPlays =
        artistsResult.rows.length > 0
          ? Math.max(...artistsResult.rows.map((r) => (r as { total_plays: number }).total_plays))
          : 1;

      for (const row of artistsResult.rows) {
        const r = row as { artist: string; total_plays: number };
        artistFamiliarityMap.set(r.artist, r.total_plays / maxPlays);
      }

      // Enrich tracks
      return tracks.map((track) => {
        const history = historyMap.get(track.videoId);
        const artistFamiliarity = artistFamiliarityMap.get(track.artist) || 0;

        return {
          ...track,
          userPlayCount: history?.playCount || 0,
          lastPlayedDate: history?.lastPlayed,
          artistFamiliarity,
          isNewArtist: artistFamiliarity === 0,
        };
      });
    } catch (error) {
      logger.error('Failed to enrich with user data', { error });
      return tracks;
    }
  }

  /**
   * Apply diversity filtering to ensure variety in recommendations
   */
  private applyDiversityFiltering(
    recommendations: RecommendationResult[],
    targetCount: number,
    profile: Profile
  ): RecommendationResult[] {
    const selected: RecommendationResult[] = [];
    const artistCounts = new Map<string, number>();
    const genreCounts = new Map<string, number>();

    // Calculate max per artist/genre based on discovery tolerance
    const discoveryLevel = profile.discovery.stated / 35;
    const maxPerArtist = discoveryLevel > 0.7 ? 5 : discoveryLevel > 0.4 ? 3 : 2;
    const maxPerGenre = Math.ceil(targetCount / 3);

    for (const rec of recommendations) {
      if (selected.length >= targetCount) break;

      const artist = rec.track.artist;
      const genres = rec.track.genres;

      // Check artist diversity
      const artistCount = artistCounts.get(artist) || 0;
      if (artistCount >= maxPerArtist) {
        continue; // Skip, too many from this artist
      }

      // Check genre diversity
      let genreOverflow = false;
      for (const genre of genres) {
        const genreCount = genreCounts.get(genre) || 0;
        if (genreCount >= maxPerGenre) {
          genreOverflow = true;
          break;
        }
      }
      if (genreOverflow && selected.length > targetCount / 2) {
        continue; // Skip, too many from this genre (but allow in first half)
      }

      // Add to selected
      selected.push(rec);
      artistCounts.set(artist, artistCount + 1);
      for (const genre of genres) {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      }
    }

    return selected;
  }
}
