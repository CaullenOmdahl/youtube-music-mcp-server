import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';
import { SessionManager } from '../adaptive-playlist/session-manager.js';
import { RecommendationEngine } from '../adaptive-playlist/recommendation-engine.js';
import { encodeProfile, decodeProfile, embedProfileCode } from '../adaptive-playlist/encoder.js';
import type { Profile, Context } from '../adaptive-playlist/types.js';

const logger = createLogger('adaptive-playlist-tools');

/**
 * Register adaptive playlist tools for AI-guided playlist creation
 */
export function registerAdaptivePlaylistTools(
  server: McpServer,
  context: ServerContext
): void {
  // Initialize session manager and recommendation engine
  const sessionManager = new SessionManager(context.db);
  const recommendationEngine = new RecommendationEngine(
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ytMusic: context.ytMusic as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      musicBrainz: context.musicBrainz as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      listenBrainz: context.listenBrainz as any,
      db: context.db,
      userId: '', // Will be set per request
    },
    context.db
  );

  /**
   * Start a new playlist conversation session
   */
  server.registerTool(
    'start_playlist_conversation',
    {
      title: 'Start Playlist Conversation',
      description:
        'Start an AI-guided conversation to build a personalized playlist. Returns a session ID and initial message.',
      inputSchema: {
        userId: z
          .string()
          .optional()
          .describe('User ID (optional, defaults to authenticated user)'),
      },
      annotations: {
        readOnlyHint: false,
      },
    },
    async ({ userId }) => {
      logger.debug('start_playlist_conversation called', { userId });

      try {
        const finalUserId = userId || 'default_user';
        const session = await sessionManager.createSession(finalUserId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  sessionId: session.sessionId,
                  message: session.conversationHistory[0]?.message || 'Hello! Let\'s build your perfect playlist.',
                  questionsAsked: session.questionsAsked,
                  confidence: session.confidence,
                  readyForPlaylist: false,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logger.error('start_playlist_conversation failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to start conversation' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Continue the playlist conversation with user input
   */
  server.registerTool(
    'continue_conversation',
    {
      title: 'Continue Conversation',
      description:
        'Continue the AI-guided conversation with user response. AI extracts preferences and determines next question or if ready for generation.',
      inputSchema: {
        sessionId: z.string().describe('Session ID from start_playlist_conversation'),
        userMessage: z.string().describe('User response to the AI question'),
        extractedInfo: z
          .record(z.unknown())
          .optional()
          .describe('AI-extracted profile information (optional)'),
      },
      annotations: {
        readOnlyHint: false,
      },
    },
    async ({ sessionId, userMessage, extractedInfo }) => {
      logger.debug('continue_conversation called', { sessionId });

      try {
        const session = await sessionManager.getSession(sessionId);
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

        // Generate next AI response based on current state
        const aiResponse = generateNextQuestion(session, extractedInfo as Partial<Profile>);

        // Update session
        const updated = await sessionManager.updateSession(
          sessionId,
          userMessage,
          aiResponse,
          extractedInfo as Partial<Profile>
        );

        const readyForPlaylist = sessionManager.isReadyForPlaylist(updated);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  sessionId: updated.sessionId,
                  message: aiResponse,
                  questionsAsked: updated.questionsAsked,
                  confidence: updated.confidence,
                  readyForPlaylist,
                  currentProfile: updated.profile,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logger.error('continue_conversation failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to continue conversation' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Generate adaptive playlist from conversation session
   */
  server.registerTool(
    'generate_adaptive_playlist',
    {
      title: 'Generate Adaptive Playlist',
      description:
        'Generate a personalized playlist from a conversation session or profile code. Uses research-backed scoring to match tracks to preferences.',
      inputSchema: {
        sessionId: z.string().optional().describe('Session ID (if using conversation)'),
        profileCode: z
          .string()
          .optional()
          .describe('37-character profile code (if using existing profile)'),
        playlistName: z.string().describe('Name for the playlist'),
        playlistDescription: z.string().optional().describe('Description for the playlist'),
        trackCount: z
          .number()
          .min(10)
          .max(100)
          .default(30)
          .describe('Number of tracks to include'),
        createOnYouTubeMusic: z
          .boolean()
          .default(true)
          .describe('Whether to create playlist on YouTube Music'),
      },
      annotations: {
        readOnlyHint: false,
      },
    },
    async ({
      sessionId,
      profileCode,
      playlistName,
      playlistDescription,
      trackCount,
      createOnYouTubeMusic,
    }) => {
      logger.debug('generate_adaptive_playlist called', { sessionId, profileCode });

      try {
        let profile: Profile;
        let userId: string;

        if (sessionId) {
          const session = await sessionManager.getSession(sessionId);
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

          if (!sessionManager.isReadyForPlaylist(session)) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Session not ready for playlist generation',
                    questionsAsked: session.questionsAsked,
                    confidence: session.confidence,
                    requiredQuestions: 5,
                    requiredConfidence: 21,
                  }),
                },
              ],
              isError: true,
            };
          }

          profile = session.profile as Profile;
          userId = session.userId;
        } else if (profileCode) {
          profile = decodeProfile(profileCode);
          userId = 'profile_user';
        } else {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Either sessionId or profileCode must be provided',
                }),
              },
            ],
            isError: true,
          };
        }

        // Set userId in context
        profile.userId = userId;

        // Create context from profile
        const playlistContext: Context = {
          activity: profile.activity,
          socialFunction: profile.socialFunction,
          timePattern: profile.timePattern,
          environment: profile.environment,
          moodValence: profile.mood.valence,
          moodArousal: profile.mood.arousal,
          targetValence: profile.mood.targetValence,
          targetArousal: profile.mood.targetArousal,
          regulationStrategy: profile.mood.regulationStrategy,
        };

        // Generate recommendations
        const recommendations = await recommendationEngine.generateRecommendations(
          profile,
          playlistContext,
          trackCount
        );

        if (recommendations.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'No recommendations generated' }),
              },
            ],
            isError: true,
          };
        }

        // Encode profile for embedding
        const encodedProfile = encodeProfile(profile);

        // Create playlist on YouTube Music if requested
        let playlistId: string | undefined;
        if (createOnYouTubeMusic) {
          const description = embedProfileCode(
            playlistDescription || 'Personalized playlist created by AI',
            encodedProfile
          );

          playlistId = await context.ytMusic.createPlaylist(playlistName, description, 'PRIVATE');

          const videoIds = recommendations.map((r) => r.track.videoId);
          await context.ytMusic.addPlaylistItems(playlistId, videoIds);

          logger.info('Playlist created on YouTube Music', { playlistId, trackCount: videoIds.length });
        }

        // Mark session as completed if used
        if (sessionId) {
          await sessionManager.completeSession(sessionId);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  profileCode: encodedProfile,
                  playlistId,
                  trackCount: recommendations.length,
                  avgScore: recommendations.reduce((sum, r) => sum + r.score, 0) / recommendations.length,
                  tracks: recommendations.map((r) => ({
                    videoId: r.track.videoId,
                    title: r.track.title,
                    artist: r.track.artist,
                    score: r.score,
                    breakdown: r.breakdown,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logger.error('generate_adaptive_playlist failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to generate playlist' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * View decoded profile from code
   */
  server.registerTool(
    'view_profile',
    {
      title: 'View Profile',
      description: 'Decode and view a 37-character profile code to see preferences.',
      inputSchema: {
        profileCode: z.string().length(37).describe('37-character profile code'),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ profileCode }) => {
      logger.debug('view_profile called');

      try {
        const profile = decodeProfile(profileCode);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(profile, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('view_profile failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Invalid profile code' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Decode playlist profile from YouTube Music playlist
   */
  server.registerTool(
    'decode_playlist_profile',
    {
      title: 'Decode Playlist Profile',
      description:
        'Extract and decode the profile code embedded in a YouTube Music playlist description.',
      inputSchema: {
        playlistId: z.string().describe('YouTube Music playlist ID'),
      },
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ playlistId }) => {
      logger.debug('decode_playlist_profile called', { playlistId });

      try {
        const playlist = await context.ytMusic.getPlaylist(playlistId);
        const description = (playlist as { description?: string }).description || '';

        // Extract profile code from description
        const codeMatch = description.match(/🧬:([1-9A-Z]-[0-9A-ZX]{35})/);
        if (!codeMatch) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'No profile code found in playlist description' }),
              },
            ],
            isError: true,
          };
        }

        const profileCode = codeMatch[1] || '';
        const profile = decodeProfile(profileCode);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  profileCode,
                  profile,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logger.error('decode_playlist_profile failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to decode playlist profile' }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Generate next question based on session state
 */
function generateNextQuestion(
  session: { questionsAsked: number; confidence: number; profile: Partial<Profile> },
  _extractedInfo?: Partial<Profile>
): string {
  const questions = session.questionsAsked;

  // Opening questions (0-2): Focus on familiarity and activity
  if (questions < 3) {
    const openingQuestions = [
      "What have you been listening to lately? Any artists on repeat?",
      "What's the vibe you're going for - working out, relaxing, focusing, or something else?",
      "Are you more in the mood for familiar favorites or discovering something new?",
    ];
    return openingQuestions[questions] || openingQuestions[openingQuestions.length - 1] || 'Tell me about your music taste!';
  }

  // Middle questions (3-5): Context and mood
  if (questions < 6) {
    const middleQuestions = [
      "How are you feeling right now? Energized, calm, happy, stressed?",
      "Do you want music that matches your current mood or something to shift it?",
      "Any specific genres or sounds you're drawn to these days?",
    ];
    return middleQuestions[questions - 3] || middleQuestions[middleQuestions.length - 1] || 'How are you feeling?';
  }

  // Ready for generation
  if (session.confidence >= 21) {
    return "Perfect! I have a great sense of your taste. Ready to generate your personalized playlist?";
  }

  // Additional refinement questions
  const refinementQuestions = [
    "Are lyrics important to you, or is it more about the sound and feel?",
    "What decade or era of music resonates with you most?",
    "Do you prefer mainstream hits or more underground/niche tracks?",
  ];

  return refinementQuestions[(questions - 6) % refinementQuestions.length] || 'Tell me more about what you like!';
}
