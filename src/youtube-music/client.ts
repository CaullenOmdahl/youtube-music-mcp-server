import got, { Got } from 'got';
import { CookieJar } from 'tough-cookie';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { tokenStore } from '../auth/token-store.js';
import type { Song, Album, Artist, Playlist, SearchResponse } from '../types/index.js';
import {
  parseSearchResults,
  parsePlaylist,
  parseSong,
  parseAlbum,
  parseArtist,
  parseLibrarySongs,
} from './parsers.js';

const logger = createLogger('youtube-music-client');

// YouTube Music API constants
const YTM_BASE_URL = 'https://music.youtube.com';
const YTM_API_URL = 'https://music.youtube.com/youtubei/v1';
const YTM_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';

// Context for YouTube Music API requests
const YTM_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20231204.01.00',
    hl: 'en',
    gl: 'US',
    experimentIds: [],
    experimentsToken: '',
    browserName: 'Chrome',
    browserVersion: '120.0.0.0',
    osName: 'Windows',
    osVersion: '10.0',
    platform: 'DESKTOP',
    musicAppInfo: {
      pwaInstallabilityStatus: 'PWA_INSTALLABILITY_STATUS_UNKNOWN',
      webDisplayMode: 'WEB_DISPLAY_MODE_BROWSER',
      storeDigitalGoodsApiSupportStatus: {
        playStoreDigitalGoodsApiSupportStatus:
          'DIGITAL_GOODS_API_SUPPORT_STATUS_UNSUPPORTED',
      },
    },
  },
  user: {
    lockedSafetyMode: false,
  },
};

export interface SearchOptions {
  filter?: 'songs' | 'albums' | 'artists' | 'playlists' | 'videos';
  limit?: number;
}

export class YouTubeMusicClient {
  private client: Got;
  private cookieJar: CookieJar;
  private rateLimiter: RateLimiter;

  constructor() {
    this.cookieJar = new CookieJar();
    this.rateLimiter = new RateLimiter('youtube-music', {
      requestsPerMinute: config.rateLimitPerMinute,
      requestsPerHour: config.rateLimitPerHour,
      burstLimit: config.burstLimit,
    });

    this.client = got.extend({
      prefixUrl: YTM_API_URL,
      cookieJar: this.cookieJar,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'Origin': YTM_BASE_URL,
        'Referer': `${YTM_BASE_URL}/`,
        'X-Youtube-Client-Name': '67',
        'X-Youtube-Client-Version': '1.20231204.01.00',
      },
      searchParams: {
        key: YTM_API_KEY,
        prettyPrint: 'false',
      },
      responseType: 'json',
      timeout: {
        request: 30000,
      },
    });

