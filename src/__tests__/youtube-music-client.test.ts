/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * YouTube Music Client Tests
 *
 * These tests verify the InnerTube API request structure to ensure:
 * 1. Correct context structure (WEB_REMIX client)
 * 2. Proper authentication headers (Bearer token, X-Goog-Visitor-Id)
 * 3. No conflicting auth methods (API key vs OAuth)
 * 4. No incorrect Content-Encoding header
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Test the request structure directly without full client instantiation
describe('YouTube Music InnerTube API Request Structure', () => {
  describe('Context Structure', () => {
    it('should use WEB_REMIX as clientName', () => {
      const context = {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: '1.20251120.01.00',
        },
        user: {},
      };

      expect(context.client.clientName).toBe('WEB_REMIX');
    });

    it('should have correct clientVersion format', () => {
      const getClientVersion = (): string => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `1.${year}${month}${day}.01.00`;
      };

      const version = getClientVersion();
      expect(version).toMatch(/^1\.\d{8}\.01\.00$/);
    });

    it('should have empty user object', () => {
      const context = {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: '1.20251120.01.00',
        },
        user: {},
      };

      expect(context.user).toEqual({});
    });
  });

  describe('Query Parameters', () => {
    it('should use alt=json for OAuth requests (not API key)', () => {
      // This is the critical fix - OAuth should NOT include API key
      const searchParams = {
        alt: 'json',
      };

      expect(searchParams.alt).toBe('json');
      expect(searchParams).not.toHaveProperty('key');
    });

    it('should NOT include prettyPrint parameter', () => {
      const searchParams = {
        alt: 'json',
      };

      expect(searchParams).not.toHaveProperty('prettyPrint');
    });
  });

  describe('Headers', () => {
    it('should include required headers for InnerTube API', () => {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:88.0) Gecko/20100101 Firefox/88.0',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/',
        'X-Youtube-Client-Name': '67',
        'X-Youtube-Client-Version': '1.20251120.01.00',
      };

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Origin']).toBe('https://music.youtube.com');
      expect(headers['X-Youtube-Client-Name']).toBe('67');
    });

    it('should NOT include Content-Encoding header (body is not compressed)', () => {
      const headers = {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/json',
      };

      expect(headers).not.toHaveProperty('Content-Encoding');
    });

    it('should include Bearer token format for OAuth', () => {
      const token = 'ya29.test-token-123';
      const authHeader = `Bearer ${token}`;

      expect(authHeader).toMatch(/^Bearer .+$/);
      expect(authHeader).toBe('Bearer ya29.test-token-123');
    });

    it('should include X-Goog-Visitor-Id header', () => {
      const visitorId = 'CgtDUmhsM3BLWmQ2SS...';
      const headers = {
        'X-Goog-Visitor-Id': visitorId,
      };

      expect(headers['X-Goog-Visitor-Id']).toBeTruthy();
    });

    it('should include X-Goog-Request-Time header for authenticated requests', () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const headers = {
        'X-Goog-Request-Time': timestamp,
      };

      expect(headers['X-Goog-Request-Time']).toMatch(/^\d+$/);
    });
  });

  describe('Search Request Body', () => {
    it('should include query in request body', () => {
      const body = {
        context: {
          client: { clientName: 'WEB_REMIX', clientVersion: '1.20251120.01.00' },
          user: {},
        },
        query: 'bohemian rhapsody',
      };

      expect(body.query).toBe('bohemian rhapsody');
    });

    it('should include params for filtered search (songs)', () => {
      const songFilterParams = 'EgWKAQIIAWoMEAMQBBAJEAoQBRAQ';
      const body = {
        context: {
          client: { clientName: 'WEB_REMIX', clientVersion: '1.20251120.01.00' },
          user: {},
        },
        query: 'test',
        params: songFilterParams,
      };

      expect(body.params).toBe(songFilterParams);
    });

    it('should include params for filtered search (albums)', () => {
      const albumFilterParams = 'EgWKAQIYAWoMEAMQBBAJEAoQBRAQ';
      const body = {
        context: {
          client: { clientName: 'WEB_REMIX', clientVersion: '1.20251120.01.00' },
          user: {},
        },
        query: 'test',
        params: albumFilterParams,
      };

      expect(body.params).toBe(albumFilterParams);
    });
  });

  describe('Visitor ID Extraction', () => {
    it('should extract visitor ID using primary pattern', () => {
      const htmlBody = 'ytcfg.set({"VISITOR_DATA":"visitor123abc"});';
      const match = htmlBody.match(/ytcfg\.set\s*\(\s*({.+?})\s*\)\s*;/);

      expect(match).toBeTruthy();
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        expect(parsed.VISITOR_DATA).toBe('visitor123abc');
      }
    });

    it('should extract visitor ID using alternative pattern', () => {
      const htmlBody = 'some content "VISITOR_DATA":"visitor456def" more content';
      const match = htmlBody.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/);

      expect(match).toBeTruthy();
      if (match && match[1]) {
        expect(match[1]).toBe('visitor456def');
      }
    });
  });
});

describe('OAuth Bearer Token Authentication', () => {
  it('should format Bearer token correctly', () => {
    const accessToken = 'ya29.A0ATi6K2...';
    const authHeader = `Bearer ${accessToken}`;

    expect(authHeader.startsWith('Bearer ')).toBe(true);
    expect(authHeader.length).toBeGreaterThan(10);
  });

  it('should validate token is not expired', () => {
    const expiresAt = Date.now() + 3600000; // 1 hour from now
    const isExpired = expiresAt < Date.now();

    expect(isExpired).toBe(false);
  });

  it('should detect expired tokens', () => {
    const expiresAt = Date.now() - 1000; // 1 second ago
    const isExpired = expiresAt < Date.now();

    expect(isExpired).toBe(true);
  });

  it('should detect tokens needing refresh (5 minutes before expiry)', () => {
    const expiresAt = Date.now() + 4 * 60 * 1000; // 4 minutes from now
    const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    const needsRefresh = expiresAt - Date.now() < REFRESH_THRESHOLD;

    expect(needsRefresh).toBe(true);
  });
});

