/**
 * In-memory session cache.
 * Lives for the lifetime of the stdio process (one Claude Desktop session).
 * Entries never expire automatically — only invalidated via force_refresh.
 */
class SessionCache {
  private cache = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.cache.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const sessionCache = new SessionCache();
