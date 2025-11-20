import got, { Got } from 'got';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { tokenStore } from '../auth/token-store.js';

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

  constructor() {
    this.client = got.extend({
      prefixUrl: YT_DATA_API_BASE,
      responseType: 'json',
      timeout: {
        request: 30000,
      },
    });

    logger.info('YouTube Data API client initialized');
  }

  /**
   * Get OAuth access token
   */
  private getAccessToken(): string | null {
    const token = tokenStore.getCurrentToken();
    return token?.accessToken || null;
  }

  /**
   * Get user's playlists
   */
  async getPlaylists(maxResults: number = 25): Promise<Playlist[]> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    try {
      const response = await this.client.get('playlists', {
        searchParams: {
          part: 'snippet,contentDetails,status',
          mine: 'true',
          maxResults,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = response.body as any;
      return (data.items || []).map((item: any) => ({
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description || '',
        privacy: item.status.privacyStatus,
        videoCount: item.contentDetails.itemCount,
      }));
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

    try {
      for (const videoId of videoIds) {
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
      }

      logger.info('Videos added to playlist', {
        playlistId,
        count: videoIds.length,
      });
    } catch (error) {
      logger.error('Failed to add videos to playlist', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
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
   * Get playlist items (songs in a playlist)
   */
  async getPlaylistItems(playlistId: string, maxResults: number = 50): Promise<any[]> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    try {
      const response = await this.client.get('playlistItems', {
        searchParams: {
          part: 'snippet,contentDetails',
          playlistId,
          maxResults,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = response.body as any;
      return (data.items || []).map((item: any) => ({
        playlistItemId: item.id,
        videoId: item.contentDetails.videoId,
        title: item.snippet.title,
        artist: item.snippet.videoOwnerChannelTitle,
        position: item.snippet.position,
      }));
    } catch (error) {
      logger.error('Failed to get playlist items', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get liked music from YouTube Music (playlist ID: LM)
   * This returns ONLY music liked in YouTube Music, not all YouTube videos
   */
  async getLikedVideos(maxResults: number = 50): Promise<any[]> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    try {
      // Use YouTube Music's "Liked Music" playlist (ID: LM)
      // This filters to only music, not all YouTube likes
      const response = await this.client.get('playlistItems', {
        searchParams: {
          part: 'snippet,contentDetails',
          playlistId: 'LM',
          maxResults,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = response.body as any;
      return (data.items || []).map((item: any) => ({
        videoId: item.contentDetails.videoId,
        title: item.snippet.title,
        artist: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
        album: null,
        duration: null,
        thumbnails: item.snippet.thumbnails || {},
      }));
    } catch (error) {
      logger.error('Failed to get liked music from YouTube Music', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async close(): Promise<void> {
    logger.info('YouTube Data API client closed');
  }
}
