import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('reccobeats-tools');

export function registerReccoBeatsTools(
    mcpServer: McpServer,
    context: ServerContext
) {
    mcpServer.tool(
        'get_reccobeats_recommendations',
        'Get music recommendations from ReccoBeats based on seed tracks and audio features',
        {
            seed_tracks: z.array(z.string()).optional().describe('List of Spotify Track IDs to use as seeds'),
            target_valence: z.number().min(0).max(1).optional().describe('Target valence (musical positivity) from 0.0 to 1.0'),
            target_energy: z.number().min(0).max(1).optional().describe('Target energy from 0.0 to 1.0'),
            limit: z.number().min(1).max(100).optional().default(20).describe('Number of recommendations to return'),
        },
        async ({ seed_tracks, target_valence, target_energy, limit }) => {
            logger.info('Getting ReccoBeats recommendations', {
                seed_tracks,
                target_valence,
                target_energy,
                limit,
            });

            const recommendations = await context.reccobeats.getRecommendations({
                seed_tracks,
                target_valence,
                target_energy,
                limit,
            });

            if (recommendations.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'No recommendations found. Try different seed tracks or parameters.',
                        },
                    ],
                };
            }

            const tracksText = recommendations
                .map(
                    (t) =>
                        `- ${t.title} by ${t.artist} (Album: ${t.album}) [Duration: ${t.duration}]`
                )
                .join('\n');

            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${recommendations.length} recommendations:\n\n${tracksText}`,
                    },
                ],
            };
        }
    );
}
