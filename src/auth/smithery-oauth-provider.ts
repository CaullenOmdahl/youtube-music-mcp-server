import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthProvider } from '@smithery/sdk';
import type { Response } from 'express';
import { google } from 'googleapis';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { tokenStore } from './token-store.js';

const logger = createLogger('smithery-oauth');

// Google OAuth 2.0 endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// OAuth scopes for YouTube Music
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
];

// Store for registered clients
const registeredClients = new Map<string, OAuthClientInformationFull>();

// Store for pending authorizations (code -> { codeChallenge, clientRedirectUri, state })
const pendingAuthorizations = new Map<
  string,
  {
    codeChallenge: string;
    clientRedirectUri: string;
    state?: string;
  }
>();

/**
 * Client store implementation
 */
class ClientStore implements OAuthRegisteredClientsStore {
  getClient(clientId: string): OAuthClientInformationFull | undefined {
    let clientInfo = registeredClients.get(clientId);

    if (!clientInfo) {
      // Create client info for dynamic registration
      clientInfo = {
        client_id: clientId,
        client_secret: config.googleClientSecret,
        redirect_uris: ['http://localhost'], // Accept any localhost redirect
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: YOUTUBE_SCOPES.join(' '),
        token_endpoint_auth_method: 'client_secret_post',
      };
      registeredClients.set(clientId, clientInfo);
    }

    return clientInfo;
  }
}

/**
 * Custom OAuth provider for Smithery that handles Google OAuth
 * with proper redirect_uri management
 */
class GoogleOAuthProvider implements OAuthServerProvider, OAuthProvider {
  private oauth2Client = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri
  );

  private _clientsStore = new ClientStore();

  // Skip local PKCE validation since Google handles it
  skipLocalPkceValidation = true;

  constructor() {
    logger.info('Google OAuth provider initialized', {
      redirectUri: config.googleRedirectUri,
    });
  }

  /**
   * Get client store
   */
  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  /**
   * Authorize - redirect to Google OAuth with Smithery's callback URL
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    // Generate an authorization code to track this request
    const authCode = randomUUID();

    // Store the pending authorization
    pendingAuthorizations.set(authCode, {
      codeChallenge: params.codeChallenge,
      clientRedirectUri: params.redirectUri,
      state: params.state,
    });

    // Encode the auth code in state so we can retrieve it on callback
    const stateData = {
      authCode,
      originalState: params.state,
    };
    const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64url');

    // Construct Google OAuth URL with Smithery's callback
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', config.googleClientId);
    authUrl.searchParams.set('redirect_uri', config.googleRedirectUri ?? '');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', YOUTUBE_SCOPES.join(' '));
    authUrl.searchParams.set('state', encodedState);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    // Add PKCE - Google will validate this
    authUrl.searchParams.set('code_challenge', params.codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    logger.info('Redirecting to Google OAuth', {
      clientId: client.client_id,
      scopes: YOUTUBE_SCOPES,
    });

    // Redirect to Google
    res.redirect(authUrl.toString());
  }

  /**
   * Handle the OAuth callback from Google
   * This is called by Smithery when it receives the callback
   */
  async handleOAuthCallback(
    code: string,
    state: string | undefined,
    res: Response
  ): Promise<URL> {
    try {
      // Decode state to get our auth code
      let authCode: string;
      let originalState: string | undefined;

      if (state) {
        try {
          const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
          authCode = stateData.authCode;
          originalState = stateData.originalState;
        } catch {
          throw new Error('Invalid state parameter');
        }
      } else {
        throw new Error('Missing state parameter');
      }

      // Get pending authorization
      const pending = pendingAuthorizations.get(authCode);
      if (!pending) {
        throw new Error('Unknown authorization');
      }

      // Exchange code for tokens with Google
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      logger.info('Successfully exchanged code for tokens', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
      });

      // Store tokens
      if (tokens.refresh_token) {
        tokenStore.setToken(authCode, {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expiry_date ?? Date.now() + 3600000,
        });
      }

      // Build redirect URL back to client with the auth code
      const redirectUrl = new URL(pending.clientRedirectUri);
      redirectUrl.searchParams.set('code', authCode);
      if (originalState) {
        redirectUrl.searchParams.set('state', originalState);
      }

      // Clean up
      pendingAuthorizations.delete(authCode);

      logger.info('OAuth callback successful, redirecting to client');

      return redirectUrl;
    } catch (error) {
      logger.error('OAuth callback failed', { error });
      throw error;
    }
  }

  /**
   * Get the code challenge for an authorization code
   */
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const pending = pendingAuthorizations.get(authorizationCode);
    if (!pending) {
      // Check if we have stored tokens (callback already processed)
      const stored = tokenStore.getToken(authorizationCode);
      if (stored) {
        // Return empty string since we've already validated with Google
        return '';
      }
      throw new Error('Unknown authorization code');
    }
    return pending.codeChallenge;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    // Get stored tokens from the callback
    const stored = tokenStore.getToken(authorizationCode);
    if (!stored) {
      throw new Error('Invalid or expired authorization code');
    }

    logger.info('Exchanging authorization code for tokens');

    return {
      access_token: stored.accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor((stored.expiresAt - Date.now()) / 1000),
      refresh_token: stored.refreshToken,
      scope: YOUTUBE_SCOPES.join(' '),
    };
  }

  /**
   * Exchange refresh token for new tokens
   */
  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error('Failed to refresh token');
      }

      logger.info('Token refreshed successfully');

      return {
        access_token: credentials.access_token,
        token_type: 'Bearer',
        expires_in: credentials.expiry_date
          ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
          : 3600,
        refresh_token: refreshToken,
        scope: scopes?.join(' ') ?? YOUTUBE_SCOPES.join(' '),
      };
    } catch (error) {
      logger.error('Failed to refresh token', { error });
      throw error;
    }
  }

  /**
   * Verify an access token
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${token}`
      );

      if (!response.ok) {
        throw new Error('Invalid token');
      }

      const tokenInfo = (await response.json()) as {
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
