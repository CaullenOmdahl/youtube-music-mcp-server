import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../server.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { tokenStore } from '../auth/token-store.js';

const logger = createLogger('system-tools');

const startTime = Date.now();

/**
 * Register system tools for auth status and server health
 */
export function registerSystemTools(server: McpServer, context: ServerContext): void {
  /**
   * Get authentication status
   */
  server.registerTool(
    'get_auth_status',
    {
      title: 'Get Auth Status',
      description: 'Check authentication status and get OAuth URL if not authenticated. After authenticating via the returned URL, the session becomes active automatically.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      logger.debug('get_auth_status called');

      try {
        const sessionId = tokenStore.getCurrentSessionId();
        const hasSession = tokenStore.hasActiveSession();
        const token = tokenStore.getCurrentToken();
        const needsRefresh = sessionId ? tokenStore.needsRefresh(sessionId) : false;

        // For bypass mode
        if (config.bypassAuth) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  authenticated: true,
                  sessionActive: true,
                  bypassMode: true,
                  instructions: 'Authentication bypass is enabled. All tools are available.',
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                authenticated: hasSession,
                sessionActive: sessionId !== null,
                expiresAt: token?.expiresAt
                  ? new Date(token.expiresAt).toISOString()
                  : undefined,
                needsRefresh,
                bypassMode: config.bypassAuth,
                instructions: hasSession
                  ? 'Session is active. You can now use all YouTube Music tools.'
                  : 'Authentication required. OAuth is managed by Smithery - use the Smithery client to authenticate.',
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('get_auth_status failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Failed to get auth status' }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Get server status and health metrics
   */
  server.registerTool(
    'get_server_status',
    {
      title: 'Get Server Status',
      description: 'Get server health, version, uptime, and rate limit status.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      logger.debug('get_server_status called');

      try {
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const rateLimitStats = context.ytMusic.getRateLimitStats();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'healthy',
                version: '3.0.0',
                uptime: {
                  seconds: uptime,
                  formatted: formatUptime(uptime),
                },
                rateLimits: {
                  youtubeMusic: rateLimitStats,
                },
                environment: {
                  nodeEnv: config.nodeEnv,
                  port: config.port,
                  bypassAuth: config.bypassAuth,
                },
                activeSessions: context.sessions.getActiveSessions().length,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('get_server_status failed', { error });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'error',
                error: 'Failed to get server status',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  logger.info('System tools registered');
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}
