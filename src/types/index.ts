import { z } from 'zod';

// =============================================================================
// Core Music Types
// =============================================================================

export const ArtistSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
});

export const AlbumSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  year: z.number().optional(),
});

export const ThumbnailSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
});

export const SongSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  artists: z.array(ArtistSchema),
  album: AlbumSchema.optional(),
  duration: z.string().optional(),
  durationSeconds: z.number().optional(),
  thumbnails: z.array(ThumbnailSchema).optional(),
  explicit: z.boolean().optional(),
  year: z.number().optional(),
});

export const PlaylistSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  thumbnails: z.array(ThumbnailSchema).optional(),
  trackCount: z.number().optional(),
  privacy: z.enum(['PRIVATE', 'PUBLIC', 'UNLISTED']).optional(),
  tracks: z.array(SongSchema).optional(),
});

// =============================================================================
// API Response Types
// =============================================================================

export const SearchResponseSchema = z.object({
  songs: z.array(SongSchema).optional(),
  albums: z.array(AlbumSchema.extend({
    artists: z.array(ArtistSchema),
    browseId: z.string(),
  })).optional(),
  artists: z.array(ArtistSchema.extend({
    browseId: z.string(),
    thumbnails: z.array(ThumbnailSchema).optional(),
  })).optional(),
  metadata: z.object({
    totalResults: z.number().optional(),
    returned: z.number(),
    hasMore: z.boolean(),
  }),
});

export const PlaylistResponseSchema = z.object({
  playlist: PlaylistSchema,
  metadata: z.object({
    totalTracks: z.number(),
    returned: z.number(),
    hasMore: z.boolean(),
  }),
});

// =============================================================================
// MusicBrainz Types
// =============================================================================

export const MBTagSchema = z.object({
  name: z.string(),
  count: z.number(),
});

export const MBArtistSchema = z.object({
  mbid: z.string(),
  name: z.string(),
  disambiguation: z.string().optional(),
  tags: z.array(MBTagSchema).optional(),
  score: z.number().optional(),
});

export const MBRecordingSchema = z.object({
  mbid: z.string(),
  title: z.string(),
  artist: z.string(),
  score: z.number().optional(),
});

// =============================================================================
// ListenBrainz Types
// =============================================================================

export const LBSimilarArtistSchema = z.object({
  artistMbid: z.string(),
  name: z.string(),
  score: z.number(),
});

export const LBRecordingSchema = z.object({
  title: z.string(),
  creator: z.string(),
  identifier: z.string().optional(),
});

// =============================================================================
// Smart Playlist Session Types
// =============================================================================

export const PlaylistSessionSchema = z.object({
  sessionId: z.string(),
  mode: z.enum(['discover', 'from_library', 'mixed']),
  seedArtists: z.array(MBArtistSchema),
  seedTracks: z.array(MBRecordingSchema),
  excludeArtists: z.array(z.string()),
  preferTags: z.array(z.string()),
  avoidTags: z.array(z.string()),
  diversity: z.enum(['focused', 'balanced', 'diverse']),
  recommendations: z.array(SongSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// =============================================================================
// OAuth Types
// =============================================================================

export const OAuthTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  tokenType: z.string(),
});

export const AuthStatusSchema = z.object({
  authenticated: z.boolean(),
  expiresAt: z.number().optional(),
  needsRefresh: z.boolean().optional(),
  authUrl: z.string().optional(),
});

// =============================================================================
// Server Status Types
// =============================================================================

export const ServerStatusSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  uptime: z.number(),
  rateLimits: z.object({
    requestsPerMinute: z.number(),
    currentUsage: z.number(),
  }),
  services: z.object({
    youtubeMusic: z.enum(['connected', 'disconnected', 'error']),
    musicBrainz: z.enum(['connected', 'disconnected', 'error']),
    listenBrainz: z.enum(['connected', 'disconnected', 'error']),
  }),
});

// =============================================================================
// Inferred Types
// =============================================================================

export type Artist = z.infer<typeof ArtistSchema>;
export type Album = z.infer<typeof AlbumSchema>;
export type Song = z.infer<typeof SongSchema>;
export type Playlist = z.infer<typeof PlaylistSchema>;
export type Thumbnail = z.infer<typeof ThumbnailSchema>;

export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type PlaylistResponse = z.infer<typeof PlaylistResponseSchema>;

export type MBTag = z.infer<typeof MBTagSchema>;
export type MBArtist = z.infer<typeof MBArtistSchema>;
export type MBRecording = z.infer<typeof MBRecordingSchema>;

export type LBSimilarArtist = z.infer<typeof LBSimilarArtistSchema>;
export type LBRecording = z.infer<typeof LBRecordingSchema>;

export type PlaylistSession = z.infer<typeof PlaylistSessionSchema>;
export type OAuthToken = z.infer<typeof OAuthTokenSchema>;
export type AuthStatus = z.infer<typeof AuthStatusSchema>;
export type ServerStatus = z.infer<typeof ServerStatusSchema>;

// =============================================================================
// Tool Parameter Types
// =============================================================================

export interface SearchParams {
  query: string;
  filter?: 'songs' | 'albums' | 'artists' | 'playlists';
  limit?: number;
}

export interface PlaylistCreateParams {
  name: string;
  description?: string;
  privacy?: 'PRIVATE' | 'PUBLIC' | 'UNLISTED';
}

export interface PlaylistEditParams {
  playlistId: string;
  name?: string;
  description?: string;
  privacy?: 'PRIVATE' | 'PUBLIC' | 'UNLISTED';
}

export interface RefineParams {
  sessionId: string;
  excludeArtists?: string[];
  preferTags?: string[];
  avoidTags?: string[];
  diversity?: 'focused' | 'balanced' | 'diverse';
}
