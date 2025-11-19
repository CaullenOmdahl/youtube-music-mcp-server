import { MusicBrainzApi } from 'musicbrainz-api';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { FixedIntervalRateLimiter } from '../utils/rate-limiter.js';
import type { MBArtist, MBRecording, MBTag } from '../types/index.js';

const logger = createLogger('musicbrainz-client');

export class MusicBrainzClient {
  private api: MusicBrainzApi;
  private rateLimiter: FixedIntervalRateLimiter;

  constructor() {
    this.api = new MusicBrainzApi({
      appName: 'YouTubeMusicMCPServer',
      appVersion: '3.0.0',
      appContactInfo: 'https://github.com/youtube-music-mcp-server',
    });

    // MusicBrainz has a strict 1 request per second limit
    this.rateLimiter = new FixedIntervalRateLimiter(
      'musicbrainz',
      config.musicBrainzRateLimit
    );

    logger.info('MusicBrainz client initialized');
  }

  /**
   * Search for artists by name
   */
  async searchArtist(name: string, limit: number = 5): Promise<MBArtist[]> {
    await this.rateLimiter.acquire();

    logger.debug('Searching artist', { name, limit });

    try {
      const result = await this.api.search('artist', { query: name, limit });

      return result.artists.map((artist) => ({
        mbid: artist.id,
        name: artist.name,
        disambiguation: artist.disambiguation,
        score: artist.score,
      }));
    } catch (error) {
      logger.error('Artist search failed', { name, error });
      throw error;
    }
  }

  /**
   * Get tags/genres for an artist
   */
  async getArtistTags(mbid: string): Promise<MBTag[]> {
    await this.rateLimiter.acquire();

    logger.debug('Getting artist tags', { mbid });

    try {
      const artist = await this.api.lookup('artist', mbid, ['tags']) as {
        tags?: Array<{ name: string; count?: number }>;
      };

      if (!artist.tags) {
        return [];
      }

      return artist.tags
        .map((tag: { name: string; count?: number }) => ({
          name: tag.name,
          count: tag.count ?? 0,
        }))
        .sort((a: MBTag, b: MBTag) => b.count - a.count);
    } catch (error) {
      logger.error('Get artist tags failed', { mbid, error });
      throw error;
    }
  }

  /**
   * Search for recordings (tracks)
   */
  async searchRecording(
    title: string,
    artist?: string,
    limit: number = 5
  ): Promise<MBRecording[]> {
    await this.rateLimiter.acquire();

    logger.debug('Searching recording', { title, artist, limit });

    try {
      let query = `recording:"${title}"`;
      if (artist) {
        query += ` AND artist:"${artist}"`;
      }

      const result = await this.api.search('recording', { query, limit });

      return result.recordings.map((rec) => ({
        mbid: rec.id,
        title: rec.title,
        artist: rec['artist-credit']?.[0]?.name ?? '',
        score: rec.score,
      }));
    } catch (error) {
      logger.error('Recording search failed', { title, artist, error });
      throw error;
    }
  }

  /**
   * Get detailed artist information including relations
   */
  async getArtistDetails(mbid: string): Promise<MBArtist & { relations?: unknown }> {
    await this.rateLimiter.acquire();

    logger.debug('Getting artist details', { mbid });

    try {
      const artist = await this.api.lookup('artist', mbid, [
        'tags',
        'artist-rels',
      ]) as {
        id: string;
        name: string;
        disambiguation?: string;
        tags?: Array<{ name: string; count?: number }>;
      };

      const tags: MBTag[] = artist.tags
        ? artist.tags.map((tag: { name: string; count?: number }) => ({
            name: tag.name,
            count: tag.count ?? 0,
          }))
        : [];

      return {
        mbid: artist.id,
        name: artist.name,
        disambiguation: artist.disambiguation,
        tags,
      };
    } catch (error) {
      logger.error('Get artist details failed', { mbid, error });
      throw error;
    }
  }

  /**
   * Get recording details with tags
   */
  async getRecordingDetails(mbid: string): Promise<MBRecording & { tags?: MBTag[] }> {
    await this.rateLimiter.acquire();

    logger.debug('Getting recording details', { mbid });

    try {
      const recording = await this.api.lookup('recording', mbid, [
        'tags',
        'artist-credits',
      ]) as {
        id: string;
        title: string;
        'artist-credit'?: Array<{ name?: string }>;
        tags?: Array<{ name: string; count?: number }>;
      };

      const tags: MBTag[] = recording.tags
        ? recording.tags.map((tag: { name: string; count?: number }) => ({
            name: tag.name,
            count: tag.count ?? 0,
          }))
        : [];

      return {
        mbid: recording.id,
        title: recording.title,
        artist: recording['artist-credit']?.[0]?.name ?? '',
        tags,
      };
    } catch (error) {
      logger.error('Get recording details failed', { mbid, error });
      throw error;
    }
  }

  /**
   * Close the client
   */
  async close(): Promise<void> {
    logger.info('MusicBrainz client closed');
  }
}
