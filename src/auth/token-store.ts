import { createLogger } from '../utils/logger.js';

const logger = createLogger('token-store');

export interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Shared token store for OAuth tokens
 * Used by both Smithery OAuth provider and YouTubeMusicClient
 */
class TokenStore {
  private tokens = new Map<string, StoredToken>();
  private currentSessionId: string | null = null;

  /**
   * Store tokens for a session
   */
  setToken(sessionId: string, token: StoredToken): void {
    this.tokens.set(sessionId, token);
    this.currentSessionId = sessionId;
    logger.info('Token stored', { sessionId });
  }

  /**
   * Get token for a session
   */
  getToken(sessionId: string): StoredToken | undefined {
    return this.tokens.get(sessionId);
  }

  /**
   * Get token for the current active session
   */
  getCurrentToken(): StoredToken | undefined {
    if (!this.currentSessionId) {
      return undefined;
    }
    return this.tokens.get(this.currentSessionId);
  }

  /**
   * Get the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Set the current active session
   */
  setCurrentSession(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Check if there's an active session with valid token
   */
  hasActiveSession(): boolean {
    if (!this.currentSessionId) {
      return false;
    }
    const token = this.tokens.get(this.currentSessionId);
    return token !== undefined;
  }

  /**
   * Check if token needs refresh (5 minutes before expiry)
   */
  needsRefresh(sessionId?: string): boolean {
    const effectiveId = sessionId ?? this.currentSessionId;
    if (!effectiveId) {
      return false;
    }
    const token = this.tokens.get(effectiveId);
    if (!token) {
      return false;
    }
    return token.expiresAt - 300000 < Date.now();
  }

  /**
   * Remove token for a session
   */
  removeToken(sessionId: string): void {
    this.tokens.delete(sessionId);
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
    logger.info('Token removed', { sessionId });
  }

  /**
   * Clear all tokens
   */
  clear(): void {
    this.tokens.clear();
    this.currentSessionId = null;
    logger.info('All tokens cleared');
  }
}

// Export singleton instance
export const tokenStore = new TokenStore();
