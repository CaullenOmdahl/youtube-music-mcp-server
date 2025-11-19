import { createLogger } from './logger.js';

const logger = createLogger('rate-limiter');

interface RateLimiterOptions {
  requestsPerMinute: number;
  requestsPerHour?: number;
  burstLimit?: number;
}

interface RequestRecord {
  timestamp: number;
}

export class RateLimiter {
  private readonly requestsPerMinute: number;
  private readonly requestsPerHour: number;
  private readonly burstLimit: number;
  private readonly requests: RequestRecord[] = [];
  private readonly name: string;

  constructor(name: string, options: RateLimiterOptions) {
    this.name = name;
    this.requestsPerMinute = options.requestsPerMinute;
    this.requestsPerHour = options.requestsPerHour ?? options.requestsPerMinute * 60;
    this.burstLimit = options.burstLimit ?? 10;
  }

  /**
   * Check if a request can be made, throws if rate limited
   */
  async acquire(): Promise<void> {
    const now = Date.now();
    this.cleanup(now);

    // Check burst limit (last 10 seconds)
    const burstWindow = now - 10000;
    const burstCount = this.requests.filter(r => r.timestamp > burstWindow).length;
    if (burstCount >= this.burstLimit) {
      const waitTime = this.calculateWaitTime('burst');
      logger.warn(`Rate limit exceeded (burst)`, {
        name: this.name,
        burstCount,
        waitTime
      });
      await this.wait(waitTime);
    }

    // Check per-minute limit
    const minuteWindow = now - 60000;
    const minuteCount = this.requests.filter(r => r.timestamp > minuteWindow).length;
    if (minuteCount >= this.requestsPerMinute) {
      const waitTime = this.calculateWaitTime('minute');
      logger.warn(`Rate limit exceeded (per-minute)`, {
        name: this.name,
        minuteCount,
        waitTime
      });
      await this.wait(waitTime);
    }

    // Check per-hour limit
    const hourWindow = now - 3600000;
    const hourCount = this.requests.filter(r => r.timestamp > hourWindow).length;
    if (hourCount >= this.requestsPerHour) {
      const waitTime = this.calculateWaitTime('hour');
      logger.warn(`Rate limit exceeded (per-hour)`, {
        name: this.name,
        hourCount,
        waitTime
      });
      await this.wait(waitTime);
    }

    // Record the request
    this.requests.push({ timestamp: Date.now() });
  }

  /**
   * Get current usage statistics
   */
  getStats() {
    const now = Date.now();
    this.cleanup(now);

    return {
      lastMinute: this.requests.filter(r => r.timestamp > now - 60000).length,
      lastHour: this.requests.filter(r => r.timestamp > now - 3600000).length,
      limits: {
        perMinute: this.requestsPerMinute,
        perHour: this.requestsPerHour,
        burst: this.burstLimit,
      },
    };
  }

  private cleanup(now: number) {
    // Remove requests older than 1 hour
    const cutoff = now - 3600000;
    while (this.requests.length > 0 && (this.requests[0]?.timestamp ?? 0) < cutoff) {
      this.requests.shift();
    }
  }

  private calculateWaitTime(type: 'burst' | 'minute' | 'hour'): number {
    switch (type) {
      case 'burst':
        return 1000; // Wait 1 second
      case 'minute':
        return 5000; // Wait 5 seconds
      case 'hour':
        return 60000; // Wait 1 minute
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Fixed-interval rate limiter for APIs with strict limits (e.g., MusicBrainz)
 */
export class FixedIntervalRateLimiter {
  private lastRequest: number = 0;
  private readonly intervalMs: number;
  private readonly name: string;

  constructor(name: string, intervalMs: number) {
    this.name = name;
    this.intervalMs = intervalMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;

    if (timeSinceLastRequest < this.intervalMs) {
      const waitTime = this.intervalMs - timeSinceLastRequest;
      logger.debug(`Waiting for rate limit`, {
        name: this.name,
        waitTime
      });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequest = Date.now();
  }
}
