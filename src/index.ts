import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OAuthProvider } from '@smithery/sdk';
import { config } from './config.js';
import { createLogger } from './utils/logger.js';
import { registerQueryTools } from './tools/query.js';
import { registerPlaylistTools } from './tools/playlist.js';
import { registerSmartPlaylistTools } from './tools/smart-playlist.js';
import { registerSystemTools } from './tools/system.js';
import { registerAdaptivePlaylistTools } from './tools/adaptive-playlist.js';
import { YouTubeMusicClient } from './youtube-music/client.js';
import { YouTubeDataClient } from './youtube-data/client.js';
import { MusicBrainzClient } from './musicbrainz/client.js';
import { ListenBrainzClient } from './listenbrainz/client.js';
import { RecommendationEngine } from './recommendations/engine.js';
import { SessionManager } from './recommendations/session.js';
import { oauth as oauthProvider } from './auth/smithery-oauth-provider.js';
import { db } from './database/client.js';

const logger = createLogger('main');

export interface ServerContext {
  ytMusic: YouTubeMusicClient;
  ytData: YouTubeDataClient;
  musicBrainz: MusicBrainzClient;
  listenBrainz: ListenBrainzClient;
  recommendations: RecommendationEngine;
  sessions: SessionManager;
  db: any; // Database client for adaptive playlists
}

/**
 * Default export for Smithery TypeScript runtime
 * Smithery calls this function and handles HTTP transport automatically
 */
export default function createServer({ auth }: { auth: AuthInfo }) {
  logger.info('Creating YouTube Music MCP Server', {
    version: '3.0.0',
    nodeEnv: config.nodeEnv,
    hasAuth: !!auth,
  });

  // Initialize MCP server
  const mcpServer = new McpServer({
    name: 'youtube-music-mcp-server',
    version: '3.0.0',
  });

  // Initialize clients
  const ytMusic = new YouTubeMusicClient();
  const ytData = new YouTubeDataClient(ytMusic); // Pass ytMusic for enrichment
  const musicBrainz = new MusicBrainzClient();
  const listenBrainz = new ListenBrainzClient();
  const sessions = new SessionManager();
  const recommendations = new RecommendationEngine(
    musicBrainz,
    listenBrainz,
    ytMusic
  );

  // Create context for tools
  const context: ServerContext = {
    ytMusic,
    ytData,
    musicBrainz,
    listenBrainz,
    recommendations,
    sessions,
    db,
  };

  // Register all MCP tools
  registerQueryTools(mcpServer, context);
  registerPlaylistTools(mcpServer, context);
  registerSmartPlaylistTools(mcpServer, context);
  registerAdaptivePlaylistTools(mcpServer, context);
  registerSystemTools(mcpServer, context);

  logger.info('MCP tools registered (including adaptive playlists)');

  // Return the underlying server for Smithery to handle
  return mcpServer.server;
}

// Export OAuth provider for Smithery
// Smithery CLI automatically detects and mounts OAuth routes
export const oauth: OAuthProvider = oauthProvider;
