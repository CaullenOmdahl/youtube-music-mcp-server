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
    // Note: context.musicBrainz and context.spotify should be instances of their respective clients
    // We're passing them directly assuming the ServerContext provides the proper types
    this.featureExtractor = new SongFeatureExtractor(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.musicBrainz as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.spotify as any,
      db
    );
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
    const userId = profile.userId || 'default_user';
    const enrichedTracks = await this.enrichWithUserData(tracksWithFeatures, userId);

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
   * Get candidate tracks from multiple sources (Reccobeats, YouTube Music, Library)
   */
  private async getCandidates(
    profile: Profile,
    searchQueries?: string[]
  ): Promise<{ videoId: string; title: string; artist: string; year?: number }[]> {
    const candidates: { videoId: string; title: string; artist: string; year?: number }[] = [];

    // SOURCE 1: Reccobeats (primary source for mood/seed-based discovery)
    if (this.context.reccobeats) {
      try {
        const shouldUseReccobeats =
          (profile.mood?.targetValence !== undefined && profile.mood.targetValence >= 0) ||
          (profile.mood?.targetArousal !== undefined && profile.mood.targetArousal >= 0) ||
          (profile.seedArtists && profile.seedArtists.length > 0) ||
          (profile.seedTracks && profile.seedTracks.length > 0);

        if (shouldUseReccobeats) {
          logger.debug('Using Reccobeats for candidate generation', {
            hasValence: profile.mood?.targetValence !== undefined,
            hasEnergy: profile.mood?.targetArousal !== undefined,
            seedArtists: profile.seedArtists?.length || 0,
            seedTracks: profile.seedTracks?.length || 0,
          });

          // Prepare Reccobeats params
          const reccobeatsParams: {
            targetValence?: number;
            targetEnergy?: number;
            seedArtists?: string[];
            limit?: number;
          } = {
            limit: 50,
          };

          // Map valence (0-35) to Reccobeats format (0.0-1.0)
          if (profile.mood?.targetValence !== undefined && profile.mood.targetValence >= 0) {
            reccobeatsParams.targetValence = profile.mood.targetValence / 35;
          }

          // Map arousal (0-35) to energy (0.0-1.0)
          if (profile.mood?.targetArousal !== undefined && profile.mood.targetArousal >= 0) {
            reccobeatsParams.targetEnergy = profile.mood.targetArousal / 35;
          }

          // Use seed artists if provided
          if (profile.seedArtists && profile.seedArtists.length > 0) {
            reccobeatsParams.seedArtists = profile.seedArtists;
          }

          // Get recommendations from Reccobeats
          const reccobeatsResults = await this.context.reccobeats.getRecommendations(reccobeatsParams);

          logger.debug('Reccobeats returned results', { count: reccobeatsResults.length });

          // Search YouTube Music for each Reccobeats recommendation
          // BATCHING OPTIMIZATION: Use controlled concurrency instead of sequential
          // Process in batches of 5 to respect burst limit (10 req/10sec)
          const tracksToProcess = Math.min(reccobeatsResults.length, 20);
          const batchSize = 5;

          for (let i = 0; i < tracksToProcess; i += batchSize) {
            const batch = reccobeatsResults.slice(i, i + batchSize);

            // Process batch concurrently with Promise.allSettled
            const batchResults = await Promise.allSettled(
              batch.map(async (track) => {
                const { title, artist } = track as { title: string; artist: string };
                const searchQuery = `${title} ${artist}`;

                const searchResult = await this.context.ytMusic.search(searchQuery, {
                  filter: 'songs',
                  limit: 3,
                });

                const songs = (searchResult as { songs?: unknown[] })?.songs || [];
                if (songs.length > 0) {
                  const firstSong = songs[0] as {
                    videoId: string;
                    title: string;
                    artists: { name: string }[];
                    year?: number;
                  };

                  return {
                    videoId: firstSong.videoId,
                    title: firstSong.title,
                    artist: firstSong.artists?.[0]?.name || 'Unknown',
                    year: firstSong.year,
                  };
                }
                return null;
              })
            );

            // Collect successful results
            for (const result of batchResults) {
              if (result.status === 'fulfilled' && result.value) {
                candidates.push(result.value);
              }
            }

            // Add delay between batches to respect rate limits
            if (i + batchSize < tracksToProcess) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }

          logger.info('Retrieved candidates from Reccobeats', { count: candidates.length });
        }
      } catch (error) {
        logger.warn('Reccobeats candidate generation failed', { error });
      }
    }

    // SOURCE 2: YouTube Music Search (for context-specific needs or when Reccobeats unavailable)
    try {
      const queries = searchQueries || this.generateSearchQueries(profile);

      // Reduced query count if we already have Reccobeats results
      const queryLimit = candidates.length > 0 ? 2 : 5;

      for (const query of queries.slice(0, queryLimit)) {
        try {
          const searchResult = await this.context.ytMusic.search(query, {
            filter: 'songs',
            limit: candidates.length > 0 ? 10 : 20, // Fewer if we have Reccobeats
          });

          const songs = (searchResult as { songs?: unknown[] })?.songs || [];

          for (const song of songs.slice(0, 10)) {
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
    } catch (error) {
      logger.warn('YouTube Music search failed', { error });
    }

    // SOURCE 3: User Library (for familiarity)
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

    // Deduplicate by videoId
    const uniqueCandidates = Array.from(
      new Map(candidates.map((c) => [c.videoId, c])).values()
    );

    logger.info('Total unique candidates from all sources', { count: uniqueCandidates.length });

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

    // Apply final reordering to avoid consecutive same-artist/album songs
    return this.reorderForVarietyAndFlow(selected);
  }

  /**
   * Reorder playlist to maximize variety while maintaining flow
   *
   * Uses research-backed techniques:
   * 1. Distributes same-artist songs evenly throughout (van Asseldonk algorithm)
   * 2. Minimizes energy/tempo jumps between adjacent tracks (coherence)
   * 3. Avoids consecutive songs from same album
   *
   * Based on:
   * - https://ruudvanasseldonk.com/2023/an-algorithm-for-shuffling-playlists
   * - EPJ Data Science 2025 playlist coherence research
   */
  private reorderForVarietyAndFlow(
    recommendations: RecommendationResult[]
  ): RecommendationResult[] {
    if (recommendations.length <= 2) {
      return recommendations;
    }

    // Step 1: Group tracks by artist
    const artistGroups = new Map<string, RecommendationResult[]>();
    for (const rec of recommendations) {
      const artist = rec.track.artist;
      const group = artistGroups.get(artist) || [];
      group.push(rec);
      artistGroups.set(artist, group);
    }

    // Step 2: Calculate ideal spacing for each artist's tracks
    // If an artist has N tracks in a playlist of length L, they should appear every L/N positions
    const totalLength = recommendations.length;
    const artistSpacing = new Map<string, number>();
    for (const [artist, tracks] of artistGroups) {
      artistSpacing.set(artist, totalLength / tracks.length);
    }

    // Step 3: Use greedy interleaving algorithm
    // Sort artists by track count descending (place most frequent artists first)
    const sortedArtists = [...artistGroups.entries()]
      .sort((a, b) => b[1].length - a[1].length);

    // Initialize result array with slots
    const result: (RecommendationResult | null)[] = new Array(totalLength).fill(null);
    const usedPositions = new Set<number>();

    // Place each artist's tracks at evenly distributed positions
    for (const [artist, tracks] of sortedArtists) {
      const spacing = artistSpacing.get(artist) || 1;

      // Sort this artist's tracks by score (best first)
      tracks.sort((a, b) => b.score - a.score);

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (!track) continue;

        // Calculate ideal position with slight randomization for naturalness
        const idealPos = Math.floor(i * spacing + spacing / 2);

        // Find nearest available position
        const pos = this.findNearestAvailablePosition(
          idealPos,
          usedPositions,
          totalLength,
          result,
          track.track.artist
        );

        result[pos] = track;
        usedPositions.add(pos);
      }
    }

    // Step 4: Apply coherence smoothing - swap adjacent tracks if it improves flow
    const finalResult = result.filter((r): r is RecommendationResult => r !== null);
    this.smoothTransitions(finalResult);

    logger.debug('Reordered playlist for variety and flow', {
      originalOrder: recommendations.slice(0, 5).map(r => r.track.artist),
      newOrder: finalResult.slice(0, 5).map(r => r.track.artist),
    });

    return finalResult;
  }

  /**
   * Find nearest available position that doesn't create consecutive same-artist
   */
  private findNearestAvailablePosition(
    idealPos: number,
    usedPositions: Set<number>,
    totalLength: number,
    result: (RecommendationResult | null)[],
    artist: string
  ): number {
    // Check ideal position first
    if (!usedPositions.has(idealPos) && idealPos < totalLength) {
      if (!this.wouldCreateConsecutive(result, idealPos, artist)) {
        return idealPos;
      }
    }

    // Search outward from ideal position
    for (let offset = 1; offset < totalLength; offset++) {
      // Try position after ideal
      const posAfter = idealPos + offset;
      if (posAfter < totalLength && !usedPositions.has(posAfter)) {
        if (!this.wouldCreateConsecutive(result, posAfter, artist)) {
          return posAfter;
        }
      }

      // Try position before ideal
      const posBefore = idealPos - offset;
      if (posBefore >= 0 && !usedPositions.has(posBefore)) {
        if (!this.wouldCreateConsecutive(result, posBefore, artist)) {
          return posBefore;
        }
      }
    }

    // Fallback: find any available position (consecutive if unavoidable)
    for (let i = 0; i < totalLength; i++) {
      if (!usedPositions.has(i)) {
        return i;
      }
    }

    return 0; // Should never reach here
  }

  /**
   * Check if placing an artist at position would create consecutive same-artist songs
   */
  private wouldCreateConsecutive(
    result: (RecommendationResult | null)[],
    pos: number,
    artist: string
  ): boolean {
    // Check position before
    if (pos > 0 && result[pos - 1]?.track.artist === artist) {
      return true;
    }
    // Check position after
    if (pos < result.length - 1 && result[pos + 1]?.track.artist === artist) {
      return true;
    }
    return false;
  }

  /**
   * Smooth transitions by minimizing energy/tempo jumps between adjacent tracks
   * Uses a simple swap optimization pass
   */
  private smoothTransitions(tracks: RecommendationResult[]): void {
    if (tracks.length < 3) return;

    // Calculate coherence score for a transition (lower = better)
    const transitionCost = (a: RecommendationResult, b: RecommendationResult): number => {
      const energyDiff = Math.abs((a.track.energy || 0.5) - (b.track.energy || 0.5));
      const valenceDiff = Math.abs((a.track.valence || 0.5) - (b.track.valence || 0.5));
      const tempoDiff = Math.abs((a.track.tempo || 120) - (b.track.tempo || 120)) / 200; // Normalize

      return energyDiff * 0.4 + valenceDiff * 0.3 + tempoDiff * 0.3;
    };

    // Single pass: try swapping adjacent pairs if it improves both transitions
    // and doesn't create consecutive same-artist
    for (let i = 1; i < tracks.length - 1; i++) {
      const prev = tracks[i - 1];
      const curr = tracks[i];
      const next = tracks[i + 1];

      // Safety checks
      if (!prev || !curr || !next) continue;

      // Skip if swapping would create consecutive same-artist
      if (prev.track.artist === next.track.artist) continue;

      const prevPrev = i > 1 ? tracks[i - 2] : undefined;
      const nextNext = i < tracks.length - 2 ? tracks[i + 2] : undefined;

      if (prevPrev && prevPrev.track.artist === next.track.artist) continue;
      if (nextNext && nextNext.track.artist === curr.track.artist) continue;

      // Calculate current cost vs swapped cost
      const currentCost = transitionCost(prev, curr) + transitionCost(curr, next);
      const swappedCost = transitionCost(prev, next) + transitionCost(next, curr);

      // Swap if it improves flow (with threshold to avoid unnecessary swaps)
      if (swappedCost < currentCost - 0.05) {
        tracks[i] = next;
        tracks[i + 1] = curr;
        i++; // Skip the swapped pair
      }
    }
  }
}
