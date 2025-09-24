import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { YouTubeMusicClient } from "./youtube-music-client.js";
import { PlaylistCurator } from "./curation.js";
import {
  SearchToolRequestSchema,
  CreatePlaylistRequestSchema,
  AddSongsToPlaylistRequestSchema,
  RemoveSongsFromPlaylistRequestSchema,
  GetPlaylistRequestSchema
} from "./types.js";

// Configuration schema for user-level settings
export const configSchema = z.object({
  debug: z.boolean().default(false).describe("Enable debug logging"),
  cookies: z.string().optional().describe("YouTube Music cookies for authentication"),
});

export default function createServer({
  config,
}: {
  config: z.infer<typeof configSchema>
}) {
  const server = new McpServer({
    name: "YouTube Music Manager",
    version: "1.0.0",
  });

  // Initialize YouTube Music client and playlist curator
  const ytmusicClient = new YouTubeMusicClient();
  const playlistCurator = new PlaylistCurator(ytmusicClient);

  // Initialize the client on server start
  let initialized = false;
  const initializeClient = async () => {
    if (!initialized) {
      try {
        await ytmusicClient.initialize();

        // Authenticate if cookies are provided in config
        if (config.cookies) {
          await ytmusicClient.authenticate(config.cookies);
        }

        initialized = true;
        if (config.debug) {
          console.log("YouTube Music client initialized successfully");
        }
      } catch (error) {
        console.error("Failed to initialize YouTube Music client:", error);
      }
    }
  };

  // Search Tool
  server.registerTool(
    "search",
    {
      title: "Search YouTube Music",
      description: "Search for songs, artists, albums, or playlists on YouTube Music",
      inputSchema: SearchToolRequestSchema,
    },
    async (args) => {
      await initializeClient();

      try {
        const results = await ytmusicClient.search(args);

        let resultText = `Found results for "${args.query}":\n\n`;

        if (results.songs && results.songs.length > 0) {
          resultText += `**Songs (${results.songs.length}):**\n`;
          results.songs.forEach((song, index) => {
            resultText += `${index + 1}. ${song.title} by ${song.artists?.map(a => a.name).join(', ')}\n`;
            if (song.album) resultText += `   Album: ${song.album.name}\n`;
            if (song.duration) resultText += `   Duration: ${song.duration}\n`;
            resultText += `   Video ID: ${song.videoId}\n\n`;
          });
        }

        if (results.artists && results.artists.length > 0) {
          resultText += `**Artists (${results.artists.length}):**\n`;
          results.artists.forEach((artist, index) => {
            resultText += `${index + 1}. ${artist.name}`;
            if (artist.subscribers) resultText += ` (${artist.subscribers} subscribers)`;
            resultText += `\n   Artist ID: ${artist.id}\n\n`;
          });
        }

        if (results.albums && results.albums.length > 0) {
          resultText += `**Albums (${results.albums.length}):**\n`;
          results.albums.forEach((album, index) => {
            resultText += `${index + 1}. ${album.title} by ${album.artists?.map(a => a.name).join(', ')}`;
            if (album.year) resultText += ` (${album.year})`;
            if (album.trackCount) resultText += ` - ${album.trackCount} tracks`;
            resultText += `\n   Album ID: ${album.id}\n\n`;
          });
        }

        if (results.playlists && results.playlists.length > 0) {
          resultText += `**Playlists (${results.playlists.length}):**\n`;
          results.playlists.forEach((playlist, index) => {
            resultText += `${index + 1}. ${playlist.title}`;
            if (playlist.author) resultText += ` by ${playlist.author}`;
            if (playlist.trackCount) resultText += ` (${playlist.trackCount} tracks)`;
            resultText += `\n   Playlist ID: ${playlist.id}\n\n`;
          });
        }

        return {
          content: [{ type: "text", text: resultText }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error searching YouTube Music: ${error}` }],
        };
      }
    }
  );

  // Generate Playlist Suggestions Tool
  server.registerTool(
    "generate_playlist_suggestions",
    {
      title: "Generate Playlist Suggestions",
      description: "Generate curated playlist suggestions based on mood, decade, or seed songs",
      inputSchema: z.object({
        mood: z.enum(['energetic', 'chill', 'focus', 'party', 'workout', 'sleep']).optional().describe("Mood for the playlist"),
        decade: z.number().optional().describe("Decade for throwback playlist (e.g., 1990, 2000)"),
        durationMinutes: z.number().optional().describe("Target duration in minutes"),
        includeExplicit: z.boolean().default(true).describe("Include explicit content"),
      }),
    },
    async (args) => {
      await initializeClient();

      try {
        const suggestions = await playlistCurator.generatePlaylistSuggestions(
          undefined,
          undefined,
          {
            mood: args.mood,
            decade: args.decade,
            durationMinutes: args.durationMinutes,
            includeExplicit: args.includeExplicit,
          }
        );

        if (suggestions.length === 0) {
          return {
            content: [{ type: "text", text: "No playlist suggestions could be generated with the given criteria." }],
          };
        }

        let resultText = `Generated ${suggestions.length} playlist suggestion(s):\n\n`;

        suggestions.forEach((suggestion, index) => {
          resultText += `**${index + 1}. ${suggestion.title}**\n`;
          resultText += `Description: ${suggestion.description}\n`;
          resultText += `Reasoning: ${suggestion.reasoning}\n`;
          resultText += `Songs: ${suggestion.songs.length} tracks\n\n`;

          resultText += `**Track List:**\n`;
          suggestion.songs.slice(0, 10).forEach((song, songIndex) => {
            resultText += `${songIndex + 1}. ${song.title} by ${song.artists?.map(a => a.name).join(', ')}\n`;
          });

          if (suggestion.songs.length > 10) {
            resultText += `... and ${suggestion.songs.length - 10} more tracks\n`;
          }

          resultText += '\n---\n\n';
        });

        return {
          content: [{ type: "text", text: resultText }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error generating playlist suggestions: ${error}` }],
        };
      }
    }
  );

  // Create Smart Playlist Tool
  server.registerTool(
    "create_smart_playlist",
    {
      title: "Create Smart Playlist",
      description: "Create a playlist based on natural language description",
      inputSchema: z.object({
        description: z.string().describe("Natural language description of the desired playlist"),
        targetLength: z.number().default(25).describe("Target number of songs"),
      }),
    },
    async (args) => {
      await initializeClient();

      try {
        const playlist = await playlistCurator.createSmartPlaylist(
          args.description,
          args.targetLength
        );

        if (!playlist) {
          return {
            content: [{ type: "text", text: `Could not create a playlist based on: "${args.description}". Try being more specific about mood or decade.` }],
          };
        }

        let resultText = `**Created Smart Playlist: ${playlist.title}**\n\n`;
        resultText += `Description: ${playlist.description}\n`;
        resultText += `Reasoning: ${playlist.reasoning}\n`;
        resultText += `Total Songs: ${playlist.songs.length}\n\n`;

        resultText += `**Track List:**\n`;
        playlist.songs.forEach((song, index) => {
          resultText += `${index + 1}. ${song.title} by ${song.artists?.map(a => a.name).join(', ')}\n`;
          if (song.duration) resultText += `   Duration: ${song.duration}\n`;
        });

        return {
          content: [{ type: "text", text: resultText }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error creating smart playlist: ${error}` }],
        };
      }
    }
  );

  // Authentication Tool
  server.registerTool(
    "authenticate",
    {
      title: "Authenticate with YouTube Music",
      description: "Authenticate using YouTube Music cookies to access library features",
      inputSchema: z.object({
        cookies: z.string().describe("YouTube Music cookies string"),
      }),
    },
    async (args) => {
      try {
        await ytmusicClient.authenticate(args.cookies);
        return {
          content: [{ type: "text", text: "Successfully authenticated with YouTube Music!" }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Authentication failed: ${error}` }],
        };
      }
    }
  );

  // Get Authentication Status Tool
  server.registerTool(
    "get_auth_status",
    {
      title: "Get Authentication Status",
      description: "Check current authentication status with YouTube Music",
      inputSchema: z.object({}),
    },
    async () => {
      const status = ytmusicClient.getAuthStatus();

      let statusText = `**YouTube Music Authentication Status**\n\n`;
      statusText += `Authenticated: ${status.authenticated ? '✅ Yes' : '❌ No'}\n`;
      statusText += `Has Credentials: ${status.hasCredentials ? '✅ Yes' : '❌ No'}\n\n`;

      if (!status.authenticated) {
        statusText += `To authenticate, use the authenticate tool with your YouTube Music cookies.\n`;
        statusText += `You can get cookies by logging into music.youtube.com and copying the cookie string.`;
      }

      return {
        content: [{ type: "text", text: statusText }],
      };
    }
  );

  // Clear Authentication Tool
  server.registerTool(
    "clear_auth",
    {
      title: "Clear Authentication",
      description: "Clear stored authentication credentials",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        await ytmusicClient.clearAuth();
        return {
          content: [{ type: "text", text: "Authentication credentials have been cleared." }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error clearing authentication: ${error}` }],
        };
      }
    }
  );

  return server.server;
}