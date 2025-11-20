import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { promises as fs } from 'fs';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import path from 'path';

const logger = createLogger('token-store');

export interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Shared token store for OAuth tokens
 * Used by both Smithery OAuth provider and YouTubeMusicClient
 * Persists tokens to encrypted file for Railway deployment
 */
class TokenStore {
  private tokens = new Map<string, StoredToken>();
  private currentSessionId: string | null = null;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor() {
    // Load tokens from file asynchronously
    this.initialize().catch(error => {
      logger.error('Failed to initialize token store', { error });
    });
  }

  /**
   * Initialize token store by loading from file
   */
  private async initialize(): Promise<void> {
    await this.loadFromFile();
    this.isInitialized = true;
    logger.info('Token store initialized', {
      storedTokens: this.tokens.size,
    });
  }

  /**
   * Store tokens for a session
   */
  setToken(sessionId: string, token: StoredToken): void {
    this.tokens.set(sessionId, token);
    this.currentSessionId = sessionId;
    logger.info('Token stored', { sessionId });
    this.scheduleSave();
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
    this.scheduleSave();
  }

  /**
   * Clear all tokens
   */
  clear(): void {
    this.tokens.clear();
    this.currentSessionId = null;
    logger.info('All tokens cleared');
    this.scheduleSave();
  }

  /**
   * Schedule a debounced save to file
   * Prevents excessive writes during rapid token updates
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveToFile().catch(error => {
        logger.error('Failed to save tokens to file', { error });
      });
    }, 1000); // Debounce for 1 second
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private encrypt(text: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private decrypt(encryptedData: string): string {
    const key = this.getEncryptionKey();
    const parts = encryptedData.split(':');

    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted: string = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Get encryption key from config or generate a temporary one
   */
  private getEncryptionKey(): Buffer {
    const key = config.encryptionKey;
    if (!key) {
      logger.warn('No encryption key configured, using insecure default');
      // This should not happen in production - ENCRYPTION_KEY env var should be set
      return Buffer.from('default-insecure-key-32-bytes!'); // 32 bytes
    }

    // Convert base64 key to buffer, or hash if it's not base64
    try {
      return Buffer.from(key, 'base64');
    } catch {
      // If not valid base64, use it as-is (padded/truncated to 32 bytes)
      const keyBuffer = Buffer.from(key);
      if (keyBuffer.length < 32) {
        return Buffer.concat([keyBuffer, Buffer.alloc(32 - keyBuffer.length)]);
      }
      return keyBuffer.slice(0, 32);
    }
  }

  /**
   * Save tokens to encrypted file
   */
  private async saveToFile(): Promise<void> {
    try {
      const data = {
        tokens: Array.from(this.tokens.entries()),
        currentSessionId: this.currentSessionId,
        savedAt: new Date().toISOString(),
      };

      const json = JSON.stringify(data);
      const encrypted = this.encrypt(json);

      // Ensure directory exists
      const dir = path.dirname(config.tokenStoragePath);
      await fs.mkdir(dir, { recursive: true });

      // Write to temp file first, then rename (atomic operation)
      const tempPath = `${config.tokenStoragePath}.tmp`;
      await fs.writeFile(tempPath, encrypted, 'utf8');
      await fs.rename(tempPath, config.tokenStoragePath);

      logger.debug('Tokens saved to file', {
        path: config.tokenStoragePath,
        tokenCount: this.tokens.size,
      });
    } catch (error) {
      logger.error('Failed to save tokens', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Load tokens from encrypted file
   */
  private async loadFromFile(): Promise<void> {
    try {
      const encrypted = await fs.readFile(config.tokenStoragePath, 'utf8');
      const json = this.decrypt(encrypted);
      const data = JSON.parse(json) as {
        tokens: [string, StoredToken][];
        currentSessionId: string | null;
        savedAt: string;
      };

      this.tokens = new Map(data.tokens);
      this.currentSessionId = data.currentSessionId;

      // Clean up expired tokens
      const now = Date.now();
      let expiredCount = 0;
      for (const [sessionId, token] of this.tokens.entries()) {
        if (token.expiresAt < now) {
          this.tokens.delete(sessionId);
          expiredCount++;
        }
      }

      logger.info('Tokens loaded from file', {
        path: config.tokenStoragePath,
        tokenCount: this.tokens.size,
        expiredRemoved: expiredCount,
        savedAt: data.savedAt,
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.info('No existing token file found, starting fresh');
      } else {
        logger.error('Failed to load tokens from file', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }
}

// Export singleton instance
export const tokenStore = new TokenStore();
