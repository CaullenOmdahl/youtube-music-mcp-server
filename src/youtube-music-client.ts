import YTMusic from "ytmusic-api";
import YTMusicApiAuth from "youtube-music-ts-api";
import { AuthManager } from "./auth.js";
import { SearchResult, SearchToolRequest, Song, Playlist, GetPlaylistRequest } from "./types.js";

export class YouTubeMusicClient {
  private ytmusicSearch: YTMusic;
  private ytmusicApi?: any;
  private authManager: AuthManager;
  private initialized = false;

  constructor() {
    this.ytmusicSearch = new YTMusic();
    this.authManager = new AuthManager();
  }

  async initialize(): Promise<void> {
    try {
      await this.authManager.loadAuth();

      // Initialize the search API (read-only)
      await this.ytmusicSearch.initialize();

      // Initialize the authenticated API if we have cookies
      if (this.authManager.isAuthenticated()) {
        const cookies = this.authManager.getCookies();
        if (cookies) {
          try {
            this.ytmusicApi = new YTMusicApiAuth();
            await this.ytmusicApi.authenticate(cookies);
            console.log('YouTube Music authenticated API initialized');
          } catch (error) {
            console.warn('Failed to initialize authenticated API, falling back to search-only:', error);
          }
        }
      }

      this.initialized = true;
      console.log('YouTube Music client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize YouTube Music client:', error);
      throw new Error(`YouTube Music client initialization failed: ${error}`);
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('YouTube Music client not initialized. Call initialize() first.');
    }
  }

  private requireAuthentication(): void {
    if (!this.authManager.isAuthenticated() || !this.ytmusicApi) {
      throw new Error('Authentication required for this operation. Please authenticate first.');
    }
  }

  async search(request: SearchToolRequest): Promise<SearchResult> {
    this.ensureInitialized();

    try {
      const results: SearchResult = {};

      // Use the search API for all searches
      if (request.type === 'songs' || request.type === 'all') {
        const songs = await this.ytmusicSearch.search(request.query);

        // Filter to only songs and transform to our format
        const songResults = songs
          .filter((item: any) => item.type === 'SONG')
          .slice(0, request.limit)
          .map((item: any): Song => ({
            videoId: item.videoId,
            title: item.name,
            artists: [{ name: item.artist.name, id: item.artist.artistId }],
            album: item.album ? { name: item.album.name, id: item.album.albumId } : undefined,
            duration: item.duration ? Math.floor(item.duration / 60) + ':' + String(item.duration % 60).padStart(2, '0') : undefined,
            thumbnails: item.thumbnails,
            isExplicit: item.isExplicit,
            year: item.year
          }));

        results.songs = songResults;
      }

      if (request.type === 'artists' || request.type === 'all') {
        const artists = await this.ytmusicSearch.search(request.query);

        // Filter to only artists and transform
        const artistResults = artists
          .filter((item: any) => item.type === 'ARTIST')
          .slice(0, request.limit)
          .map((item: any) => ({
            id: item.artistId,
            name: item.name,
            thumbnails: item.thumbnails,
            subscribers: item.subscribers
          }));

        results.artists = artistResults;
      }

      if (request.type === 'albums' || request.type === 'all') {
        const albums = await this.ytmusicSearch.search(request.query);

        // Filter to only albums and transform
        const albumResults = albums
          .filter((item: any) => item.type === 'ALBUM')
          .slice(0, request.limit)
          .map((item: any) => ({
            id: item.albumId,
            title: item.name,
            artists: [{ name: item.artist.name, id: item.artist.artistId }],
            year: item.year,
            thumbnails: item.thumbnails,
            trackCount: item.trackCount
          }));

        results.albums = albumResults;
      }

      if (request.type === 'playlists' || request.type === 'all') {
        const playlists = await this.ytmusicSearch.search(request.query);

        // Filter to only playlists and transform
        const playlistResults = playlists
          .filter((item: any) => item.type === 'PLAYLIST')
          .slice(0, request.limit)
          .map((item: any): Playlist => ({
            id: item.playlistId,
            title: item.name,
            description: item.description,
            thumbnails: item.thumbnails,
            trackCount: item.videoCount,
            author: item.artist?.name
          }));

        results.playlists = playlistResults;
      }

      return results;
    } catch (error) {
      console.error('Search failed:', error);
      throw new Error(`Search failed: ${error}`);
    }
  }

  async getLibraryPlaylists(): Promise<Playlist[]> {
    this.ensureInitialized();
    this.requireAuthentication();

    try {
      const playlists = await this.ytmusicApi.getLibraryPlaylists();

      return playlists.map((playlist: any): Playlist => ({
        id: playlist.playlistId,
        title: playlist.title,
        description: playlist.description,
        thumbnails: playlist.thumbnails,
        trackCount: playlist.count,
        author: playlist.author,
        privacy: 'PRIVATE' // Library playlists are typically private
      }));
    } catch (error) {
      console.error('Failed to get library playlists:', error);
      throw new Error(`Failed to get library playlists: ${error}`);
    }
  }

