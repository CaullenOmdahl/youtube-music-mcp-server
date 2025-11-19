import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('playlist-tools');

/**
 * Register playlist management tools for full CRUD operations
 */
export function registerPlaylistTools(server: McpServer, context: ServerContext): void {
  /**
   * Get user's playlists
   */
  server.tool(
    'get_playlists',
    'Get the user\'s playlists from YouTube Music library. Returns playlist name, ID, and track count as structured JSON.',
    {
      limit: z.number().min(1).max(100).default(25).describe('Maximum number of playlists to return'),
    },
    async ({ limit }) => {
      logger.debug('get_playlists called', { limit });

      try {
        const playlists = await context.ytMusic.getLibraryPlaylists(limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                playlists,
                metadata: {
                  returned: playlists.length,
                  limit,
                },
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('get_playlists failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to get playlists' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Get playlist details with tracks
   */
  server.tool(
    'get_playlist_details',
    'Get detailed playlist information including all tracks with song, album, artist, and duration.',
    {
      playlist_id: z.string().describe('Playlist ID'),
      limit: z.number().min(1).max(500).default(100).describe('Maximum number of tracks to return'),
    },
    async ({ playlist_id, limit }) => {
      logger.debug('get_playlist_details called', { playlist_id, limit });

      try {
        const playlist = await context.ytMusic.getPlaylist(playlist_id, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                playlist,
                metadata: {
                  totalTracks: playlist.trackCount ?? 0,
                  returned: playlist.tracks?.length ?? 0,
                },
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('get_playlist_details failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to get playlist details' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Create a new playlist
   */
  server.tool(
    'create_playlist',
    'Create a new YouTube Music playlist. Returns the new playlist ID.',
    {
      name: z.string().min(1).describe('Playlist name'),
      description: z.string().optional().describe('Playlist description'),
      privacy: z.enum(['PRIVATE', 'PUBLIC', 'UNLISTED']).default('PRIVATE').describe('Privacy status'),
    },
    async ({ name, description, privacy }) => {
      logger.debug('create_playlist called', { name, privacy });

      try {
        const playlistId = await context.ytMusic.createPlaylist(
          name,
          description,
          privacy
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                playlistId,
                message: `Playlist "${name}" created successfully`,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('create_playlist failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to create playlist' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Edit playlist metadata
   */
  server.tool(
    'edit_playlist',
    'Edit playlist metadata (name, description, privacy). Only provide fields you want to change.',
    {
      playlist_id: z.string().describe('Playlist ID to edit'),
      name: z.string().optional().describe('New playlist name'),
      description: z.string().optional().describe('New playlist description'),
      privacy: z.enum(['PRIVATE', 'PUBLIC', 'UNLISTED']).optional().describe('New privacy status'),
    },
    async ({ playlist_id, name, description, privacy }) => {
      logger.debug('edit_playlist called', { playlist_id, name, privacy });

      try {
        await context.ytMusic.editPlaylist(playlist_id, {
          name,
          description,
          privacyStatus: privacy,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                playlistId: playlist_id,
                message: 'Playlist updated successfully',
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('edit_playlist failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to edit playlist' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Delete a playlist
   */
  server.tool(
    'delete_playlist',
    'Delete a playlist from YouTube Music. This action cannot be undone.',
    {
      playlist_id: z.string().describe('Playlist ID to delete'),
    },
    async ({ playlist_id }) => {
      logger.debug('delete_playlist called', { playlist_id });

      try {
        await context.ytMusic.deletePlaylist(playlist_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'Playlist deleted successfully',
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('delete_playlist failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to delete playlist' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Add songs to playlist (batch operation)
   */
  server.tool(
    'add_songs_to_playlist',
    'Add one or more songs to an existing playlist. Supports batch operations for efficiency.',
    {
      playlist_id: z.string().describe('Target playlist ID'),
      video_ids: z.array(z.string()).min(1).describe('Array of video IDs to add'),
    },
    async ({ playlist_id, video_ids }) => {
      logger.debug('add_songs_to_playlist called', {
        playlist_id,
        count: video_ids.length,
      });

      try {
        await context.ytMusic.addPlaylistItems(playlist_id, video_ids);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                playlistId: playlist_id,
                addedCount: video_ids.length,
                message: `Added ${video_ids.length} song(s) to playlist`,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('add_songs_to_playlist failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to add songs to playlist' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Remove songs from playlist (batch operation)
   */
  server.tool(
    'remove_songs_from_playlist',
    'Remove one or more songs from a playlist. Requires setVideoId (not videoId) from playlist track data.',
    {
      playlist_id: z.string().describe('Playlist ID'),
      set_video_ids: z.array(z.string()).min(1).describe('Array of setVideoIds from playlist tracks to remove'),
    },
    async ({ playlist_id, set_video_ids }) => {
      logger.debug('remove_songs_from_playlist called', {
        playlist_id,
        count: set_video_ids.length,
      });

      try {
        await context.ytMusic.removePlaylistItems(playlist_id, set_video_ids);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                playlistId: playlist_id,
                removedCount: set_video_ids.length,
                message: `Removed ${set_video_ids.length} song(s) from playlist`,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('remove_songs_from_playlist failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to remove songs from playlist' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  logger.info('Playlist tools registered');
}
