import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('smart-playlist-tools');

/**
 * Register smart playlist tools for AI-driven playlist creation
 */
export function registerSmartPlaylistTools(server: McpServer, context: ServerContext): void {
  /**
   * Start a smart playlist session
   */
  server.registerTool(
    'start_smart_playlist',
    {
      title: 'Start Smart Playlist',
      description: 'Start an interactive smart playlist creation session. Returns session ID to use with other smart playlist tools.',
      inputSchema: {
        mode: z.enum(['discover', 'from_library', 'mixed']).default('discover').describe(
          'discover: Find new music based on seeds. from_library: Build from liked songs. mixed: Combine both.'
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({ mode }) => {
      logger.debug('start_smart_playlist called', { mode });

      try {
        const session = context.sessions.createSession(mode);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                sessionId: session.sessionId,
                mode: session.mode,
                message: 'Smart playlist session started. Add seed artists or tracks to begin building recommendations.',
                nextSteps: [
                  'Use add_seed_artist to add artists that influence the playlist style',
                  'Use add_seed_track to add specific tracks as seeds',
                  'Use refine_recommendations to set preferences (exclude artists, prefer/avoid tags)',
                  'Use get_recommendations to generate the playlist',
                ],
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('start_smart_playlist failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to start smart playlist session' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Add seed artist to session
   */
  server.registerTool(
    'add_seed_artist',
    {
      title: 'Add Seed Artist',
      description: 'Add an artist to influence smart playlist recommendations. Looks up artist in MusicBrainz and retrieves tags.',
      inputSchema: {
        session_id: z.string().describe('Smart playlist session ID'),
        artist_name: z.string().describe('Artist name to add as seed'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ session_id, artist_name }) => {
      logger.debug('add_seed_artist called', { session_id, artist_name });

      try {
        const session = context.sessions.getSession(session_id);
        if (!session) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Session not found or expired' }),
              },
            ],
            isError: true,
          };
        }

        // Resolve artist using MusicBrainz
        const artist = await context.recommendations.resolveArtist(artist_name);
        if (!artist) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Artist "${artist_name}" not found in MusicBrainz`,
                }),
              },
            ],
            isError: true,
          };
        }

        // Add to session
        context.sessions.addSeedArtist(session_id, artist);

        // Get updated session
        const updatedSession = context.sessions.getSession(session_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                artist: {
                  name: artist.name,
                  mbid: artist.mbid,
                  tags: artist.tags?.map(t => t.name) ?? [],
                },
                session: {
                  totalSeedArtists: updatedSession?.seedArtists.length ?? 0,
                  totalSeedTracks: updatedSession?.seedTracks.length ?? 0,
                },
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('add_seed_artist failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to add seed artist' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Add seed track to session
   */
  server.registerTool(
    'add_seed_track',
    {
      title: 'Add Seed Track',
      description: 'Add a specific track as a seed for smart playlist recommendations.',
      inputSchema: {
        session_id: z.string().describe('Smart playlist session ID'),
        track_name: z.string().describe('Track title'),
        artist_name: z.string().describe('Artist name'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ session_id, track_name, artist_name }) => {
      logger.debug('add_seed_track called', { session_id, track_name, artist_name });

      try {
        const session = context.sessions.getSession(session_id);
        if (!session) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Session not found or expired' }),
              },
            ],
            isError: true,
          };
        }

        // Resolve track using MusicBrainz
        const track = await context.recommendations.resolveTrack(track_name, artist_name);
        if (!track) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Track "${track_name}" by "${artist_name}" not found in MusicBrainz`,
                }),
              },
            ],
            isError: true,
          };
        }

        // Add to session
        context.sessions.addSeedTrack(session_id, track);

        const updatedSession = context.sessions.getSession(session_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                track: {
                  title: track.title,
                  artist: track.artist,
                  mbid: track.mbid,
                },
                session: {
                  totalSeedArtists: updatedSession?.seedArtists.length ?? 0,
                  totalSeedTracks: updatedSession?.seedTracks.length ?? 0,
                },
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('add_seed_track failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to add seed track' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Refine recommendation parameters
   */
  server.registerTool(
    'refine_recommendations',
    {
      title: 'Refine Recommendations',
      description: 'Adjust recommendation parameters: exclude artists, prefer/avoid tags, set diversity level.',
      inputSchema: {
        session_id: z.string().describe('Smart playlist session ID'),
        exclude_artists: z.array(z.string()).optional().describe('Artists to exclude from recommendations'),
        prefer_tags: z.array(z.string()).optional().describe('Tags to prefer (e.g., "electronic", "ambient")'),
        avoid_tags: z.array(z.string()).optional().describe('Tags to avoid (e.g., "metal", "country")'),
        diversity: z.enum(['focused', 'balanced', 'diverse']).optional().describe(
          'focused: Very similar to seeds. balanced: Mix of similar and new. diverse: Exploratory.'
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ session_id, exclude_artists, prefer_tags, avoid_tags, diversity }) => {
      logger.debug('refine_recommendations called', {
        session_id,
        exclude_artists,
        prefer_tags,
        avoid_tags,
        diversity,
      });

      try {
        const session = context.sessions.getSession(session_id);
        if (!session) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Session not found or expired' }),
              },
            ],
            isError: true,
          };
        }

        context.sessions.updateRefinement(session_id, {
          excludeArtists: exclude_artists,
          preferTags: prefer_tags,
          avoidTags: avoid_tags,
          diversity,
        });

        const updatedSession = context.sessions.getSession(session_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                refinement: {
                  excludeArtists: updatedSession?.excludeArtists ?? [],
                  preferTags: updatedSession?.preferTags ?? [],
                  avoidTags: updatedSession?.avoidTags ?? [],
                  diversity: updatedSession?.diversity ?? 'balanced',
                },
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('refine_recommendations failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to refine recommendations' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Generate recommendations
   */
  server.registerTool(
    'get_recommendations',
    {
      title: 'Get Recommendations',
      description: 'Generate playlist recommendations based on seeds and refinement settings. Searches YouTube Music for tracks.',
      inputSchema: {
        session_id: z.string().describe('Smart playlist session ID'),
        limit: z.number().min(1).max(100).default(50).describe('Maximum number of recommendations'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ session_id, limit }) => {
      logger.debug('get_recommendations called', { session_id, limit });

      try {
        const session = context.sessions.getSession(session_id);
        if (!session) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Session not found or expired' }),
              },
            ],
            isError: true,
          };
        }

        if (session.seedArtists.length === 0 && session.seedTracks.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'No seeds added. Use add_seed_artist or add_seed_track first.',
                }),
              },
            ],
            isError: true,
          };
        }

        // Build recommendations from ListenBrainz
        const lbRecordings = await context.recommendations.buildRecommendations(
          session.seedArtists,
          session.seedTracks,
          {
            excludeArtists: session.excludeArtists,
            preferTags: session.preferTags,
            avoidTags: session.avoidTags,
            diversity: session.diversity,
            limit,
          }
        );

        // Search YouTube Music for the recommendations
        const result = await context.recommendations.searchOnYouTubeMusic(lbRecordings);

        // Store recommendations in session
        context.sessions.setRecommendations(session_id, result.songs);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                recommendations: result.songs,
                notFound: result.notFound,
                metadata: {
                  found: result.songs.length,
                  notFoundCount: result.notFound.length,
                  total: result.songs.length + result.notFound.length,
                },
                nextSteps: [
                  'Use preview_playlist to see the full playlist',
                  'Use create_smart_playlist to create the playlist on YouTube Music',
                ],
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('get_recommendations failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to get recommendations' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Preview playlist before creation
   */
  server.registerTool(
    'preview_playlist',
    {
      title: 'Preview Playlist',
      description: 'Preview the smart playlist before creating it. Shows all tracks and session details.',
      inputSchema: {
        session_id: z.string().describe('Smart playlist session ID'),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ session_id }) => {
      logger.debug('preview_playlist called', { session_id });

      try {
        const session = context.sessions.getSession(session_id);
        if (!session) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Session not found or expired' }),
              },
            ],
            isError: true,
          };
        }

        // Calculate estimated duration
        const totalSeconds = session.recommendations.reduce(
          (sum, song) => sum + (song.durationSeconds ?? 0),
          0
        );
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                preview: {
                  trackCount: session.recommendations.length,
                  estimatedDuration: `${hours}h ${minutes}m`,
                  tracks: session.recommendations,
                },
                session: {
                  mode: session.mode,
                  seedArtists: session.seedArtists.map(a => a.name),
                  seedTracks: session.seedTracks.map(t => `${t.title} - ${t.artist}`),
                  diversity: session.diversity,
                },
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('preview_playlist failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to preview playlist' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Create the smart playlist on YouTube Music
   */
  server.registerTool(
    'create_smart_playlist',
    {
      title: 'Create Smart Playlist',
      description: 'Create the smart playlist on YouTube Music with all recommended tracks.',
      inputSchema: {
        session_id: z.string().describe('Smart playlist session ID'),
        name: z.string().describe('Playlist name'),
        description: z.string().optional().describe('Playlist description'),
        privacy: z.enum(['PRIVATE', 'PUBLIC', 'UNLISTED']).default('PRIVATE').describe('Privacy status'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ session_id, name, description, privacy }) => {
      logger.debug('create_smart_playlist called', { session_id, name, privacy });

      try {
        const session = context.sessions.getSession(session_id);
        if (!session) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Session not found or expired' }),
              },
            ],
            isError: true,
          };
        }

        if (session.recommendations.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'No recommendations generated. Use get_recommendations first.',
                }),
              },
            ],
            isError: true,
          };
        }

        // Create the playlist
        const playlistId = await context.ytMusic.createPlaylist(
          name,
          description,
          privacy
        );

        // Add all tracks
        const videoIds = session.recommendations
          .map(song => song.videoId)
          .filter((id): id is string => !!id);

        if (videoIds.length > 0) {
          await context.ytMusic.addPlaylistItems(playlistId, videoIds);
        }

        // Clean up session
        context.sessions.deleteSession(session_id);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                playlistId,
                name,
                trackCount: videoIds.length,
                message: `Smart playlist "${name}" created with ${videoIds.length} tracks`,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('create_smart_playlist failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to create smart playlist' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Get user taste profile
   */
  server.registerTool(
    'get_user_taste_profile',
    {
      title: 'Get User Taste Profile',
      description: 'Analyze user\'s liked songs to build a taste profile with top tags, artists, and genres.',
      inputSchema: {
        limit: z.number().min(10).max(500).default(100).describe('Number of liked songs to analyze'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ limit }) => {
      logger.debug('get_user_taste_profile called', { limit });

      try {
        // Get user's liked songs
        const songs = await context.ytMusic.getLibrarySongs(limit);

        // Aggregate artist names
        const artistCounts = new Map<string, number>();
        for (const song of songs) {
          for (const artist of song.artists) {
            const count = artistCounts.get(artist.name) ?? 0;
            artistCounts.set(artist.name, count + 1);
          }
        }

        // Get top artists
        const topArtists = Array.from(artistCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        // Look up tags for top artists
        const tagCounts = new Map<string, number>();
        for (const [artistName] of topArtists.slice(0, 5)) {
          try {
            const artist = await context.recommendations.resolveArtist(artistName);
            if (artist?.tags) {
              for (const tag of artist.tags) {
                const count = tagCounts.get(tag.name) ?? 0;
                tagCounts.set(tag.name, count + tag.count);
              }
            }
          } catch {
            // Skip if lookup fails
          }
        }

        const topTags = Array.from(tagCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([name]) => name);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                profile: {
                  analyzedSongs: songs.length,
                  topArtists: topArtists.map(([name, count]) => ({ name, count })),
                  topTags: topTags,
                },
                suggestion: `Based on your taste, try creating a smart playlist with seeds like: ${topArtists.slice(0, 3).map(([name]) => name).join(', ')}`,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('get_user_taste_profile failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to analyze taste profile' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  logger.info('Smart playlist tools registered');
}
