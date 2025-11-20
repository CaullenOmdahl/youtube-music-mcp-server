import type { MusicBrainzClient } from '../musicbrainz/client.js';
import type { Database, MUSICDimensions, Track } from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('song-features');

// Tag to MUSIC dimension mapping
const TAG_DIMENSION_MAP: Record<string, Partial<MUSICDimensions>> = {
  // Mellow
  ambient: { mellow: 30 },
  'easy listening': { mellow: 32 },
  chillout: { mellow: 28 },
  acoustic: { mellow: 25 },
  ballad: { mellow: 27 },
  calm: { mellow: 30 },
  relaxing: { mellow: 32 },

  // Sophisticated
  jazz: { sophisticated: 30 },
  classical: { sophisticated: 35 },
  progressive: { sophisticated: 28 },
  'art rock': { sophisticated: 32 },
  experimental: { sophisticated: 30 },
  fusion: { sophisticated: 28 },

  // Intense
  metal: { intense: 35 },
  hardcore: { intense: 33 },
  punk: { intense: 30 },
  aggressive: { intense: 32 },
  energetic: { intense: 28 },
  loud: { intense: 30 },

  // Contemporary
  pop: { contemporary: 30 },
  electronic: { contemporary: 28 },
  'hip hop': { contemporary: 30 },
  edm: { contemporary: 32 },
  trap: { contemporary: 33 },
  modern: { contemporary: 30 },

  // Unpretentious
  folk: { unpretentious: 30 },
  country: { unpretentious: 28 },
  blues: { unpretentious: 27 },
  rock: { unpretentious: 25 },
  indie: { unpretentious: 26 },
  alternative: { unpretentious: 24 },
};

/**
 * Song feature extractor - integrates with MusicBrainz for tag-based feature extraction
 */
export class SongFeatureExtractor {
  constructor(
    private musicBrainz: MusicBrainzClient,
    private db: Database
  ) {}

  /**
   * Extract features for a song from YouTube Music data
   */
  async extractFeatures(
    videoId: string,
    title: string,
    artist: string,
    releaseYear?: number
  ): Promise<Track | null> {
    try {
      // Check if already in database
      const cached = await this.getCachedFeatures(videoId);
      if (cached) {
        logger.debug('Using cached features', { videoId, title });
        return cached;
      }

      logger.debug('Extracting features for song', { videoId, title, artist });

      // Search MusicBrainz for the recording
      const recordings = await this.musicBrainz.searchRecording(title, artist, 1);
      if (!recordings || recordings.length === 0) {
        logger.warn('No MusicBrainz recording found', { title, artist });
        return this.createProxyFeatures(videoId, title, artist, releaseYear || 2020);
      }

      const recording = recordings[0] as { mbid: string; title: string; artist: string };

      // Get recording details with tags
      const details = await this.musicBrainz.getRecordingDetails(recording.mbid);
      const tags = (details.tags || []) as { name: string; count: number }[];

      // Get artist tags as well
      const artists = await this.musicBrainz.searchArtist(artist, 1);
      let artistTags: { name: string; count: number }[] = [];
      if (artists && artists.length > 0) {
        const artistMbid = (artists[0] as { mbid: string }).mbid;
        artistTags = await this.musicBrainz.getArtistTags(artistMbid);
      }

      // Combine tags
      const allTags = [...tags, ...artistTags];
      const tagNames = allTags.map((t) => t.name.toLowerCase());

      // Extract MUSIC dimensions from tags
      const dimensions = this.extractMUSICDimensions(allTags);

      // Extract other features
      const features: Track = {
        videoId,
        title,
        artist,
        releaseYear: releaseYear || 2020,
        dimensions,
        tempo: this.estimateTempoFromTags(tagNames),
        energy: this.estimateEnergyFromTags(tagNames),
        complexity: this.estimateComplexityFromTags(tagNames),
        mode: this.estimateModeFromTags(tagNames),
        predictability: this.estimatePredictabilityFromTags(tagNames),
        consonance: this.estimateConsonanceFromTags(tagNames),
        valence: this.estimateValenceFromTags(tagNames),
        arousal: this.estimateArousalFromTags(tagNames),
        genres: this.extractGenres(allTags),
        tags: tagNames,
        popularity: this.estimatePopularity(allTags),
        mainstream: this.isMainstream(allTags),
        isTrending: false,
        hasLyrics: !tagNames.includes('instrumental'),
        userPlayCount: 0,
        isNewArtist: true,
        artistFamiliarity: 0,
      };

      // Cache in database
      await this.cacheFeatures(features, 'musicbrainz', 0.8);

      return features;
    } catch (error) {
      logger.error('Feature extraction failed', { error, videoId, title, artist });
      return this.createProxyFeatures(videoId, title, artist, releaseYear || 2020);
    }
  }

