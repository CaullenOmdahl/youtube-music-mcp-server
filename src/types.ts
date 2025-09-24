import { z } from "zod";

// YouTube Music API types
export const SongSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  artists: z.array(z.object({
    name: z.string(),
    id: z.string().optional()
  })),
  album: z.object({
    name: z.string(),
    id: z.string().optional()
  }).optional(),
  duration: z.string().optional(),
  thumbnails: z.array(z.object({
    url: z.string(),
    width: z.number(),
    height: z.number()
  })).optional(),
  isExplicit: z.boolean().optional(),
  year: z.number().optional()
});

export const PlaylistSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  thumbnails: z.array(z.object({
    url: z.string(),
    width: z.number(),
    height: z.number()
  })).optional(),
  trackCount: z.number().optional(),
  author: z.string().optional(),
  year: z.number().optional(),
  privacy: z.enum(['PUBLIC', 'PRIVATE', 'UNLISTED']).optional()
});

export const ArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  thumbnails: z.array(z.object({
    url: z.string(),
    width: z.number(),
    height: z.number()
  })).optional(),
  subscribers: z.string().optional()
});

export const AlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  artists: z.array(z.object({
    name: z.string(),
    id: z.string().optional()
  })),
  year: z.number().optional(),
  thumbnails: z.array(z.object({
    url: z.string(),
    width: z.number(),
    height: z.number()
  })).optional(),
  trackCount: z.number().optional()
});

// Search result types
export const SearchResultSchema = z.object({
  songs: z.array(SongSchema).optional(),
  artists: z.array(ArtistSchema).optional(),
  albums: z.array(AlbumSchema).optional(),
  playlists: z.array(PlaylistSchema).optional()
});

// Playlist creation request
export const CreatePlaylistRequestSchema = z.object({
  title: z.string().min(1, "Playlist title is required"),
  description: z.string().optional(),
  privacy: z.enum(['PUBLIC', 'PRIVATE', 'UNLISTED']).default('PRIVATE'),
  songIds: z.array(z.string()).optional()
});

// Authentication types
export const AuthConfigSchema = z.object({
  cookies: z.string().optional(),
  headers: z.record(z.string()).optional(),
  authenticated: z.boolean().default(false)
});

// MCP Tool request schemas
export const SearchToolRequestSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  type: z.enum(['songs', 'artists', 'albums', 'playlists', 'all']).default('all'),
  limit: z.number().min(1).max(50).default(10)
});

export const CreatePlaylistToolRequestSchema = CreatePlaylistRequestSchema;

export const AddSongsToPlaylistRequestSchema = z.object({
  playlistId: z.string().min(1, "Playlist ID is required"),
  songIds: z.array(z.string().min(1)).min(1, "At least one song ID is required")
});

export const RemoveSongsFromPlaylistRequestSchema = z.object({
  playlistId: z.string().min(1, "Playlist ID is required"),
  songIds: z.array(z.string().min(1)).min(1, "At least one song ID is required")
});

export const GetPlaylistRequestSchema = z.object({
  playlistId: z.string().min(1, "Playlist ID is required"),
  limit: z.number().min(1).max(1000).default(100)
});

// Inferred types
export type Song = z.infer<typeof SongSchema>;
export type Playlist = z.infer<typeof PlaylistSchema>;
export type Artist = z.infer<typeof ArtistSchema>;
export type Album = z.infer<typeof AlbumSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type CreatePlaylistRequest = z.infer<typeof CreatePlaylistRequestSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type SearchToolRequest = z.infer<typeof SearchToolRequestSchema>;
export type AddSongsToPlaylistRequest = z.infer<typeof AddSongsToPlaylistRequestSchema>;
export type RemoveSongsFromPlaylistRequest = z.infer<typeof RemoveSongsFromPlaylistRequestSchema>;
export type GetPlaylistRequest = z.infer<typeof GetPlaylistRequestSchema>;