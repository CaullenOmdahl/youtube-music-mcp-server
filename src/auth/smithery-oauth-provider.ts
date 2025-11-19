import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthProvider } from '@smithery/sdk';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('smithery-oauth');

// Google OAuth 2.0 endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// OAuth scopes for YouTube Music
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
];

/**
 * Create OAuth provider using MCP SDK's ProxyOAuthServerProvider
 * This proxies OAuth requests to Google
 */
function createOAuthProvider(): OAuthProvider {
  const provider = new ProxyOAuthServerProvider({
    endpoints: {
      authorizationUrl: GOOGLE_AUTH_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
      revocationUrl: GOOGLE_REVOKE_URL,
    },

    // Verify Google access tokens
    verifyAccessToken: async (token: string): Promise<AuthInfo> => {
      try {
        const response = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?access_token=${token}`
        );

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('Google tokeninfo failed', {
            status: response.status,
            error: errorText
          });
          throw new Error(`Token validation failed: ${response.status}`);
        }

        const tokenInfo = (await response.json()) as {
          aud: string;
          scope: string;
          expires_in: string;
          email?: string;
        };

        // Log token info for debugging (not the actual token)
        logger.debug('Token info received', {
          aud: tokenInfo.aud,
          expectedClientId: config.googleClientId,
          scope: tokenInfo.scope,
          expiresIn: tokenInfo.expires_in,
        });

        // Verify the token is for our client
        if (tokenInfo.aud !== config.googleClientId) {
          logger.error('Token audience mismatch', {
            tokenAud: tokenInfo.aud,
            expectedClientId: config.googleClientId,
          });
          throw new Error(`Token audience mismatch: got ${tokenInfo.aud}, expected ${config.googleClientId}`);
        }

        return {
          token,
          clientId: config.googleClientId,
          scopes: tokenInfo.scope.split(' '),
          expiresAt: Date.now() + parseInt(tokenInfo.expires_in) * 1000,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Token verification failed', { error: errorMessage });
        throw new Error(`Authentication failed - ${errorMessage}`);
      }
    },

    // Get client configuration
    // Use our Google OAuth client credentials, not the MCP client's ID
    getClient: async (_clientId: string) => {
      return {
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        // Accept common redirect patterns for MCP clients
        redirect_uris: [
          'http://localhost:3000/callback',
          'http://localhost:8080/callback',
          'http://127.0.0.1:3000/callback',
          'http://127.0.0.1:8080/callback',
          config.googleRedirectUri || `http://localhost:${config.port}/oauth/callback`,
        ],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: YOUTUBE_SCOPES.join(' '),
        token_endpoint_auth_method: 'client_secret_post',
      };
    },
  });

  logger.info('Google OAuth provider initialized', {
    authUrl: GOOGLE_AUTH_URL,
    tokenUrl: GOOGLE_TOKEN_URL,
  });

  // Add required scopes property for Smithery
  const providerWithScopes = provider as OAuthProvider;
  Object.defineProperty(providerWithScopes, 'requiredScopes', {
    get: () => YOUTUBE_SCOPES,
  });

  return providerWithScopes;
}

// Create singleton instance
export const oauth: OAuthProvider = createOAuthProvider();
