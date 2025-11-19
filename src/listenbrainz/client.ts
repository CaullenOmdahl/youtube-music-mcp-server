import got, { Got } from 'got';
import { createLogger } from '../utils/logger.js';
import type { LBSimilarArtist, LBRecording } from '../types/index.js';

const logger = createLogger('listenbrainz-client');

const LB_BASE_URL = 'https://api.listenbrainz.org';
const LB_LABS_URL = 'https://labs.api.listenbrainz.org';

export type LBRadioMode = 'easy' | 'medium' | 'hard';

export class ListenBrainzClient {
  private client: Got;
  private userToken?: string;

  constructor(userToken?: string) {
    this.userToken = userToken;

    this.client = got.extend({
      timeout: {
        request: 30000,
      },
      responseType: 'json',
      headers: {
        'User-Agent': 'YouTubeMusicMCPServer/3.0.0',
      },
    });

    logger.info('ListenBrainz client initialized');
  }

  /**
   * Get similar artists using ListenBrainz Labs API
   */
  async getSimilarArtists(
    artistMbids: string[],
    algorithm: string = 'session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30'
  ): Promise<LBSimilarArtist[]> {
    logger.debug('Getting similar artists', {
      count: artistMbids.length,
      algorithm,
    });

    try {
      const mbidsParam = artistMbids.join(',');

      const response = await this.client.get<LBSimilarArtist[]>(
        `${LB_LABS_URL}/similar-artists/json`,
        {
          searchParams: {
            artist_mbids: mbidsParam,
            algorithm,
          },
        }
      );

      return response.body;
    } catch (error) {
      logger.error('Get similar artists failed', { artistMbids, error });
      throw error;
    }
  }

  /**
   * Get recordings for LB Radio based on a prompt
   *
   * Modes control similarity strictness:
   * - easy: Very similar to seed
   * - medium: Balanced exploration
   * - hard: Diverse, exploratory
   */
  async getLBRadioRecordings(
    mode: LBRadioMode,
    prompt: string,
    limit: number = 50
  ): Promise<LBRecording[]> {
    logger.debug('Getting LB Radio recordings', { mode, prompt, limit });

    try {
      const headers: Record<string, string> = {};
      if (this.userToken) {
        headers['Authorization'] = `Token ${this.userToken}`;
      }

      interface LBRadioResponse {
        payload?: {
          jspf?: {
            playlist?: {
              track?: Array<{
                title?: string;
                creator?: string;
                identifier?: string;
              }>;
            };
          };
        };
      }

      const response = await this.client.get<LBRadioResponse>(
        `${LB_BASE_URL}/1/explore/lb-radio`,
        {
          searchParams: {
            mode,
            prompt,
          },
          headers,
        }
      );

      const tracks = response.body.payload?.jspf?.playlist?.track ?? [];

      return tracks.slice(0, limit).map((track) => ({
        title: track.title ?? '',
        creator: track.creator ?? '',
        identifier: track.identifier,
      }));
    } catch (error) {
      logger.error('Get LB Radio recordings failed', { mode, prompt, error });
      throw error;
    }
  }

  /**
   * Get popular recordings for a tag
   */
  async getPopularRecordingsForTag(
    tag: string,
    limit: number = 50
  ): Promise<LBRecording[]> {
    logger.debug('Getting popular recordings for tag', { tag, limit });

    try {
      interface TagResponse {
        payload?: {
          recordings?: Array<{
            recording_name?: string;
            artist_name?: string;
            recording_mbid?: string;
          }>;
        };
      }

      const response = await this.client.get<TagResponse>(
        `${LB_BASE_URL}/1/popularity/top-recordings-for-artist`,
        {
          searchParams: {
            tag,
            count: limit,
          },
        }
      );

      const recordings = response.body.payload?.recordings ?? [];

      return recordings.map((rec) => ({
        title: rec.recording_name ?? '',
        creator: rec.artist_name ?? '',
        identifier: rec.recording_mbid,
      }));
    } catch (error) {
      logger.error('Get popular recordings for tag failed', { tag, error });
      throw error;
    }
  }

  /**
   * Build LB Radio prompt from artist names
   */
  static buildArtistPrompt(artistNames: string[]): string {
    return artistNames.map((name) => `artist:(${name})`).join(' ');
  }

  /**
   * Build LB Radio prompt from tags
   */
  static buildTagPrompt(tags: string[]): string {
    return tags.map((tag) => `tag:(${tag})`).join(' ');
  }

  /**
   * Map diversity setting to LB Radio mode
   */
  static diversityToMode(diversity: 'focused' | 'balanced' | 'diverse'): LBRadioMode {
    switch (diversity) {
      case 'focused':
        return 'easy';
      case 'balanced':
        return 'medium';
      case 'diverse':
        return 'hard';
    }
  }

  /**
   * Close the client
   */
  async close(): Promise<void> {
    logger.info('ListenBrainz client closed');
  }
}
