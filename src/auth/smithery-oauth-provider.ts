import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthProvider } from '@smithery/sdk';
import type { Response } from 'express';
import { google } from 'googleapis';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { tokenStore } from './token-store.js';

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

// Store for registered clients
const registeredClients = new Map<string, OAuthClientInformationFull>();

/**
 * Custom OAuth provider for Smithery that proxies to Google OAuth
 */
class GoogleOAuthProvider extends ProxyOAuthServerProvider implements OAuthProvider {
  private oauth2Client = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri
  );

  constructor() {
    super({
      endpoints: {
        authorizationUrl: GOOGLE_AUTH_URL,
        tokenUrl: GOOGLE_TOKEN_URL,
        revocationUrl: GOOGLE_REVOKE_URL,
      },
      verifyAccessToken: async (token: string): Promise<AuthInfo> => {
        return this.verifyGoogleToken(token);
      },
      getClient: async (clientId: string): Promise<OAuthClientInformationFull | undefined> => {
        // Return registered client info or create default for known clients
        let clientInfo = registeredClients.get(clientId);

        if (!clientInfo) {
          // For dynamic registration, create client info
          clientInfo = {
            client_id: clientId,
            client_secret: config.googleClientSecret,
            redirect_uris: [config.googleRedirectUri ?? `http://localhost:${config.port}/oauth/callback`],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            scope: YOUTUBE_SCOPES.join(' '),
            token_endpoint_auth_method: 'client_secret_post',
          };
          registeredClients.set(clientId, clientInfo);
        }

        return clientInfo;
      },
    });

    logger.info('Google OAuth provider initialized');
  }

  /**
   * Verify a Google access token
   */
  private async verifyGoogleToken(token: string): Promise<AuthInfo> {
    try {
      // Use Google's tokeninfo endpoint to verify the token
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);

      if (!response.ok) {
        throw new Error('Invalid token');
      }

      const tokenInfo = await response.json() as {
        aud: string;
        scope: string;
        expires_in: string;
        email?: string;
      };

      // Verify the token is for our client
      if (tokenInfo.aud !== config.googleClientId) {
        throw new Error('Token audience mismatch');
      }

      return {
        token,
        clientId: config.googleClientId,
        scopes: tokenInfo.scope.split(' '),
        expiresAt: Date.now() + parseInt(tokenInfo.expires_in) * 1000,
      };
    } catch (error) {
      logger.error('Token verification failed', { error });
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Custom callback handler for OAuth flow
   */
  async handleOAuthCallback(code: string, state: string | undefined, _res: Response): Promise<URL> {
    try {
      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Failed to obtain tokens');
      }

      // Store tokens in shared token store
      const sessionId = state || 'default';
      tokenStore.setToken(sessionId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date ?? Date.now() + 3600000,
      });

      logger.info('OAuth callback successful', { sessionId });

      // Return success URL
      return new URL('/oauth/success', config.googleRedirectUri || `http://localhost:${config.port}`);
    } catch (error) {
      logger.error('OAuth callback failed', { error });
      throw error;
    }
  }

  /**
   * Get stored token for a session
   */
  getStoredToken(sessionId: string) {
    return tokenStore.getToken(sessionId);
  }

  /**
   * Refresh an access token using the refresh token
   */
  async refreshAccessToken(sessionId: string): Promise<string> {
    const stored = tokenStore.getToken(sessionId);
    if (!stored) {
      throw new Error('No token found for session');
    }

    try {
      this.oauth2Client.setCredentials({
        refresh_token: stored.refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error('Failed to refresh token');
      }

      // Update stored token
      tokenStore.setToken(sessionId, {
        accessToken: credentials.access_token,
        refreshToken: stored.refreshToken,
        expiresAt: credentials.expiry_date ?? Date.now() + 3600000,
      });

      logger.info('Token refreshed', { sessionId });

      return credentials.access_token;
    } catch (error) {
      logger.error('Token refresh failed', { error, sessionId });
      throw new Error('Failed to refresh authentication');
    }
  }

  /**
   * Required scopes for this OAuth provider
   */
  get requiredScopes(): string[] {
    return YOUTUBE_SCOPES;
  }
}

// Create singleton instance
export const oauth: OAuthProvider = new GoogleOAuthProvider();

// Export the class for type usage
export { GoogleOAuthProvider };
