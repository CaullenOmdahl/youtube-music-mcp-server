/**
 * Stdio entry point for Claude Desktop and other stdio-based MCP clients
 * Uses StdioServerTransport instead of HTTP — no OAuth required
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerQueryTools } from './tools/query.js';
import { registerPlaylistTools } from './tools/playlist.js';
import { registerSystemTools } from './tools/system.js';
import { registerAdaptivePlaylistTools } from './tools/adaptive-playlist.js';
import { registerReccoBeatsTools } from './tools/reccobeats.js';
import { YouTubeMusicClient } from './youtube-music/client.js';
import { YouTubeDataClient } from './youtube-data/client.js';
import { MusicBrainzClient } from './musicbrainz/client.js';
import { ListenBrainzClient } from './listenbrainz/client.js';
import { SpotifyClient } from './spotify/client.js';
import { ReccoBeatsClient } from './reccobeats/client.js';
import { RecommendationEngine } from './recommendations/engine.js';
import { SessionManager } from './recommendations/session.js';
import type { ServerContext } from './server.js';
import { db } from './database/client.js';

async function main() {
  const mcpServer = new McpServer({
    name: 'youtube-music-mcp-server',
    version: '3.0.0',
  });

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

  registerQueryTools(mcpServer, context);
  registerPlaylistTools(mcpServer, context);
  registerAdaptivePlaylistTools(mcpServer, context);
  registerReccoBeatsTools(mcpServer, context);
  registerSystemTools(mcpServer, context);

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`Failed to start stdio server: ${error}\n`);
  process.exit(1);
});
