import got, { Got } from 'got';
import { createLogger } from '../utils/logger.js';
import { tokenStore } from '../auth/token-store.js';
import type { YouTubeMusicClient } from '../youtube-music/client.js';

const logger = createLogger('youtube-data-api');

// YouTube Data API v3 constants
const YT_DATA_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface Playlist {
  id: string;
  title: string;
  description: string;
  privacy: 'private' | 'public' | 'unlisted';
  videoCount: number;
}

/**
 * YouTube Data API v3 Client
 * Uses OAuth bearer tokens for authentication
 */
export class YouTubeDataClient {
  private client: Got;
  private ytMusicClient?: YouTubeMusicClient;

  constructor(ytMusicClient?: YouTubeMusicClient) {
    this.client = got.extend({
      prefixUrl: YT_DATA_API_BASE,
      responseType: 'json',
      timeout: {
        request: 30000,
      },
    });

    this.ytMusicClient = ytMusicClient;
    logger.info('YouTube Data API client initialized', {
      withMusicEnrichment: !!ytMusicClient,
    });
  }

  /**
   * Get OAuth access token
   */
  private getAccessToken(): string | null {
    const token = tokenStore.getCurrentToken();
    return token?.accessToken || null;
  }

  /**
   * Get user's playlists (with pagination support)
   */
  async getPlaylists(maxResults: number = 25): Promise<Playlist[]> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    try {
      const playlists: Playlist[] = [];
      let pageToken: string | undefined;
      const perPage = Math.min(maxResults, 50); // API max is 50

      do {
        const response = await this.client.get('playlists', {
          searchParams: {
            part: 'snippet,contentDetails,status',
            mine: 'true',
            maxResults: perPage,
            ...(pageToken && { pageToken }),
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = response.body as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (data.items || []).map((item: any) => ({
          id: item.id,
          title: item.snippet.title,
          description: item.snippet.description || '',
          privacy: item.status.privacyStatus,
          videoCount: item.contentDetails.itemCount,
        }));

        playlists.push(...items);
        pageToken = data.nextPageToken;

        // Stop if we have enough results
        if (playlists.length >= maxResults) {
          break;
        }
      } while (pageToken);

      return playlists.slice(0, maxResults);
    } catch (error) {
      logger.error('Failed to get playlists', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create a new playlist
   */
  async createPlaylist(
    title: string,
    description: string = '',
    privacy: 'private' | 'public' | 'unlisted' = 'private'
  ): Promise<string> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    try {
      const response = await this.client.post('playlists', {
        searchParams: {
          part: 'snippet,status',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        json: {
          snippet: {
            title,
            description,
          },
          status: {
            privacyStatus: privacy,
          },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = response.body as any;
      logger.info('Playlist created', { playlistId: data.id });
      return data.id;
    } catch (error) {
      logger.error('Failed to create playlist', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete a playlist
   */
  async deletePlaylist(playlistId: string): Promise<void> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    try {
      await this.client.delete('playlists', {
        searchParams: {
          id: playlistId,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      logger.info('Playlist deleted', { playlistId });
    } catch (error) {
      logger.error('Failed to delete playlist', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update playlist metadata
   */
  async updatePlaylist(
    playlistId: string,
    updates: {
      title?: string;
      description?: string;
      privacy?: 'private' | 'public' | 'unlisted';
    }
  ): Promise<void> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        id: playlistId,
        snippet: {},
        status: {},
      };

      if (updates.title) body.snippet.title = updates.title;
      if (updates.description !== undefined) body.snippet.description = updates.description;
      if (updates.privacy) body.status.privacyStatus = updates.privacy;

      await this.client.put('playlists', {
        searchParams: {
          part: 'snippet,status',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        json: body,
      });

      logger.info('Playlist updated', { playlistId });
    } catch (error) {
      logger.error('Failed to update playlist', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Add videos to playlist
   */
  async addToPlaylist(playlistId: string, videoIds: string[]): Promise<void> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    const results: { videoId: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const videoId of videoIds) {
      try {
        await this.client.post('playlistItems', {
          searchParams: {
            part: 'snippet',
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          json: {
            snippet: {
              playlistId,
              resourceId: {
                kind: 'youtube#video',
                videoId,
              },
            },
          },
        });

        results.push({ videoId, success: true });
        successCount++;
        logger.debug('Video added to playlist', { playlistId, videoId });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        failureCount++;
        const errorMessage = error?.response?.body?.error?.message ||
                           error?.message ||
                           'Unknown error';
        const errorCode = error?.response?.statusCode ||
                         error?.response?.body?.error?.code;

        results.push({
          videoId,
          success: false,
          error: `${errorCode ? `[${errorCode}] ` : ''}${errorMessage}`
        });

        logger.warn('Failed to add video to playlist', {
          playlistId,
          videoId,
          error: errorMessage,
          statusCode: errorCode,
        });
      }
    }

    logger.info('Batch add to playlist completed', {
      playlistId,
      total: videoIds.length,
      success: successCount,
      failed: failureCount,
    });

    // If all videos failed, throw an error
    if (failureCount === videoIds.length) {
      const errorDetails = results.map(r => `${r.videoId}: ${r.error}`).join('; ');
      throw new Error(`Failed to add any videos to playlist: ${errorDetails}`);
    }

    // If some failed, log warning but don't throw (partial success)
    if (failureCount > 0) {
      logger.warn('Some videos failed to add', {
        failedVideos: results.filter(r => !r.success),
      });
    }
  }

  /**
   * Remove videos from playlist
   */
  async removeFromPlaylist(playlistItemIds: string[]): Promise<void> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    try {
      for (const itemId of playlistItemIds) {
        await this.client.delete('playlistItems', {
          searchParams: {
            id: itemId,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }

      logger.info('Videos removed from playlist', {
        count: playlistItemIds.length,
      });
    } catch (error) {
      logger.error('Failed to remove videos from playlist', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get playlist items (songs in a playlist) with pagination and enrichment
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getPlaylistItems(playlistId: string, maxResults: number = 50): Promise<any[]> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = [];
      let pageToken: string | undefined;
      const perPage = Math.min(maxResults, 50); // API max is 50

      do {
        const response = await this.client.get('playlistItems', {
          searchParams: {
            part: 'snippet,contentDetails',
            playlistId,
            maxResults: perPage,
            ...(pageToken && { pageToken }),
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = response.body as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageItems = (data.items || []).map((item: any) => ({
          playlistItemId: item.id,
          videoId: item.contentDetails.videoId,
          title: item.snippet.title,
          artist: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
          position: item.snippet.position,
          thumbnails: item.snippet.thumbnails || {},
        }));

        items.push(...pageItems);
        pageToken = data.nextPageToken;

        // Stop if we have enough results
        if (items.length >= maxResults) {
          break;
        }
      } while (pageToken);

      const finalItems = items.slice(0, maxResults);

      // Enrich with video details (duration, etc.)
      const videoIds = finalItems.map(item => item.videoId);
      const enrichedData = await this.enrichVideoData(videoIds);

      return finalItems.map(item => {
        const enrichment = enrichedData.get(item.videoId);
        const { thumbnails: _thumbnails, ...itemWithoutThumbnails } = item;
        return this.cleanObject({
          ...itemWithoutThumbnails,
          duration: enrichment ? this.formatDuration(enrichment.durationSeconds) : undefined,
          durationSeconds: enrichment?.durationSeconds,
          album: enrichment?.album,
          artists: enrichment?.artists,
          year: enrichment?.year,
          explicit: enrichment?.explicit,
        });
      });
    } catch (error) {
      logger.error('Failed to get playlist items', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Enrich video data with YouTube Music metadata (album, artists, etc.)
   * Fetches detailed song information from YouTube Music API
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async enrichVideoData(videoIds: string[]): Promise<Map<string, any>> {
    const accessToken = this.getAccessToken();
    if (!accessToken || videoIds.length === 0) {
      return new Map();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrichedData = new Map<string, any>();

    // First get duration from YouTube Data API in batches of 50
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);

      try {
        const response = await this.client.get('videos', {
          searchParams: {
            part: 'contentDetails',
            id: batch.join(','),
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = response.body as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data.items || []).forEach((item: any) => {
          enrichedData.set(item.id, {
            durationSeconds: this.parseDuration(item.contentDetails?.duration),
          });
        });
      } catch (error) {
        logger.warn('Failed to get duration data', { error, batchSize: batch.length });
      }
    }

    // Then enrich with YouTube Music metadata (album, artists, year, explicit)
    // Note: YouTube Music API doesn't support batch requests, so we fetch individually
    if (this.ytMusicClient) {
      for (const videoId of videoIds) {
        try {
          const song = await this.ytMusicClient.getSong(videoId);
          const existing = enrichedData.get(videoId) || {};

          // Get explicit flag by searching (only if title and artist available)
          let explicit: boolean | undefined;
          if (song.title && song.artists && song.artists.length > 0 && song.artists[0]) {
            const artistName = song.artists[0].name;
            explicit = await this.ytMusicClient.getExplicitFlag(
              videoId,
              song.title,
              artistName
            );
          }

          enrichedData.set(videoId, {
            ...existing,
            album: song.album,
            artists: song.artists,
            year: song.year,
            explicit,
          });
        } catch {
          // YouTube Music API call failed, keep the data we have
          logger.debug('Failed to get YouTube Music metadata', { videoId });
        }
      }
    }

    return enrichedData;
  }

  /**
   * Remove null/undefined values from object
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cleanObject(obj: any): any {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, v]) => v != null)
    );
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseDuration(isoDuration: string | null): number | null {
    if (!isoDuration) return null;

    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;

    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Format seconds to human-readable duration (MM:SS or H:MM:SS)
   */
  private formatDuration(seconds: number | null): string | null {
    if (seconds === null) return null;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Get liked music from YouTube Music (playlist ID: LM) with pagination support
   * This returns ONLY music liked in YouTube Music, not all YouTube videos
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getLikedVideos(maxResults: number = 50): Promise<any[]> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const songs: any[] = [];
      let pageToken: string | undefined;
      const perPage = Math.min(maxResults, 50); // API max is 50

      do {
        // Use YouTube Music's "Liked Music" playlist (ID: LM)
        // This filters to only music, not all YouTube likes
        const response = await this.client.get('playlistItems', {
          searchParams: {
            part: 'snippet,contentDetails',
            playlistId: 'LM',
            maxResults: perPage,
            ...(pageToken && { pageToken }),
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = response.body as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageItems = (data.items || []).map((item: any) => ({
          videoId: item.contentDetails.videoId,
          title: item.snippet.title,
          artist: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
          thumbnails: item.snippet.thumbnails || {},
        }));

        songs.push(...pageItems);
        pageToken = data.nextPageToken;

        // Stop if we have enough results
        if (songs.length >= maxResults) {
          break;
        }
      } while (pageToken);

      const finalSongs = songs.slice(0, maxResults);

      // Enrich with video details (duration, etc.)
      const videoIds = finalSongs.map(s => s.videoId);
      const enrichedData = await this.enrichVideoData(videoIds);

      return finalSongs.map(song => {
        const enrichment = enrichedData.get(song.videoId);
        const { thumbnails: _thumbnails, ...songWithoutThumbnails } = song;
        return this.cleanObject({
          ...songWithoutThumbnails,
          duration: enrichment ? this.formatDuration(enrichment.durationSeconds) : undefined,
          durationSeconds: enrichment?.durationSeconds,
          album: enrichment?.album,
          artists: enrichment?.artists,
          year: enrichment?.year,
          explicit: enrichment?.explicit,
        });
      });
    } catch (error) {
      logger.error('Failed to get liked music from YouTube Music', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get ISRC code for a video
   * Returns null if video doesn't have ISRC (user uploads, covers, etc.)
   */
  async getVideoISRC(videoId: string): Promise<string | null> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    try {
      logger.debug('Fetching ISRC for video', { videoId });

      const response = await this.client.get('videos', {
        searchParams: {
          part: 'contentDetails',
          id: videoId,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = response.body as any;
      const items = data.items || [];

      if (items.length === 0) {
        logger.debug('Video not found', { videoId });
        return null;
      }

      const isrc = items[0]?.contentDetails?.isrc || null;

      if (isrc) {
        logger.info('ISRC found for video', { videoId, isrc });
      } else {
        logger.debug('No ISRC available for video', { videoId });
      }

      return isrc;
    } catch (error) {
      logger.error('Failed to get video ISRC', {
        error: error instanceof Error ? error.message : 'Unknown error',
        videoId,
      });
      return null;
    }
  }

  async close(): Promise<void> {
    logger.info('YouTube Data API client closed');
  }
}
