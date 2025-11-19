import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('query-tools');

/**
 * Register query tools for searching and retrieving music data
 */
export function registerQueryTools(server: McpServer, context: ServerContext): void {
  /**
   * Search for songs on YouTube Music
   */
  server.tool(
    'search_songs',
    'Search for songs on YouTube Music. Returns structured JSON with song title, album, artist, year, and video ID.',
    {
      query: z.string().describe('Search query (song name, lyrics, etc.)'),
      limit: z.number().min(1).max(50).default(20).describe('Maximum number of results to return'),
    },
    async ({ query, limit }) => {
      logger.debug('search_songs called', { query, limit });

      try {
        const result = await context.ytMusic.search(query, {
          filter: 'songs',
          limit,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                songs: result.songs ?? [],
                metadata: result.metadata,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('search_songs failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to search songs' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Search for albums on YouTube Music
   */
  server.tool(
    'search_albums',
    'Search for albums on YouTube Music. Returns album name, artist, year, and browse ID.',
    {
      query: z.string().describe('Search query (album name, artist, etc.)'),
      limit: z.number().min(1).max(50).default(20).describe('Maximum number of results to return'),
    },
    async ({ query, limit }) => {
      logger.debug('search_albums called', { query, limit });

      try {
        const result = await context.ytMusic.search(query, {
          filter: 'albums',
          limit,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                albums: result.albums ?? [],
                metadata: result.metadata,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('search_albums failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to search albums' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Search for artists on YouTube Music
   */
  server.tool(
    'search_artists',
    'Search for artists on YouTube Music. Returns artist name, browse ID, and thumbnails.',
    {
      query: z.string().describe('Search query (artist name)'),
      limit: z.number().min(1).max(50).default(20).describe('Maximum number of results to return'),
    },
    async ({ query, limit }) => {
      logger.debug('search_artists called', { query, limit });

      try {
        const result = await context.ytMusic.search(query, {
          filter: 'artists',
          limit,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                artists: result.artists ?? [],
                metadata: result.metadata,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('search_artists failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to search artists' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Get detailed information about a specific song
   */
  server.tool(
    'get_song_info',
    'Get detailed information about a specific song by video ID. Returns title, artist, album, duration, and thumbnails.',
    {
      video_id: z.string().describe('YouTube Music video ID'),
    },
    async ({ video_id }) => {
      logger.debug('get_song_info called', { video_id });

      try {
        const song = await context.ytMusic.getSong(video_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ song }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('get_song_info failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to get song info' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Get detailed information about an album including all tracks
   */
  server.tool(
    'get_album_info',
    'Get detailed album information including all tracks, year, and artist. Use browse_id from search results.',
    {
      browse_id: z.string().describe('Album browse ID from search results'),
    },
    async ({ browse_id }) => {
      logger.debug('get_album_info called', { browse_id });

      try {
        const album = await context.ytMusic.getAlbum(browse_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ album }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('get_album_info failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to get album info' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Get detailed information about an artist including top songs
   */
  server.tool(
    'get_artist_info',
    'Get detailed artist information including top songs. Use browse_id from search results.',
    {
      browse_id: z.string().describe('Artist browse ID (channel ID) from search results'),
    },
    async ({ browse_id }) => {
      logger.debug('get_artist_info called', { browse_id });

      try {
        const artist = await context.ytMusic.getArtist(browse_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ artist }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('get_artist_info failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to get artist info' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Get user's liked songs from library
   */
  server.tool(
    'get_library_songs',
    'Get the user\'s liked songs from their YouTube Music library. Returns structured JSON with song details.',
    {
      limit: z.number().min(1).max(500).default(100).describe('Maximum number of songs to return'),
    },
    async ({ limit }) => {
      logger.debug('get_library_songs called', { limit });

      try {
        const songs = await context.ytMusic.getLibrarySongs(limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                songs,
                metadata: {
                  returned: songs.length,
                  limit,
                },
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('get_library_songs failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to get library songs' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  logger.info('Query tools registered');
}