  async getPlaylist(request: GetPlaylistRequest): Promise<{ playlist: Playlist; songs: Song[] }> {
    this.ensureInitialized();
    this.requireAuthentication();

    try {
      const playlistData = await this.ytmusicApi.getPlaylist(request.playlistId, request.limit);

      const playlist: Playlist = {
        id: playlistData.id,
        title: playlistData.title,
        description: playlistData.description,
        trackCount: playlistData.trackCount,
        author: playlistData.author,
        thumbnails: playlistData.thumbnails
      };

      const songs: Song[] = playlistData.tracks?.map((track: any): Song => ({
        videoId: track.videoId,
        title: track.title,
        artists: track.artists?.map((artist: any) => ({ name: artist.name, id: artist.id })) || [],
        album: track.album ? { name: track.album.name, id: track.album.id } : undefined,
        duration: track.duration,
        thumbnails: track.thumbnails,
        isExplicit: track.isExplicit,
        year: track.year
      })) || [];

      return { playlist, songs };
    } catch (error) {
      console.error('Failed to get playlist:', error);
      throw new Error(`Failed to get playlist: ${error}`);
    }
  }

  async createPlaylist(title: string, description?: string, privacy: 'PUBLIC' | 'PRIVATE' | 'UNLISTED' = 'PRIVATE', songIds?: string[]): Promise<{ playlistId: string; url: string }> {
    this.ensureInitialized();
    this.requireAuthentication();

    try {
      // Create the playlist
      const playlistId = await this.ytmusicApi.createPlaylist(title, description, privacy);

      // Add songs if provided
      if (songIds && songIds.length > 0) {
        await this.ytmusicApi.addPlaylistItems(playlistId, songIds);
      }

      return {
        playlistId,
        url: `https://music.youtube.com/playlist?list=${playlistId}`
      };
    } catch (error) {
      console.error('Failed to create playlist:', error);
      throw new Error(`Failed to create playlist: ${error}`);
    }
  }

  async addSongsToPlaylist(playlistId: string, songIds: string[]): Promise<void> {
    this.ensureInitialized();
    this.requireAuthentication();

    try {
      await this.ytmusicApi.addPlaylistItems(playlistId, songIds);
    } catch (error) {
      console.error('Failed to add songs to playlist:', error);
      throw new Error(`Failed to add songs to playlist: ${error}`);
    }
  }

  async removeSongsFromPlaylist(playlistId: string, songIds: string[]): Promise<void> {
    this.ensureInitialized();
    this.requireAuthentication();

    try {
      // Note: youtube-music-ts-api may require different parameters for removal
      // This is a simplified implementation - may need adjustment based on API
      await this.ytmusicApi.removePlaylistItems(playlistId, songIds);
    } catch (error) {
      console.error('Failed to remove songs from playlist:', error);
      throw new Error(`Failed to remove songs from playlist: ${error}`);
    }
  }

  async authenticate(cookies?: string, headers?: Record<string, string>): Promise<void> {
    try {
      if (cookies) {
        await this.authManager.setCookies(cookies);

        // Try to initialize the authenticated API
        try {
          this.ytmusicApi = new YTMusicApiAuth();
          await this.ytmusicApi.authenticate(cookies);
          console.log('Authentication successful');
        } catch (error) {
          console.warn('Failed to authenticate with YouTube Music API:', error);
          await this.authManager.clearAuth();
          throw error;
        }
      }

      if (headers) {
        await this.authManager.setHeaders(headers);
        console.log('Headers saved, but authentication with headers not implemented');
      }
    } catch (error) {
      console.error('Authentication failed:', error);
      await this.authManager.clearAuth();
      throw new Error(`Authentication failed: ${error}`);
    }
  }

  getAuthStatus(): { authenticated: boolean; hasCredentials: boolean } {
    return this.authManager.getAuthStatus();
  }

  async clearAuth(): Promise<void> {
    await this.authManager.clearAuth();
    this.ytmusicApi = undefined;
  }

  // Utility methods for playlist curation
  async getSongRecommendations(_basedOnPlaylistId?: string, basedOnSongs?: Song[]): Promise<Song[]> {
    this.ensureInitialized();

    try {
      // Use search to find similar songs based on patterns
      // This is a simplified implementation
      console.warn('Song recommendations use basic search patterns');

      if (basedOnSongs && basedOnSongs.length > 0) {
        // Use the first song as a base for similar recommendations
        const searchResults = await this.search({
          query: 'similar songs',
          type: 'songs',
          limit: 10
        });

        return searchResults.songs || [];
      }

      return [];
    } catch (error) {
      console.error('Failed to get song recommendations:', error);
      throw new Error(`Failed to get song recommendations: ${error}`);
    }
  }

  async analyzePlaylist(playlistId: string): Promise<{
    totalDuration: number;
    genres: string[];
    artists: Array<{ name: string; count: number }>;
    avgYear: number;
  }> {
    this.ensureInitialized();

    try {
      const { songs } = await this.getPlaylist({ playlistId, limit: 100 });

      // Analyze playlist content
      const artistCounts: Record<string, number> = {};
      let totalSeconds = 0;
      const years: number[] = [];

      songs.forEach(song => {
        // Count artists
        song.artists?.forEach(artist => {
          artistCounts[artist.name] = (artistCounts[artist.name] || 0) + 1;
        });

        // Sum duration (if available and parseable)
        if (song.duration) {
          // Parse duration string (e.g., "3:45" to seconds)
          const parts = song.duration.split(':').map(Number);
          if (parts.length === 2) {
            totalSeconds += parts[0] * 60 + parts[1];
          }
        }

        // Collect years
        if (song.year) {
          years.push(song.year);
        }
      });

      const topArtists = Object.entries(artistCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const avgYear = years.length > 0
        ? Math.round(years.reduce((sum, year) => sum + year, 0) / years.length)
        : 0;

      return {
        totalDuration: totalSeconds,
        genres: [], // Genre detection would require additional data or external service
        artists: topArtists,
        avgYear
      };
    } catch (error) {
      console.error('Failed to analyze playlist:', error);
      throw new Error(`Failed to analyze playlist: ${error}`);
    }
  }
}