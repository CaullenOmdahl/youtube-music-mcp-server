import { google, Auth } from 'googleapis';
import crypto from 'crypto';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import type { OAuthToken, AuthStatus } from '../types/index.js';

const logger = createLogger('oauth-manager');

interface PKCEChallenge {
  verifier: string;
  challenge: string;
  state: string;
}

interface PendingAuth {
  verifier: string;
  createdAt: number;
}

export class OAuthManager {
  private oauth2Client: Auth.OAuth2Client;
  private tokens: Map<string, OAuthToken> = new Map();
  private pendingAuths: Map<string, PendingAuth> = new Map();
  private encryptionKey: Buffer | null;
  private currentSessionId: string | null = null;

  private static readonly SCOPES = [
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.readonly',
  ];

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUri ?? `http://localhost:${config.port}/oauth/callback`
    );

    // Initialize encryption key
    if (config.encryptionKey) {
      this.encryptionKey = Buffer.from(config.encryptionKey, 'base64');
    } else {
      // Generate a random key for in-memory use
      this.encryptionKey = crypto.randomBytes(32);
      logger.warn('Using auto-generated encryption key - tokens will not persist');
    }

    logger.info('OAuth manager initialized');
  }

  /**
   * Generate PKCE challenge for OAuth 2.1
   */
  private generatePKCE(): PKCEChallenge {
    // Generate random verifier (43-128 characters, URL-safe)
    const verifier = crypto.randomBytes(32).toString('base64url');

    // Generate challenge using S256 method
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');

    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');

    return { verifier, challenge, state };
  }

  /**
   * Generate authorization URL with PKCE
   */
  generateAuthUrl(sessionId: string): string {
    const pkce = this.generatePKCE();

    // Store verifier for later validation
    this.pendingAuths.set(pkce.state, {
      verifier: pkce.verifier,
      createdAt: Date.now(),
    });

    // Clean up old pending auths (older than 10 minutes)
    this.cleanupPendingAuths();

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: OAuthManager.SCOPES,
      state: pkce.state,
      code_challenge: pkce.challenge,
      // @ts-expect-error googleapis types don't include S256 but it's valid
      code_challenge_method: 'S256',
      prompt: 'consent', // Force consent to get refresh token
    });

    logger.info('Generated auth URL', { sessionId, state: pkce.state });

    return authUrl;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string, state: string): Promise<string> {
    const pending = this.pendingAuths.get(state);

    if (!pending) {
      throw new Error('Invalid or expired state parameter');
    }

    try {
      // Exchange code for tokens with PKCE verifier
      const { tokens } = await this.oauth2Client.getToken({
        code,
        codeVerifier: pending.verifier,
      });

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Failed to obtain tokens');
      }

      // Generate session ID for this token set
      const sessionId = crypto.randomBytes(16).toString('hex');

      // Store encrypted tokens
      const oauthToken: OAuthToken = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date ?? Date.now() + 3600000,
        tokenType: tokens.token_type ?? 'Bearer',
      };

      this.tokens.set(sessionId, this.encryptToken(oauthToken));

      // Set as current active session
      this.currentSessionId = sessionId;

      // Clean up pending auth
      this.pendingAuths.delete(state);

      logger.info('OAuth callback successful - session activated', { sessionId });

      return sessionId;
    } catch (error) {
      logger.error('OAuth callback failed', { error, state });
      this.pendingAuths.delete(state);
      throw error;
    }
  }

  /**
   * Get the current active session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Check if there's an active authenticated session
   */
  hasActiveSession(): boolean {
    if (config.bypassAuth) {
      return true;
    }
    return this.currentSessionId !== null && this.tokens.has(this.currentSessionId);
  }

  /**
   * Get valid access token, refreshing if necessary
   * Uses current session if no sessionId provided
   */
  async getAccessToken(sessionId?: string): Promise<string> {
    if (config.bypassAuth) {
      return 'bypass-token';
    }

    const effectiveSessionId = sessionId ?? this.currentSessionId;
    if (!effectiveSessionId) {
      throw new Error('No active session - authentication required');
    }

    const encryptedToken = this.tokens.get(effectiveSessionId);
    if (!encryptedToken) {
      throw new Error('No token found for session');
    }

    const token = this.decryptToken(encryptedToken);

    // Check if token needs refresh (5 minutes before expiry)
    if (token.expiresAt - 300000 < Date.now()) {
      return await this.refreshToken(effectiveSessionId, token);
    }

    return token.accessToken;
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshToken(sessionId: string, token: OAuthToken): Promise<string> {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: token.refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error('Failed to refresh token');
      }

      // Update stored token
      const updatedToken: OAuthToken = {
        accessToken: credentials.access_token,
        refreshToken: token.refreshToken, // Keep original refresh token
        expiresAt: credentials.expiry_date ?? Date.now() + 3600000,
        tokenType: credentials.token_type ?? 'Bearer',
      };

      this.tokens.set(sessionId, this.encryptToken(updatedToken));

      logger.info('Token refreshed', { sessionId });

      return updatedToken.accessToken;
    } catch (error) {
      logger.error('Token refresh failed', { error, sessionId });
      throw new Error('Failed to refresh authentication');
    }
  }

  /**
   * Get authentication status
   * Uses current session by default
   */
  getAuthStatus(): AuthStatus {
    if (config.bypassAuth) {
      return {
        authenticated: true,
        needsRefresh: false,
      };
    }

    const sessionId = this.currentSessionId;

    if (!sessionId) {
      return {
        authenticated: false,
        authUrl: this.generateAuthUrl('pending'),
      };
    }

    const encryptedToken = this.tokens.get(sessionId);
    if (!encryptedToken) {
      return {
        authenticated: false,
        authUrl: this.generateAuthUrl(sessionId),
      };
    }

    const token = this.decryptToken(encryptedToken);
    const needsRefresh = token.expiresAt - 300000 < Date.now();

    return {
      authenticated: true,
      expiresAt: token.expiresAt,
      needsRefresh,
    };
  }

  /**
   * Check if a session is authenticated
   */
  isAuthenticated(sessionId: string): boolean {
    if (config.bypassAuth) {
      return true;
    }
    return this.tokens.has(sessionId);
  }

  /**
   * Revoke tokens for a session
   */
  async revokeSession(sessionId: string): Promise<void> {
    const encryptedToken = this.tokens.get(sessionId);
    if (!encryptedToken) {
      return;
    }

    try {
      const token = this.decryptToken(encryptedToken);
      await this.oauth2Client.revokeToken(token.accessToken);
    } catch (error) {
      logger.warn('Failed to revoke token', { error, sessionId });
    }

    this.tokens.delete(sessionId);
    logger.info('Session revoked', { sessionId });
  }

  /**
   * Encrypt token for storage
   */
  private encryptToken(token: OAuthToken): OAuthToken {
    if (!this.encryptionKey) {
      return token;
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const accessTokenEnc = Buffer.concat([
      cipher.update(token.accessToken, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Store IV and auth tag with encrypted data
    const encryptedAccess = Buffer.concat([iv, authTag, accessTokenEnc]).toString('base64');

    // Encrypt refresh token separately
    const iv2 = crypto.randomBytes(16);
    const cipher2 = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv2);
    const refreshTokenEnc = Buffer.concat([
      cipher2.update(token.refreshToken, 'utf8'),
      cipher2.final(),
    ]);
    const authTag2 = cipher2.getAuthTag();
    const encryptedRefresh = Buffer.concat([iv2, authTag2, refreshTokenEnc]).toString('base64');

    return {
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresAt: token.expiresAt,
      tokenType: token.tokenType,
    };
  }

  /**
   * Decrypt token from storage
   */
  private decryptToken(encrypted: OAuthToken): OAuthToken {
    if (!this.encryptionKey) {
      return encrypted;
    }

    // Decrypt access token
    const accessData = Buffer.from(encrypted.accessToken, 'base64');
    const iv = accessData.subarray(0, 16);
    const authTag = accessData.subarray(16, 32);
    const ciphertext = accessData.subarray(32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const accessToken = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');

    // Decrypt refresh token
    const refreshData = Buffer.from(encrypted.refreshToken, 'base64');
    const iv2 = refreshData.subarray(0, 16);
    const authTag2 = refreshData.subarray(16, 32);
    const ciphertext2 = refreshData.subarray(32);

    const decipher2 = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv2);
    decipher2.setAuthTag(authTag2);
    const refreshToken = Buffer.concat([
      decipher2.update(ciphertext2),
      decipher2.final(),
    ]).toString('utf8');

    return {
      accessToken,
      refreshToken,
      expiresAt: encrypted.expiresAt,
      tokenType: encrypted.tokenType,
    };
  }

  /**
   * Clean up expired pending authentications
   */
  private cleanupPendingAuths(): void {
    const tenMinutesAgo = Date.now() - 600000;

    for (const [state, pending] of this.pendingAuths) {
      if (pending.createdAt < tenMinutesAgo) {
        this.pendingAuths.delete(state);
      }
    }
  }
}
