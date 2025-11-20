import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// =============================================================================
// Configuration Schema
// =============================================================================

const ConfigSchema = z.object({
  // Server
  port: z.number().default(8081),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Google OAuth
  googleClientId: z.string().min(1),
  googleClientSecret: z.string().min(1),
  googleRedirectUri: z.string().url().optional(),

  // Encryption
  encryptionKey: z.string().min(32).optional(),

  // Rate Limiting
  rateLimitPerMinute: z.number().default(60),
  rateLimitPerHour: z.number().default(1000),
  burstLimit: z.number().default(10),

  // MusicBrainz
  musicBrainzRateLimit: z.number().default(1000), // 1 request per second
  musicBrainzUserAgent: z.string().default('YouTubeMusicMCPServer/3.0.0'),

  // Spotify
  spotifyClientId: z.string().min(1),
  spotifyClientSecret: z.string().min(1),

  // Database
  databaseUrl: z.string().url().optional(),
  databasePoolMin: z.number().default(5),
  databasePoolMax: z.number().default(20),

  // Redis (optional)
  redisUrl: z.string().url().optional(),

  // Session
  sessionTtl: z.number().default(3600), // 1 hour in seconds

  // Token Storage
  tokenStoragePath: z.string().default('/data/tokens.json'),

  // Bypass auth for testing
  bypassAuth: z.boolean().default(false),
});

// =============================================================================
// Load and Validate Configuration
// =============================================================================

function loadConfig() {
  const rawConfig = {
    port: parseInt(process.env['PORT'] ?? '8081', 10),
    nodeEnv: process.env['NODE_ENV'] ?? 'development',

    googleClientId: process.env['GOOGLE_OAUTH_CLIENT_ID'] ?? '',
    googleClientSecret: process.env['GOOGLE_OAUTH_CLIENT_SECRET'] ?? '',
    googleRedirectUri: process.env['GOOGLE_REDIRECT_URI'] || undefined,

    encryptionKey: process.env['ENCRYPTION_KEY'] || undefined,

    rateLimitPerMinute: parseInt(process.env['RATE_LIMIT_PER_MINUTE'] ?? '60', 10),
    rateLimitPerHour: parseInt(process.env['RATE_LIMIT_PER_HOUR'] ?? '1000', 10),
    burstLimit: parseInt(process.env['BURST_LIMIT'] ?? '10', 10),

    musicBrainzRateLimit: parseInt(process.env['MUSICBRAINZ_RATE_LIMIT'] ?? '1000', 10),
    musicBrainzUserAgent: process.env['MUSICBRAINZ_USER_AGENT'] ?? 'YouTubeMusicMCPServer/3.0.0',

    spotifyClientId: process.env['SPOTIFY_CLIENT_ID'] ?? '',
    spotifyClientSecret: process.env['SPOTIFY_CLIENT_SECRET'] ?? '',

    databaseUrl: process.env['DATABASE_URL'] || undefined,
    databasePoolMin: parseInt(process.env['DATABASE_POOL_MIN'] ?? '5', 10),
    databasePoolMax: parseInt(process.env['DATABASE_POOL_MAX'] ?? '20', 10),

    redisUrl: process.env['REDIS_URL'] || undefined,

    sessionTtl: parseInt(process.env['SESSION_TTL'] ?? '3600', 10),

    tokenStoragePath: process.env['TOKEN_STORAGE_PATH'] ?? '/data/tokens.json',

    bypassAuth: process.env['BYPASS_AUTH_FOR_TESTING'] === 'true',
  };

  // In bypass mode, allow empty OAuth credentials
  if (rawConfig.bypassAuth) {
    if (!rawConfig.googleClientId) {
      rawConfig.googleClientId = 'bypass-testing';
    }
    if (!rawConfig.googleClientSecret) {
      rawConfig.googleClientSecret = 'bypass-testing';
    }
  }

  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    console.error('Configuration validation failed:');
    for (const error of result.error.errors) {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    }
    throw new Error('Invalid configuration');
  }

  return result.data;
}

export const config = loadConfig();

export type Config = z.infer<typeof ConfigSchema>;
