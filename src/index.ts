/**
 * Smithery entry point
 * Exports createServer, configSchema, and oauth provider
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { registerQueryTools } from './tools/query.js';
import { registerPlaylistTools } from './tools/playlist.js';
import { registerSystemTools } from './tools/system.js';
import { registerAdaptivePlaylistTools } from './tools/adaptive-playlist.js';
import { registerReccoBeatsTools } from './tools/reccobeats.js';
import { registerWorkflowPrompts } from './tools/prompts.js';
import { registerResources } from './tools/resources.js';
import { YouTubeMusicClient } from './youtube-music/client.js';
import { YouTubeDataClient } from './youtube-data/client.js';
import { MusicBrainzClient } from './musicbrainz/client.js';
import { ListenBrainzClient } from './listenbrainz/client.js';
import { SpotifyClient } from './spotify/client.js';
import { ReccoBeatsClient } from './reccobeats/client.js';
import { RecommendationEngine } from './recommendations/engine.js';
import { SessionManager } from './recommendations/session.js';
import { oauth } from './auth/smithery-oauth-provider.js';
import { db } from './database/client.js';
import type { ServerContext } from './server.js';

// Config schema for Smithery — all optional since credentials are managed
// as environment variables in the Smithery dashboard
export const configSchema = z.object({
  spotifyClientId: z.string().optional()
    .describe('Spotify API Client ID (optional — enables audio features and mood-based recommendations)'),
  spotifyClientSecret: z.string().optional()
    .describe('Spotify API Client Secret (optional — required if Spotify Client ID is provided)'),
  databaseUrl: z.string().optional()
    .describe('PostgreSQL database URL (optional — enables adaptive playlist memory across sessions)'),
});

export type Config = z.infer<typeof configSchema>;

// Export OAuth provider for Smithery OAuth integration
export { oauth };

/**
 * Creates and returns the MCP server instance.
 * Called by Smithery runtime — do NOT start an HTTP server here.
 */
export default function createServer(config?: Config) {
  const ytMusic = new YouTubeMusicClient();
  const ytData = new YouTubeDataClient(ytMusic);
  const musicBrainz = new MusicBrainzClient();
  const listenBrainz = new ListenBrainzClient();
  const spotify = new SpotifyClient();
  const reccobeats = new ReccoBeatsClient();
  const sessions = new SessionManager();
  const recommendations = new RecommendationEngine(musicBrainz, listenBrainz, ytMusic);

  const context: ServerContext = {
    ytMusic,
    ytData,
    musicBrainz,
    listenBrainz,
    recommendations,
    sessions,
    spotify,
    reccobeats,
    db,
  };

  const server = new McpServer({
    name: 'youtube-music-mcp-server',
    version: '3.0.0',
  });

  registerQueryTools(server, context);
  registerPlaylistTools(server, context);
  registerAdaptivePlaylistTools(server, context);
  registerReccoBeatsTools(server, context);
  registerSystemTools(server, context);
  registerWorkflowPrompts(server);
  registerResources(server);

  return server;
}

// CLI entry point — used when run directly (e.g. local testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    process.stderr.write(`Failed to start: ${err}\n`);
    process.exit(1);
  });
}
