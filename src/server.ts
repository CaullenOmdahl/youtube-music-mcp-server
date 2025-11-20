import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express, { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
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
import { oauth } from './auth/smithery-oauth-provider.js';
import { tokenStore } from './auth/token-store.js';
import { db } from './database/client.js';

const logger = createLogger('server');

export interface ServerContext {
  ytMusic: YouTubeMusicClient;
  ytData: YouTubeDataClient;
  musicBrainz: MusicBrainzClient;
  listenBrainz: ListenBrainzClient;
  recommendations: RecommendationEngine;
  sessions: SessionManager;
  db: any; // Database client for adaptive playlists
}

export interface Server {
  start: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createServer(): Promise<Server> {
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

  // Create Express app for HTTP endpoints
  const app: Express = express();

  // Trust proxy for proper IP detection behind reverse proxies (ngrok, Smithery, etc.)
  app.set('trust proxy', 1);

  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      version: '3.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount OAuth routes using MCP SDK's mcpAuthRouter for local testing
  // In production, Smithery handles these automatically

  // Derive base URL from redirect URI by removing /oauth/callback path
  // mcpAuthRouter expects the server's base URL, not the full callback URL
  let baseUrl: URL;
  if (config.googleRedirectUri) {
    const redirectUrl = new URL(config.googleRedirectUri);
    // Remove /oauth/callback to get the base server URL
    const basePath = redirectUrl.pathname.replace(/\/oauth\/callback$/, '');
    baseUrl = new URL(basePath || '/', redirectUrl.origin);
  } else {
    baseUrl = new URL(`http://localhost:${config.port}`);
  }

  logger.info('OAuth router base URL', { baseUrl: baseUrl.toString() });

  // Rate limit config that works behind proxies
  const rateLimitConfig = {
    validate: { xForwardedForHeader: false }
  };

  // Resource server URL (where the MCP server is hosted)
  const resourceServerUrl = new URL('/mcp', baseUrl);

  app.use(
    mcpAuthRouter({
      provider: oauth,
      issuerUrl: baseUrl, // Our server is the OAuth issuer (proxies to Google)
      baseUrl,
      resourceServerUrl, // Tell the router where the protected MCP endpoints are
      serviceDocumentationUrl: new URL('https://github.com/CaullenOmdahl/youtube-music-mcp-server'),
      // Configure rate limiting to work behind reverse proxies
      authorizationOptions: { rateLimit: rateLimitConfig },
      tokenOptions: { rateLimit: rateLimitConfig },
      clientRegistrationOptions: { rateLimit: rateLimitConfig },
      revocationOptions: { rateLimit: rateLimitConfig },
    })
  );

  logger.info('OAuth routes mounted for local testing');

  // OAuth callback handler for Google redirects
  // When Google redirects back, we need to extract the stored client info and continue the flow
  app.get('/oauth/callback', async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        res.status(400).send('Missing code or state parameter');
        return;
      }

      // Decode the state to get client info
      const stateData = JSON.parse(Buffer.from(state as string, 'base64url').toString());
      const { clientId, clientRedirectUri, original: originalState } = stateData;

      // Redirect to the client's callback with the code and original state
      const redirectUrl = new URL(clientRedirectUri);
      redirectUrl.searchParams.set('code', code as string);
      if (originalState) {
        redirectUrl.searchParams.set('state', originalState);
      }

      logger.info('OAuth callback - redirecting to client', {
        clientId,
        clientRedirectUri,
      });

      res.redirect(redirectUrl.toString());
    } catch (error) {
      logger.error('OAuth callback failed', { error });
      res.status(500).send('OAuth callback processing failed');
    }
  });

  // Protected Resource Metadata URL for OAuth 2.0
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceServerUrl);

  // Apply bearer auth middleware to MCP endpoints (unless bypassing for testing)
  if (!config.bypassAuth) {
    app.use('/mcp', requireBearerAuth({
      verifier: oauth,
      requiredScopes: [],
      resourceMetadataUrl,
    }));
    logger.info('Bearer auth required for MCP endpoints');

    // Extract and store authenticated token for YouTube Music API calls
    app.use('/mcp', (req: Request, _res: Response, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        // Store token with MCP session ID
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        if (sessionId) {
          // Note: We don't have refresh token or expiry from the bearer token itself
          // The OAuth provider handles token refresh
          tokenStore.setToken(sessionId, {
            accessToken: token,
            refreshToken: '', // Not available from bearer auth
            expiresAt: Date.now() + 3600000, // Assume 1 hour
          });
          tokenStore.setCurrentSession(sessionId);
          logger.debug('Token stored for YouTube Music API calls', { sessionId });
        }
      }
      next();
    });
  } else {
    logger.warn('BYPASS_AUTH enabled - MCP endpoints unprotected!');
  }

  // Store transports for session management
  const transports: {
    streamable: Record<string, StreamableHTTPServerTransport>;
    sse: Record<string, SSEServerTransport>;
  } = {
    streamable: {},
    sse: {},
  };

  // Modern Streamable HTTP endpoint for MCP protocol
  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.streamable[sessionId]) {
        // Reuse existing transport
        transport = transports.streamable[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId: string) => {
            transports.streamable[newSessionId] = transport;
            logger.info('MCP session initialized', { sessionId: newSessionId });
          },
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports.streamable[transport.sessionId];
            logger.info('MCP session closed', { sessionId: transport.sessionId });
          }
        };

        // Connect to the MCP server
        await mcpServer.connect(transport);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('MCP request failed', { error });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.streamable[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports.streamable[sessionId];
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for session termination
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.streamable[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const transport = transports.streamable[sessionId];
    await transport.handleRequest(req, res);
  });

  // Apply bearer auth to legacy SSE endpoints
  if (!config.bypassAuth) {
    app.use(['/sse', '/messages'], requireBearerAuth({
      verifier: oauth,
      requiredScopes: [],
      resourceMetadataUrl,
    }));
    logger.info('Bearer auth required for legacy SSE endpoints');
  }

  // Legacy SSE endpoint for older clients
  app.get('/sse', async (req: Request, res: Response) => {
    logger.info('SSE connection initiated (legacy transport)');
    const transport = new SSEServerTransport('/messages', res);
    transports.sse[transport.sessionId] = transport;

    res.on('close', () => {
      delete transports.sse[transport.sessionId];
      logger.info('SSE connection closed', { sessionId: transport.sessionId });
    });

    await mcpServer.connect(transport);
  });

  // Legacy message endpoint for older clients
  app.post('/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.sse[sessionId];
    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).send('No transport found for sessionId');
    }
  });

  let httpServer: ReturnType<typeof app.listen> | null = null;

  return {
    async start() {
      // Start HTTP server
      httpServer = app.listen(config.port, () => {
        logger.info(`MCP HTTP server listening on port ${config.port}`);
        logger.info(`MCP endpoint: http://localhost:${config.port}/mcp`);
        logger.info(`Health endpoint: http://localhost:${config.port}/health`);
        logger.info('OAuth routes: Managed by Smithery');
      });
    },

    async close() {
      logger.info('Shutting down server...');

      // Close all active transports
      for (const sessionId of Object.keys(transports.streamable)) {
        const transport = transports.streamable[sessionId];
        if (transport) {
          transport.close();
        }
      }
      for (const sessionId of Object.keys(transports.sse)) {
        const transport = transports.sse[sessionId];
        if (transport) {
          transport.close();
        }
      }

      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer!.close(() => resolve());
        });
      }

      // Close clients
      await ytMusic.close();
      await ytData.close();
      await musicBrainz.close();
      await listenBrainz.close();

      logger.info('Server shutdown complete');
    },
  };
}