    logger.info('YouTube Music client initialized');
  }

  /**
   * Check if client has an active authenticated session
   */
  isAuthenticated(): boolean {
    if (config.bypassAuth) {
      return true;
    }
    return tokenStore.hasActiveSession();
  }

  /**
   * Initialize YouTube Music session using OAuth access token
   * This exchanges the OAuth token for YouTube Music session cookies
   */
  private async initializeSession(): Promise<void> {
    const token = tokenStore.getCurrentToken();
    if (!token) {
      logger.debug('No OAuth token available for session initialization');
      return;
    }

    try {
      // Step 1: Establish Google session with OAuth token
      // This sets Google authentication cookies
      await got.get('https://accounts.google.com/ServiceLogin', {
        cookieJar: this.cookieJar,
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        followRedirect: true,
      });

      // Step 2: Visit YouTube Music to propagate the session
      // Google cookies should now authenticate us with YouTube
      await got.get(YTM_BASE_URL, {
        cookieJar: this.cookieJar,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        followRedirect: true,
      });

      const cookies = await this.cookieJar.getCookies(YTM_BASE_URL);
      logger.info('YouTube Music session initialized', {
        cookieCount: cookies.length,
        hasSID: cookies.some(c => c.key === 'SID'),
      });
    } catch (error) {
      logger.warn('Failed to initialize YouTube Music session', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<T> {
    await this.rateLimiter.acquire();

    // Initialize session with OAuth token if we have one but no cookies yet
    if (tokenStore.hasActiveSession()) {
      const cookies = await this.cookieJar.getCookies(YTM_BASE_URL);
      if (cookies.length === 0) {
        await this.initializeSession();
      }
    }

    const headers: Record<string, string> = {};

    try {
      const response = await this.client.post<T>(endpoint, {
        json: {
          context: YTM_CONTEXT,
          ...body,
        },
        headers,
      });

      return response.body;
    } catch (error) {
      logger.error('API request failed', {
        endpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ===========================================================================
  // Search Methods
  // ===========================================================================

  /**
   * Search for music content
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    const { filter, limit = 20 } = options;

    logger.debug('Searching', { query, filter, limit });

    // Map filter to YouTube Music params
    const params: Record<string, unknown> = {};
    if (filter) {
      const filterMap: Record<string, string> = {
        songs: 'EgWKAQIIAWoMEAMQBBAJEAoQBRAQ',
        videos: 'EgWKAQIQAWoMEAMQBBAJEAoQBRAQ',
        albums: 'EgWKAQIYAWoMEAMQBBAJEAoQBRAQ',
        artists: 'EgWKAQIgAWoMEAMQBBAJEAoQBRAQ',
        playlists: 'EgWKAQIoAWoMEAMQBBAJEAoQBRAQ',
      };
      params['params'] = filterMap[filter];
    }

    const response = await this.makeRequest<unknown>('search', {
      query,
      ...params,
    });

    return parseSearchResults(response, filter, limit);
  }

  // ===========================================================================
  // Song/Album/Artist Details
  // ===========================================================================

  /**
   * Get detailed song information
   */
  async getSong(videoId: string): Promise<Song> {
    logger.debug('Getting song', { videoId });

    const response = await this.makeRequest<unknown>('player', {
      videoId,
      playlistId: null,
    });

    return parseSong(response, videoId);
  }

  /**
   * Get explicit flag for a song by searching
   * Returns true if explicit, false if not, undefined if unable to determine
   * Only returns a value if the search result matches the videoId
   */
  async getExplicitFlag(
    videoId: string,
    title: string,
    artist: string
  ): Promise<boolean | undefined> {
    try {
      logger.debug('Checking explicit flag', { videoId, title, artist });

      // Search for the song by title and artist
      const searchQuery = `${title} ${artist}`;
      const response = await this.makeRequest<unknown>('search', {
        query: searchQuery,
        params: 'EgWKAQIIAWoMEAMQBBAJEAoQBRAQ', // songs filter
      });

      // Navigate to search results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contents = (response as any)?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]
        ?.tabRenderer?.content?.sectionListRenderer?.contents;

      if (!Array.isArray(contents)) {
        return undefined;
      }

      // Find the first song result
      for (const section of contents) {
        const items = section?.musicShelfRenderer?.contents;
        if (Array.isArray(items) && items.length > 0) {
          const firstResult = items[0].musicResponsiveListItemRenderer;

          if (!firstResult) continue;

          // Check if the videoId matches (only trust explicit flag if it's the same song)
          const resultVideoId = firstResult.playlistItemData?.videoId;
          if (resultVideoId !== videoId) {
            logger.debug('Search result videoId mismatch', {
              expected: videoId,
              got: resultVideoId,
            });
            return undefined;
          }

          // Check for explicit badge
          const badges = firstResult.badges;
          if (Array.isArray(badges)) {
            for (const badge of badges) {
              const iconType =
                badge.musicInlineBadgeRenderer?.icon?.iconType;
              if (iconType === 'MUSIC_EXPLICIT_BADGE') {
                return true;
              }
            }
          }

          // If we found the matching song but no explicit badge, it's not explicit
          return false;
        }
      }

      return undefined;
    } catch (error) {
      logger.debug('Failed to get explicit flag', { error });
      return undefined;
    }
  }

  /**
   * Get album details with tracks
   */
  async getAlbum(browseId: string): Promise<Album & { tracks: Song[] }> {
    logger.debug('Getting album', { browseId });

    const response = await this.makeRequest<unknown>('browse', {
      browseId,
    });

    return parseAlbum(response, browseId);
  }

  /**
   * Get artist details
   */
  async getArtist(channelId: string): Promise<Artist & { topSongs: Song[] }> {
    logger.debug('Getting artist', { channelId });

    const response = await this.makeRequest<unknown>('browse', {
      browseId: channelId,
    });

    return parseArtist(response, channelId);
  }

  // ===========================================================================
  // Playlist Methods
  // ===========================================================================

  /**
   * Get user's playlists
   */
  async getLibraryPlaylists(limit: number = 25): Promise<Playlist[]> {
    logger.debug('Getting library playlists', { limit });

    const _response = await this.makeRequest<unknown>('browse', {
      browseId: 'FEmusic_liked_playlists',
    });

    // TODO: Parse response to extract playlists
    // Implementation depends on response structure
    const playlists: Playlist[] = [];

    return playlists.slice(0, limit);
  }

  /**
   * Get playlist details with tracks
   */
  async getPlaylist(playlistId: string, limit: number = 100): Promise<Playlist> {
    logger.debug('Getting playlist', { playlistId, limit });

    // Ensure playlist ID has correct prefix
    const browseId = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;

    const response = await this.makeRequest<unknown>('browse', {
      browseId,
    });

    return parsePlaylist(response, playlistId, limit);
  }

  /**
   * Create a new playlist
   */
  async createPlaylist(
    name: string,
    description?: string,
    privacyStatus: 'PRIVATE' | 'PUBLIC' | 'UNLISTED' = 'PRIVATE'
  ): Promise<string> {
    logger.debug('Creating playlist', { name, privacyStatus });

    const response = await this.makeRequest<{ playlistId?: string }>(
      'playlist/create',
      {
        title: name,
        description: description ?? '',
        privacyStatus,
      }
    );

    if (!response.playlistId) {
      throw new Error('Failed to create playlist');
    }

    logger.info('Playlist created', { playlistId: response.playlistId });

    return response.playlistId;
  }

  /**
   * Delete a playlist
   */
  async deletePlaylist(playlistId: string): Promise<void> {
    logger.debug('Deleting playlist', { playlistId });

    await this.makeRequest('playlist/delete', {
      playlistId,
    });

    logger.info('Playlist deleted', { playlistId });
  }

  /**
   * Edit playlist metadata
   */
  async editPlaylist(
    playlistId: string,
    updates: {
      name?: string;
      description?: string;
      privacyStatus?: 'PRIVATE' | 'PUBLIC' | 'UNLISTED';
    }
  ): Promise<void> {
    logger.debug('Editing playlist', { playlistId, updates });

    const actions: unknown[] = [];

    if (updates.name) {
      actions.push({
        action: 'ACTION_SET_PLAYLIST_NAME',
        playlistName: updates.name,
      });
    }

    if (updates.description !== undefined) {
      actions.push({
        action: 'ACTION_SET_PLAYLIST_DESCRIPTION',
        playlistDescription: updates.description,
      });
    }

    if (updates.privacyStatus) {
      actions.push({
        action: 'ACTION_SET_PLAYLIST_PRIVACY',
        playlistPrivacy: updates.privacyStatus,
      });
    }

    if (actions.length === 0) {
      return;
    }

    await this.makeRequest('browse/edit_playlist', {
      playlistId,
      actions,
    });

    logger.info('Playlist edited', { playlistId });
  }

  /**
   * Add songs to playlist (batch operation)
   */
  async addPlaylistItems(
    playlistId: string,
    videoIds: string[]
  ): Promise<void> {
    logger.debug('Adding songs to playlist', {
      playlistId,
      count: videoIds.length,
    });

    const actions = videoIds.map((videoId) => ({
      action: 'ACTION_ADD_VIDEO',
      addedVideoId: videoId,
    }));

    await this.makeRequest('browse/edit_playlist', {
      playlistId,
      actions,
    });

    logger.info('Songs added to playlist', {
      playlistId,
      count: videoIds.length,
    });
  }

  /**
   * Remove songs from playlist (batch operation)
   */
  async removePlaylistItems(
    playlistId: string,
    setVideoIds: string[]
  ): Promise<void> {
    logger.debug('Removing songs from playlist', {
      playlistId,
      count: setVideoIds.length,
    });

    const actions = setVideoIds.map((setVideoId) => ({
      action: 'ACTION_REMOVE_VIDEO',
      setVideoId,
    }));

    await this.makeRequest('browse/edit_playlist', {
      playlistId,
      actions,
    });

    logger.info('Songs removed from playlist', {
      playlistId,
      count: setVideoIds.length,
    });
  }

  // ===========================================================================
  // Library Methods
  // ===========================================================================

  /**
   * Get user's liked songs
   */
  async getLibrarySongs(limit: number = 100): Promise<Song[]> {
    logger.debug('Getting library songs', { limit });

    const response = await this.makeRequest<unknown>('browse', {
      browseId: 'FEmusic_liked_videos',
    });

    return parseLibrarySongs(response, limit);
  }

  /**
   * Get user's liked albums
   */
  async getLibraryAlbums(limit: number = 25): Promise<Album[]> {
    logger.debug('Getting library albums', { limit });

    const _response = await this.makeRequest<unknown>('browse', {
      browseId: 'FEmusic_liked_albums',
    });

    // TODO: Parse response to extract albums
    const albums: Album[] = [];
    return albums.slice(0, limit);
  }

  /**
   * Get user's followed artists
   */
  async getLibraryArtists(limit: number = 25): Promise<Artist[]> {
    logger.debug('Getting library artists', { limit });

    const _response = await this.makeRequest<unknown>('browse', {
      browseId: 'FEmusic_library_corpus_track_artists',
    });

    // TODO: Parse response to extract artists
    const artists: Artist[] = [];
    return artists.slice(0, limit);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get rate limiter statistics
   */
  getRateLimitStats() {
    return this.rateLimiter.getStats();
  }

  /**
   * Close the client and clean up resources
   */
  async close(): Promise<void> {
    logger.info('YouTube Music client closed');
  }
}
