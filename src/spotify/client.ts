import got, { Got } from 'got';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('spotify-client');

/**
 * Spotify Audio Features
 * https://developer.spotify.com/documentation/web-api/reference/get-audio-features
 */
export interface SpotifyAudioFeatures {
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

  // Musical properties
  key: number; // 0-11 (C, C#, D, etc.)
  mode: number; // 0 = minor, 1 = major
  time_signature: number; // 3-7

  // Duration
  duration_ms: number;
}

/**
 * Spotify Track Search Result
 */
export interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string; id: string }>;
  album: {
    name: string;
    release_date: string;
  };
  popularity: number; // 0-100
  duration_ms: number;
  uri: string;
}

/**
 * Spotify Client using Client Credentials flow
 * No user login required - uses app credentials only
 */
export class SpotifyClient {
  private client: Got;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.client = got.extend({
      prefixUrl: 'https://api.spotify.com/v1',
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
    });
  }

  /**
   * Get access token using Client Credentials flow
   * https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    logger.debug('Requesting new Spotify access token');

    try {
      const authString = Buffer.from(
        `${config.spotifyClientId}:${config.spotifyClientSecret}`
      ).toString('base64');

      const response = await got.post('https://accounts.spotify.com/api/token', {
        headers: {
          Authorization: `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        responseType: 'json',
      });

      const data = response.body as {
        access_token: string;
        token_type: string;
        expires_in: number;
      };

      this.accessToken = data.access_token;
      // Set expiry to 5 minutes before actual expiry for safety
      this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

      logger.info('Spotify access token obtained', {
        expiresIn: data.expires_in,
      });

      return this.accessToken;
    } catch (error) {
      logger.error('Failed to get Spotify access token', { error });
      throw new Error('Failed to authenticate with Spotify API');
    }
  }

  /**
   * Search for a track on Spotify
   */
  async searchTrack(query: string, artist?: string): Promise<SpotifyTrack | null> {
    const token = await this.getAccessToken();

    try {
      // Build search query
      let searchQuery = `track:${query}`;
      if (artist) {
        searchQuery += ` artist:${artist}`;
      }

      const response = await this.client.get('search', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        searchParams: {
          q: searchQuery,
          type: 'track',
          limit: 1,
        },
        responseType: 'json',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = response.body as any;

      if (data.tracks?.items?.length > 0) {
        const track = data.tracks.items[0];
        logger.debug('Found Spotify track', {
          query,
          artist,
          trackId: track.id,
          trackName: track.name,
        });
        return track;
      }

      logger.debug('No Spotify track found', { query, artist });
      return null;
    } catch (error) {
      logger.error('Failed to search Spotify track', { error, query, artist });
      return null;
    }
  }

  /**
   * Get audio features for a track by Spotify track ID
   */
  async getAudioFeatures(trackId: string): Promise<SpotifyAudioFeatures | null> {
    const token = await this.getAccessToken();

    try {
      const response = await this.client.get(`audio-features/${trackId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        responseType: 'json',
      });

      const features = response.body as SpotifyAudioFeatures;

      logger.debug('Retrieved Spotify audio features', {
        trackId,
        tempo: features.tempo,
        energy: features.energy,
        valence: features.valence,
      });

      return features;
    } catch (error) {
      logger.error('Failed to get Spotify audio features', { error, trackId });
      return null;
    }
  }

  /**
   * Get audio features by searching for track (convenience method)
   */
  async getAudioFeaturesBySearch(
    trackName: string,
    artistName: string
  ): Promise<SpotifyAudioFeatures | null> {
    const track = await this.searchTrack(trackName, artistName);
    if (!track) {
      return null;
    }

    return this.getAudioFeatures(track.id);
  }

  /**
   * Get multiple audio features at once (batch operation)
   * https://developer.spotify.com/documentation/web-api/reference/get-several-audio-features
   */
  async getMultipleAudioFeatures(
    trackIds: string[]
  ): Promise<Array<SpotifyAudioFeatures | null>> {
    if (trackIds.length === 0) {
      return [];
    }

    const token = await this.getAccessToken();

    try {
      // Spotify API allows up to 100 track IDs per request
      const chunks = [];
      for (let i = 0; i < trackIds.length; i += 100) {
        chunks.push(trackIds.slice(i, i + 100));
      }

      const allFeatures: Array<SpotifyAudioFeatures | null> = [];

      for (const chunk of chunks) {
        const response = await this.client.get('audio-features', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          searchParams: {
            ids: chunk.join(','),
          },
          responseType: 'json',
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = response.body as any;
        allFeatures.push(...(data.audio_features || []));
      }

      logger.debug('Retrieved multiple Spotify audio features', {
        requested: trackIds.length,
        received: allFeatures.filter((f) => f !== null).length,
      });

      return allFeatures;
    } catch (error) {
      logger.error('Failed to get multiple Spotify audio features', {
        error,
        count: trackIds.length,
      });
      return trackIds.map(() => null);
    }
  }

  /**
   * Close client (cleanup)
   */
  async close(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiry = 0;
    logger.info('Spotify client closed');
  }
}