  /**
   * Extract MUSIC dimensions from MusicBrainz tags
   */
  private extractMUSICDimensions(tags: { name: string; count: number }[]): MUSICDimensions {
    const dimensions: MUSICDimensions = {
      mellow: 17,
      sophisticated: 17,
      intense: 17,
      contemporary: 17,
      unpretentious: 17,
    };

    const tagScores: Record<string, number[]> = {
      mellow: [],
      sophisticated: [],
      intense: [],
      contemporary: [],
      unpretentious: [],
    };

    // Collect scores for each dimension
    for (const tag of tags) {
      const tagName = tag.name.toLowerCase();
      const mapping = TAG_DIMENSION_MAP[tagName];
      if (mapping) {
        for (const [dim, score] of Object.entries(mapping)) {
          if (score !== undefined) {
            const weight = Math.min(tag.count / 100, 1); // Normalize count to 0-1
            tagScores[dim as keyof MUSICDimensions]?.push(score * weight);
          }
        }
      }
    }

    // Average scores for each dimension
    for (const [dim, scores] of Object.entries(tagScores)) {
      if (scores.length > 0) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        dimensions[dim as keyof MUSICDimensions] = Math.round(avg);
      }
    }

    return dimensions;
  }

  /**
   * Extract genres from tags (top genres only)
   */
  private extractGenres(tags: { name: string; count: number }[]): string[] {
    const genreKeywords = [
      'rock',
      'pop',
      'jazz',
      'classical',
      'metal',
      'electronic',
      'hip hop',
      'country',
      'folk',
      'blues',
      'reggae',
      'punk',
      'indie',
      'alternative',
      'r&b',
      'soul',
    ];

    return tags
      .filter((t) => genreKeywords.some((g) => t.name.toLowerCase().includes(g)))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((t) => t.name.toLowerCase());
  }

  /**
   * Estimate tempo from tags (normalized to 0-35)
   */
  private estimateTempoFromTags(tags: string[]): number {
    if (tags.includes('fast') || tags.includes('uptempo')) return 28;
    if (tags.includes('slow') || tags.includes('downtempo')) return 8;
    if (tags.includes('moderate')) return 17;
    return 17; // Default middle
  }

  /**
   * Estimate energy from tags (0-1)
   */
  private estimateEnergyFromTags(tags: string[]): number {
    if (tags.includes('energetic') || tags.includes('loud') || tags.includes('aggressive'))
      return 0.9;
    if (tags.includes('calm') || tags.includes('relaxing') || tags.includes('ambient')) return 0.2;
    return 0.5;
  }

  /**
   * Estimate complexity from tags (0-1)
   */
  private estimateComplexityFromTags(tags: string[]): number {
    if (
      tags.includes('progressive') ||
      tags.includes('experimental') ||
      tags.includes('classical')
    )
      return 0.8;
    if (tags.includes('simple') || tags.includes('pop')) return 0.3;
    return 0.5;
  }

  /**
   * Estimate mode from tags (0=minor, 17.5=neutral, 35=major)
   */
  private estimateModeFromTags(tags: string[]): number {
    if (tags.includes('happy') || tags.includes('uplifting')) return 30;
    if (tags.includes('sad') || tags.includes('melancholic')) return 5;
    return 17;
  }

  /**
   * Estimate predictability from tags (0-35)
   */
  private estimatePredictabilityFromTags(tags: string[]): number {
    if (tags.includes('experimental') || tags.includes('avant-garde')) return 5;
    if (tags.includes('pop') || tags.includes('mainstream')) return 30;
    return 17;
  }

  /**
   * Estimate consonance from tags (0-35)
   */
  private estimateConsonanceFromTags(tags: string[]): number {
    if (tags.includes('dissonant') || tags.includes('harsh')) return 8;
    if (tags.includes('melodic') || tags.includes('harmonious')) return 28;
    return 22; // Default slightly consonant
  }

  /**
   * Estimate valence from tags (0-35)
   */
  private estimateValenceFromTags(tags: string[]): number {
    if (tags.includes('happy') || tags.includes('uplifting') || tags.includes('cheerful'))
      return 30;
    if (tags.includes('sad') || tags.includes('melancholic') || tags.includes('depressing'))
      return 5;
    return 17;
  }

  /**
   * Estimate arousal from tags (0-35)
   */
  private estimateArousalFromTags(tags: string[]): number {
    if (tags.includes('energetic') || tags.includes('exciting') || tags.includes('intense'))
      return 30;
    if (tags.includes('calm') || tags.includes('relaxing') || tags.includes('peaceful')) return 5;
    return 17;
  }

  /**
   * Estimate popularity from tag counts
   */
  private estimatePopularity(tags: { name: string; count: number }[]): number {
    if (tags.length === 0) return 0.5;
    const avgCount = tags.reduce((sum, t) => sum + t.count, 0) / tags.length;
    return Math.min(avgCount / 100, 1); // Normalize to 0-1
  }

  /**
   * Check if mainstream based on tags
   */
  private isMainstream(tags: { name: string; count: number }[]): boolean {
    const tagNames = tags.map((t) => t.name.toLowerCase());
    return tagNames.includes('pop') || tagNames.includes('mainstream') || tagNames.includes('top 40');
  }

  /**
   * Create proxy features when MusicBrainz data unavailable
   */
  private createProxyFeatures(
    videoId: string,
    title: string,
    artist: string,
    releaseYear: number
  ): Track {
    logger.debug('Creating proxy features', { videoId, title });

    return {
      videoId,
      title,
      artist,
      releaseYear,
      dimensions: {
        mellow: 17,
        sophisticated: 17,
        intense: 17,
        contemporary: 17,
        unpretentious: 17,
      },
      tempo: 17,
      energy: 0.5,
      complexity: 0.5,
      mode: 17,
      predictability: 17,
      consonance: 22,
      valence: 17,
      arousal: 17,
      genres: [],
      tags: [],
      popularity: 0.5,
      mainstream: false,
      isTrending: false,
      hasLyrics: true,
      userPlayCount: 0,
      isNewArtist: true,
      artistFamiliarity: 0,
    };
  }

  /**
   * Get cached features from database
   */
  private async getCachedFeatures(videoId: string): Promise<Track | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM song_features WHERE video_id = $1',
        [videoId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0] as Record<string, unknown>;

      // Update access tracking
      await this.db.query('SELECT update_song_access($1)', [videoId]);

      return {
        videoId: row.video_id as string,
        title: row.title as string,
        artist: row.artist as string,
        releaseYear: row.release_year as number,
        dimensions: {
          mellow: row.mellow as number,
          sophisticated: row.sophisticated as number,
          intense: row.intense as number,
          contemporary: row.contemporary as number,
          unpretentious: row.unpretentious as number,
        },
        tempo: row.tempo_normalized as number,
        energy: row.energy as number,
        complexity: row.complexity as number,
        mode: row.mode as number,
        predictability: row.predictability as number,
        consonance: row.consonance as number,
        valence: row.valence as number,
        arousal: row.arousal as number,
        genres: (row.genres as string[]) || [],
        tags: (row.tags as string[]) || [],
        popularity: row.popularity as number,
        mainstream: row.is_mainstream as boolean,
        isTrending: false,
        hasLyrics: row.has_lyrics as boolean,
        userPlayCount: 0,
        isNewArtist: true,
        artistFamiliarity: 0,
      };
    } catch (error) {
      logger.error('Failed to get cached features', { error, videoId });
      return null;
    }
  }

  /**
   * Cache features in database
   */
  private async cacheFeatures(
    track: Track,
    source: string,
    confidence: number
  ): Promise<void> {
    try {
      await this.db.query(
        `
        INSERT INTO song_features (
          video_id, title, artist, release_year,
          mellow, sophisticated, intense, contemporary, unpretentious,
          tempo_normalized, energy, complexity, mode, predictability, consonance,
          valence, arousal,
          genres, tags, popularity, is_mainstream, has_lyrics,
          analysis_source, analysis_confidence
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15,
          $16, $17,
          $18, $19, $20, $21, $22,
          $23, $24
        )
        ON CONFLICT (video_id) DO UPDATE SET
          last_accessed_at = CURRENT_TIMESTAMP,
          access_count = song_features.access_count + 1
        `,
        [
          track.videoId,
          track.title,
          track.artist,
          track.releaseYear,
          track.dimensions.mellow,
          track.dimensions.sophisticated,
          track.dimensions.intense,
          track.dimensions.contemporary,
          track.dimensions.unpretentious,
          track.tempo,
          track.energy,
          track.complexity,
          track.mode,
          track.predictability,
          track.consonance,
          track.valence,
          track.arousal,
          JSON.stringify(track.genres),
          JSON.stringify(track.tags),
          track.popularity,
          track.mainstream,
          track.hasLyrics,
          source,
          confidence,
        ]
      );

      logger.debug('Features cached', { videoId: track.videoId });
    } catch (error) {
      logger.error('Failed to cache features', { error, videoId: track.videoId });
    }
  }
}
