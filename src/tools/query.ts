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
  server.registerTool(
    'search_songs',
    {
      title: 'Search Songs',
      description: 'Search for songs on YouTube Music. Returns structured JSON with song title, album, artist, year, and video ID.',
      inputSchema: {
        query: z.string().describe('Search query (song name, lyrics, etc.)'),
        limit: z.number().min(1).max(50).default(20).describe('Maximum number of results to return'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
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
  server.registerTool(
    'search_albums',
    {
      title: 'Search Albums',
      description: 'Search for albums on YouTube Music. Returns album name, artist, year, and browse ID.',
      inputSchema: {
        query: z.string().describe('Search query (album name, artist, etc.)'),
        limit: z.number().min(1).max(50).default(20).describe('Maximum number of results to return'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
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
  server.registerTool(
    'search_artists',
    {
      title: 'Search Artists',
      description: 'Search for artists on YouTube Music. Returns artist name, browse ID, and thumbnails.',
      inputSchema: {
        query: z.string().describe('Search query (artist name)'),
        limit: z.number().min(1).max(50).default(20).describe('Maximum number of results to return'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
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
  server.registerTool(
    'get_song_info',
    {
      title: 'Get Song Info',
      description: 'Get detailed information about a specific song by video ID. Returns title, artist, album, duration, and thumbnails.',
      inputSchema: {
        video_id: z.string().describe('YouTube Music video ID'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
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
  server.registerTool(
    'get_album_info',
    {
      title: 'Get Album Info',
      description: 'Get detailed album information including all tracks, year, and artist. Use browse_id from search results.',
      inputSchema: {
        browse_id: z.string().describe('Album browse ID from search results'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
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
  server.registerTool(
    'get_artist_info',
    {
      title: 'Get Artist Info',
      description: 'Get detailed artist information including top songs. Use browse_id from search results.',
      inputSchema: {
        browse_id: z.string().describe('Artist browse ID (channel ID) from search results'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
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
  server.registerTool(
    'get_library_songs',
    {
      title: 'Get Library Songs',
      description: 'Get the user\'s liked songs from their YouTube Music library. Returns structured JSON with song details.',
      inputSchema: {
        limit: z.number().min(1).max(500).default(100).describe('Maximum number of songs to return'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
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
