import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthProvider } from '@smithery/sdk';
import type { Response } from 'express';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

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

// In-memory store for dynamically registered clients
const registeredClients = new Map<string, OAuthClientInformationFull>();

/**
 * Extended ProxyOAuthServerProvider with dynamic client registration support
 */
class DynamicClientProxyProvider extends ProxyOAuthServerProvider {
  private _dynamicClientsStore: OAuthRegisteredClientsStore;

  constructor(options: ConstructorParameters<typeof ProxyOAuthServerProvider>[0]) {
    super(options);

    // Create a clients store that supports dynamic registration
    this._dynamicClientsStore = {
      getClient: (clientId: string) => {
        // Check if this is a dynamically registered client
        const registered = registeredClients.get(clientId);

        logger.debug('Looking up client', {
          clientId,
          found: !!registered,
          registeredCount: registeredClients.size,
        });

        if (registered) {
          // Return client info with OUR Google credentials for proxying
          // but keep the registered client's redirect_uris for validation
          const clientInfo = {
            ...registered,
            // Use our Google OAuth credentials for the actual proxy request
            client_id: config.googleClientId,
            client_secret: config.googleClientSecret,
            scope: YOUTUBE_SCOPES.join(' '),
          };

          logger.debug('Returning client with Google credentials', {
            originalClientId: clientId,
            googleClientId: config.googleClientId,
          });

          return clientInfo;
        }
        return options.getClient(clientId);
      },

      registerClient: (client) => {
        const clientId = randomUUID();
        const clientSecret = randomUUID();

        const fullClientInfo: OAuthClientInformationFull = {
          ...client,
          client_id: clientId,
          client_secret: clientSecret,
          client_id_issued_at: Math.floor(Date.now() / 1000),
        };

        registeredClients.set(clientId, fullClientInfo);

        logger.info('Client registered dynamically', {
          clientId,
          clientName: client.client_name,
          redirectUris: client.redirect_uris
        });

        return fullClientInfo;
      },
    };
  }

  override get clientsStore(): OAuthRegisteredClientsStore {
    return this._dynamicClientsStore;
  }

  /**
   * Override authorize to use our registered redirect_uri and scopes
   */
  override async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    // Important: redirect_uri must match what's registered in Google Cloud Console
    // For Smithery: use the client's redirect_uri (Smithery handles the callback)
    // The client's redirect_uri will be something like https://smithery.ai/chat/callback

    const paramsWithFixes: AuthorizationParams = {
      ...params,
      scopes: YOUTUBE_SCOPES,
      // Use client's redirect_uri - Smithery infrastructure handles callbacks
    };

    logger.debug('Authorizing with Google', {
      scopes: paramsWithFixes.scopes,
      redirectUri: paramsWithFixes.redirectUri,
      originalRedirectUri: params.redirectUri,
    });

    return super.authorize(client, paramsWithFixes, res);
  }

  /**
   * Override exchangeAuthorizationCode to pass through the client's redirect_uri
   * Google requires the redirect_uri to match the one used in authorize
   */
  override async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ) {
    // Use the redirectUri that was passed in (from the client)
    // This must match what was sent to Google in the authorize step

    logger.info('Exchanging authorization code', {
      redirectUri,
      clientId: client.client_id,
      hasCodeVerifier: !!codeVerifier,
      hasResource: !!resource,
    });

    try {
      const tokens = await super.exchangeAuthorizationCode(
        client,
        authorizationCode,
        codeVerifier,
        redirectUri, // Pass through the client's redirect_uri
        resource
      );

      logger.info('Token exchange successful', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in,
      });

      return tokens;
    } catch (error) {
      logger.error('Token exchange failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

/**
 * Create OAuth provider using MCP SDK's ProxyOAuthServerProvider
 * This proxies OAuth requests to Google
 */
function createOAuthProvider(): OAuthProvider {
  const provider = new DynamicClientProxyProvider({
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
