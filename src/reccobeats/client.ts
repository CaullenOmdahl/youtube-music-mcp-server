import got, { Got } from 'got';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('reccobeats-client');

/**
 * ReccoBeats Audio Features
 * https://reccobeats.com/docs/apis/get-track-audio-features
 *
 * Same format as Spotify Audio Features for drop-in replacement
 */
export interface ReccoBeatsAudioFeatures {
  // Core musical features
  tempo: number; // BPM (0-250+)
  energy: number; // 0.0 - 1.0
  valence: number; // 0.0 (negative) - 1.0 (positive) - Musical mood/happiness
  danceability: number; // 0.0 - 1.0
  acousticness: number; // 0.0 - 1.0
  instrumentalness: number; // 0.0 - 1.0
  liveness: number; // 0.0 - 1.0
  speechiness: number; // 0.0 - 1.0
  loudness: number; // dB (-60 to 0)
}

export interface ReccoBeatsRecommendationParams {
  seed_tracks?: string[]; // Spotify IDs
  seed_artists?: string[]; // Spotify IDs
  seed_genres?: string[];
  target_valence?: number;
  target_energy?: number;
  limit?: number;
}

export interface ReccoBeatsTrack {
  id: string; // ReccoBeats ID
  title: string;
  artist: string;
  album: string;
  duration: string; // e.g. "03:30"
  spotify_id?: string;
  image?: string;
}

export interface ReccoBeatsRecommendationResponse {
  tracks: ReccoBeatsTrack[];
}

/**
 * ReccoBeats Client - No authentication required
 * Provides audio features for tracks using Spotify IDs
 */
export class ReccoBeatsClient {
  private client: Got;

  constructor() {
    this.client = got.extend({
      prefixUrl: 'https://api.reccobeats.com/v1',
      headers: {
        'User-Agent': 'YouTubeMusicMCPServer/3.0.0',
      },
      timeout: {
        request: 10000,
      },
      retry: {
        limit: 3,
        methods: ['GET'],
        statusCodes: [429, 500, 502, 503, 504],
      },
      responseType: 'json',
    });
  }

  /**
   * Get audio features for a track by Spotify ID
   * Two-step process:
   * 1. Look up track by Spotify ID to get ReccoBeats ID
   * 2. Get audio features using ReccoBeats ID
   * https://reccobeats.com/docs/apis/get-track-audio-features
   */
  async getAudioFeatures(spotifyId: string): Promise<ReccoBeatsAudioFeatures | null> {
    try {
      logger.debug('Looking up track in ReccoBeats', { spotifyId });

      // Step 1: Look up track by Spotify ID to get ReccoBeats ID
      const lookupResponse = await this.client.get('track', {
        searchParams: {
          ids: spotifyId,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lookupData = lookupResponse.body as any;

      if (!lookupData.content || lookupData.content.length === 0) {
        logger.debug('Track not found in ReccoBeats', { spotifyId });
        return null;
      }

      const reccobeatsId = lookupData.content[0].id;
      logger.debug('Found ReccoBeats ID', { spotifyId, reccobeatsId });

      // Step 2: Get audio features using ReccoBeats ID
      const featuresResponse = await this.client.get(`track/${reccobeatsId}/audio-features`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = featuresResponse.body as any;

      const features: ReccoBeatsAudioFeatures = {
        tempo: data.tempo,
        energy: data.energy,
        valence: data.valence,
        danceability: data.danceability,
        acousticness: data.acousticness,
        instrumentalness: data.instrumentalness,
        liveness: data.liveness,
        speechiness: data.speechiness,
        loudness: data.loudness,
      };

      logger.debug('Retrieved ReccoBeats audio features', {
        spotifyId,
        reccobeatsId,
        tempo: features.tempo,
        energy: features.energy,
        valence: features.valence,
      });

      return features;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;

      if (err.response?.statusCode === 404) {
        logger.debug('Track not found in ReccoBeats', { spotifyId });
        return null;
      }

      logger.error('Failed to get ReccoBeats audio features', {
        error: err.message,
        statusCode: err.response?.statusCode,
        spotifyId,
      });
      return null;
    }
  }

  /**
   * Get audio features for multiple tracks (batch operation)
   * ReccoBeats doesn't have a batch endpoint, so we'll make individual requests
   */
  async getMultipleAudioFeatures(
    spotifyIds: string[]
  ): Promise<Array<ReccoBeatsAudioFeatures | null>> {
    if (spotifyIds.length === 0) {
      return [];
    }

    logger.debug('Fetching multiple audio features from ReccoBeats', {
      count: spotifyIds.length,
    });

    // Make requests in parallel with some throttling to avoid overwhelming the API
    const chunkSize = 10;
    const results: Array<ReccoBeatsAudioFeatures | null> = [];

    for (let i = 0; i < spotifyIds.length; i += chunkSize) {
      const chunk = spotifyIds.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map((id) => this.getAudioFeatures(id))
      );
      results.push(...chunkResults);

      // Small delay between chunks to be respectful of rate limits
      if (i + chunkSize < spotifyIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    logger.debug('Retrieved multiple ReccoBeats audio features', {
      requested: spotifyIds.length,
      received: results.filter((f) => f !== null).length,
    });

    return results;
  }

  /**
   * Get recommendations based on seed tracks and target features
   * https://reccobeats.com/docs/apis/get-recommendation
   */
  async getRecommendations(
    params: ReccoBeatsRecommendationParams
  ): Promise<ReccoBeatsTrack[]> {
    try {
      logger.debug('Fetching recommendations from ReccoBeats', { params });

      const searchParams: Record<string, string | number | boolean> = {};

      // Use 'seeds' parameter which accepts Spotify IDs directly
      if (params.seed_tracks && params.seed_tracks.length > 0) {
        // Join with commas if multiple, or just pass the array if supported by 'got'
        // The search result says "repeated query parameters or comma-separated values"
        // 'got' handles arrays by repeating parameters by default, but let's use comma-separated string to be safe if needed
        // or just let 'got' handle it.
        // Let's try passing as comma-separated string first as it's safer for some APIs
        searchParams.seeds = params.seed_tracks.join(',');
      }

      if (params.target_valence !== undefined) searchParams.valence = params.target_valence;
      if (params.target_energy !== undefined) searchParams.energy = params.target_energy;

      // 'limit' -> 'size'
      if (params.limit) searchParams.size = params.limit;

      const response = await this.client.get('track/recommendation', {
        searchParams,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = response.body as any;

      logger.debug('ReccoBeats response body', { body });

      // Response structure is { content: [...] } based on logs
      let tracks: any[] = [];
      if (body.content && Array.isArray(body.content)) {
        tracks = body.content;
      } else if (body.data && body.data.content && Array.isArray(body.data.content)) {
        // Fallback if structure changes
        tracks = body.data.content;
      } else if (Array.isArray(body)) {
        tracks = body;
      }

      logger.debug('Parsed tracks', { count: tracks.length });

      return tracks.map((t: any) => {
        const artistName = t.artists && t.artists.length > 0 ? t.artists[0].name : 'Unknown';
        const durationMs = t.durationMs || 0;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        const duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        return {
          id: t.id,
          title: t.trackTitle || 'Unknown',
          artist: artistName,
          album: 'Unknown', // Album info not provided in recommendation response
          duration: duration,
          image: undefined, // Image not provided
        };
      });

    } catch (error) {
      logger.error('Failed to get ReccoBeats recommendations', {
        error: (error as Error).message,
        params,
      });
      return [];
    }
  }

  /**
   * Close client (cleanup)
   */
  async close(): Promise<void> {
    logger.info('ReccoBeats client closed');
  }
}
