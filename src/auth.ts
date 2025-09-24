import * as fs from "fs-extra";
import * as path from "path";
import { AuthConfigSchema, AuthConfig } from "./types.js";

const AUTH_FILE_PATH = path.join(process.cwd(), 'auth.json');

export class AuthManager {
  private config: AuthConfig;

  constructor() {
    this.config = { authenticated: false };
  }

  async loadAuth(): Promise<AuthConfig> {
    try {
      if (await fs.pathExists(AUTH_FILE_PATH)) {
        const data = await fs.readJson(AUTH_FILE_PATH);
        this.config = AuthConfigSchema.parse(data);
      }
    } catch (error) {
      console.warn('Failed to load authentication config:', error);
      this.config = { authenticated: false };
    }
    return this.config;
  }

  async saveAuth(config: Partial<AuthConfig>): Promise<void> {
    try {
      this.config = { ...this.config, ...config };
      await fs.writeJson(AUTH_FILE_PATH, this.config, { spaces: 2 });
    } catch (error) {
      console.error('Failed to save authentication config:', error);
      throw error;
    }
  }

  async setCookies(cookies: string): Promise<void> {
    await this.saveAuth({
      cookies,
      authenticated: true
    });
  }

  async setHeaders(headers: Record<string, string>): Promise<void> {
    await this.saveAuth({
      headers,
      authenticated: true
    });
  }

  isAuthenticated(): boolean {
    return this.config.authenticated && (!!this.config.cookies || !!this.config.headers);
  }

  getCookies(): string | undefined {
    return this.config.cookies;
  }

  getHeaders(): Record<string, string> | undefined {
    return this.config.headers;
  }

  async clearAuth(): Promise<void> {
    this.config = { authenticated: false };
    try {
      if (await fs.pathExists(AUTH_FILE_PATH)) {
        await fs.remove(AUTH_FILE_PATH);
      }
    } catch (error) {
      console.warn('Failed to remove auth file:', error);
    }
  }

  getAuthStatus(): { authenticated: boolean; hasCredentials: boolean } {
    return {
      authenticated: this.config.authenticated,
      hasCredentials: this.isAuthenticated()
    };
  }

  async validateAuth(): Promise<boolean> {
    // TODO: Implement actual validation by making a test API call
    // For now, just check if we have credentials
    return this.isAuthenticated();
  }
}