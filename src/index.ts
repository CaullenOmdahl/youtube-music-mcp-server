import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { YouTubeMusicClient } from "./youtube-music-client.js";
import { PlaylistCurator } from "./curation.js";

// Export config schema for Smithery to use
export const configSchema = z.object({
  cookies: z.string().describe("YouTube Music cookies from music.youtube.com (required for all features)"),
  debug: z.boolean().optional().default(false).describe("Enable debug logging"),
});

// Type for the config
type Config = z.infer<typeof configSchema>;

function createMcpServer({
  config,
}: {
  config: Config
}) {
  const server = new McpServer({
    name: "YouTube Music Manager",
    version: "1.0.0",
  });

  // Initialize YouTube Music client and playlist curator
  const ytmusicClient = new YouTubeMusicClient();
  const playlistCurator = new PlaylistCurator(ytmusicClient);

  // Lazy initialization helper - non-blocking
  let initialized = false;
  const ensureInitialized = async () => {
    if (!initialized) {
      try {
        await ytmusicClient.initialize();
        if (config?.cookies) {
          await ytmusicClient.authenticate(config.cookies);
        }

        if (config?.debug) {
          console.log("YouTube Music client initialized and authenticated successfully");
        }

        initialized = true;
      } catch (error) {
        console.error("Failed to initialize YouTube Music client:", error);
        throw error; // Let tools handle the error appropriately
      }
    }
  };

  // Search Tool
  server.tool(
    "search",
    {
      description: "Search for songs, artists, albums, or playlists on YouTube Music",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
            minLength: 1
          },
          type: {
            type: "string",
            description: "Type of search",
            enum: ["songs", "artists", "albums", "playlists", "all"],
            default: "all"
          },
          limit: {
            type: "number",
            description: "Maximum number of results",
            minimum: 1,
            maximum: 50,
            default: 10
          }
        },
        required: ["query"]
      } as any,
    },
    async (args) => {
      try {
        await ensureInitialized();
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
  server.tool(
    "generate_playlist_suggestions",
    {
      title: "Generate Playlist Suggestions",
      description: "Generate curated playlist suggestions based on mood, decade, or seed songs with option to save favorites",
      inputSchema: {
        type: "object",
        properties: {
          mood: {
            type: "string",
            enum: ['energetic', 'chill', 'focus', 'party', 'workout', 'sleep'],
            description: "Mood for the playlist"
          },
          decade: {
            type: "number",
            description: "Decade for throwback playlist (e.g., 1990, 2000)"
          },
          durationMinutes: {
            type: "number",
            description: "Target duration in minutes"
          },
          includeExplicit: {
            type: "boolean",
            default: true,
            description: "Include explicit content"
          },
          saveFirstSuggestion: {
            type: "boolean",
            default: false,
            description: "Automatically save the first/best suggestion to your YouTube Music account"
          },
          privacy: {
            type: "string",
            enum: ['PUBLIC', 'PRIVATE', 'UNLISTED'],
            default: 'PRIVATE',
            description: "Privacy setting if saving playlist"
          }
        }
      } as any,
    },
    async (args) => {
      try {
        await ensureInitialized();
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

        let resultText = `🎵 **Generated ${suggestions.length} playlist suggestion(s):**\n\n`;

        // Save first suggestion if requested
        if (args.saveFirstSuggestion && suggestions.length > 0) {
          try {
            const bestSuggestion = suggestions[0];
            const songIds = bestSuggestion.songs.map(song => song.videoId);

            const savedPlaylist = await ytmusicClient.createPlaylist(
              bestSuggestion.title,
              `${bestSuggestion.description} - Generated by AI`,
              args.privacy,
              songIds
            );

            resultText += `✅ **SAVED TO YOUTUBE MUSIC: "${bestSuggestion.title}"**\n`;
            resultText += `**Playlist URL**: ${savedPlaylist.url}\n`;
            resultText += `**Playlist ID**: ${savedPlaylist.playlistId}\n\n`;
            resultText += `Check your YouTube Music library - it's ready to play! 🎶\n\n`;
            resultText += `---\n\n`;
          } catch (saveError) {
            resultText += `⚠️ **Failed to save playlist**: ${saveError}\n\n`;
            resultText += `---\n\n`;
          }
        }

        suggestions.forEach((suggestion, index) => {
          if (args.saveFirstSuggestion && index === 0) {
            resultText += `**${index + 1}. ${suggestion.title}** ⭐ (SAVED)\n`;
          } else {
            resultText += `**${index + 1}. ${suggestion.title}**\n`;
          }
          resultText += `**Description**: ${suggestion.description}\n`;
          resultText += `**Reasoning**: ${suggestion.reasoning}\n`;
          resultText += `**Songs**: ${suggestion.songs.length} tracks\n\n`;

          resultText += `**Track List:**\n`;
          suggestion.songs.slice(0, 10).forEach((song, songIndex) => {
            resultText += `${songIndex + 1}. **${song.title}** by ${song.artists?.map(a => a.name).join(', ')}\n`;
            if (song.videoId) resultText += `   Video ID: ${song.videoId}\n`;
          });

          if (suggestion.songs.length > 10) {
            resultText += `... and ${suggestion.songs.length - 10} more tracks\n`;
          }

          resultText += '\n---\n\n';
        });

        if (!args.saveFirstSuggestion) {
          resultText += `💡 **Tip**: Use \`saveFirstSuggestion: true\` to automatically save the best suggestion to your YouTube Music account!\n`;
        }

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
  server.tool(
    "create_smart_playlist",
    {
      title: "Create Smart Playlist",
      description: "Create a playlist based on natural language description and save it to your YouTube Music account",
      inputSchema: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Natural language description of the desired playlist"
          },
          targetLength: {
            type: "number",
            default: 25,
            description: "Target number of songs"
          },
          saveToAccount: {
            type: "boolean",
            default: true,
            description: "Automatically save the playlist to your YouTube Music account"
          },
          playlistTitle: {
            type: "string",
            description: "Custom title for the saved playlist (auto-generated if not provided)"
          },
          privacy: {
            type: "string",
            enum: ['PUBLIC', 'PRIVATE', 'UNLISTED'],
            default: 'PRIVATE',
            description: "Privacy setting for the saved playlist"
          }
        },
        required: ["description"]
      } as any,
    },
    async (args) => {
      try {
        await ensureInitialized();
        const playlist = await playlistCurator.createSmartPlaylist(
          args.description,
          args.targetLength
        );

        if (!playlist) {
          return {
            content: [{ type: "text", text: `Could not create a playlist based on: "${args.description}". Try being more specific about mood or decade.` }],
          };
        }

        let resultText = `🎵 **Smart Playlist Generated: ${playlist.title}**\n\n`;
        resultText += `**Description**: ${playlist.description}\n`;
        resultText += `**Reasoning**: ${playlist.reasoning}\n`;
        resultText += `**Total Songs**: ${playlist.songs.length}\n\n`;

        // Save to YouTube Music account if requested
        if (args.saveToAccount) {
          try {
            const playlistTitle = args.playlistTitle || playlist.title;
            const songIds = playlist.songs.map(song => song.videoId);

            const savedPlaylist = await ytmusicClient.createPlaylist(
              playlistTitle,
              `${playlist.description} - Generated by AI`,
              args.privacy,
              songIds
            );

            resultText += `✅ **Saved to YouTube Music!**\n`;
            resultText += `**Playlist URL**: ${savedPlaylist.url}\n`;
            resultText += `**Playlist ID**: ${savedPlaylist.playlistId}\n\n`;

            resultText += `You can now find "${playlistTitle}" in your YouTube Music library!\n\n`;
          } catch (saveError) {
            resultText += `⚠️ **Playlist generated but save failed**: ${saveError}\n\n`;
            resultText += `You can manually create the playlist using the songs below:\n\n`;
          }
        } else {
          resultText += `ℹ️ **Preview Mode** - Playlist not saved to YouTube Music\n`;
          resultText += `Use \`saveToAccount: true\` to save this playlist to your account.\n\n`;
        }

        resultText += `**Track List:**\n`;
        playlist.songs.forEach((song, index) => {
          resultText += `${index + 1}. **${song.title}** by ${song.artists?.map(a => a.name).join(', ')}\n`;
          if (song.duration) resultText += `   Duration: ${song.duration}\n`;
          resultText += `   Video ID: ${song.videoId}\n\n`;
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
  server.tool(
    "authenticate",
    {
      title: "Authenticate with YouTube Music",
      description: "Authenticate using YouTube Music cookies to access library features",
      inputSchema: {
        type: "object",
        properties: {
          cookies: {
            type: "string",
            description: "YouTube Music cookies string"
          }
        },
        required: ["cookies"]
      } as any,
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
  server.tool(
    "get_auth_status",
    {
      description: "Check current authentication status with YouTube Music",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      } as any,
    },
    async () => {
      try {
        await ytmusicClient.initialize();
        const status = ytmusicClient.getAuthStatus();

        let statusText = "🔐 Authentication Status:\n\n";
        statusText += `Authenticated: ${status.authenticated ? "✅ Yes" : "❌ No"}\n`;
        statusText += `Has valid credentials: ${status.hasCredentials ? "✅ Yes" : "❌ No"}\n`;

        if (!status.authenticated) {
          statusText += "\n⚠️ You need to authenticate with YouTube Music cookies to use most features.";
          statusText += "\n\nTo get your cookies:";
          statusText += "\n1. Go to https://music.youtube.com and sign in";
          statusText += "\n2. Open browser developer tools (F12)";
          statusText += "\n3. Go to Application/Storage > Cookies";
          statusText += "\n4. Copy all cookie values as a string";
        }

        return {
          content: [{ type: "text", text: statusText }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error checking auth status: ${error}` }],
        };
      }
    }
  );

  // Clear Authentication Tool
  server.tool(
    "clear_auth",
    {
      title: "Clear Authentication",
      description: "Clear stored authentication credentials",
      inputSchema: {
        type: "object",
        properties: {}
      } as any,
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

  // Create Playlist Tool
  server.tool(
    "create_playlist",
    {
      title: "Create YouTube Music Playlist",
      description: "Create a new playlist in your YouTube Music account and optionally add songs to it",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Playlist title"
          },
          description: {
            type: "string",
            description: "Playlist description"
          },
          privacy: {
            type: "string",
            enum: ['PUBLIC', 'PRIVATE', 'UNLISTED'],
            default: 'PRIVATE',
            description: "Privacy setting"
          },
          songIds: {
            type: "array",
            items: { type: "string" },
            description: "List of YouTube Music video IDs to add"
          }
        },
        required: ["title"]
      } as any,
    },
    async (args) => {
      try {
        await ensureInitialized();
        const result = await ytmusicClient.createPlaylist(
          args.title,
          args.description,
          args.privacy,
          args.songIds
        );

        let resultText = `🎵 **Playlist Created Successfully!**\n\n`;
        resultText += `**Title**: ${args.title}\n`;
        if (args.description) resultText += `**Description**: ${args.description}\n`;
        resultText += `**Privacy**: ${args.privacy}\n`;
        resultText += `**Playlist ID**: ${result.playlistId}\n`;
        resultText += `**URL**: ${result.url}\n\n`;

        if (args.songIds && args.songIds.length > 0) {
          resultText += `✅ **${args.songIds.length} songs added to the playlist**\n`;
        }

        resultText += `\nYou can now find this playlist in your YouTube Music library!`;

        return {
          content: [{ type: "text", text: resultText }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error creating playlist: ${error}` }],
        };
      }
    }
  );

  // Add Songs to Playlist Tool
  server.tool(
    "add_songs_to_playlist",
    {
      title: "Add Songs to Playlist",
      description: "Add songs to an existing YouTube Music playlist",
      inputSchema: {
        type: "object",
        properties: {
          playlistId: {
            type: "string",
            description: "Playlist ID"
          },
          songIds: {
            type: "array",
            items: { type: "string" },
            description: "List of YouTube Music video IDs to add"
          }
        },
        required: ["playlistId", "songIds"]
      } as any,
    },
    async (args) => {
      try {
        await ensureInitialized();
        await ytmusicClient.addSongsToPlaylist(args.playlistId, args.songIds);

        return {
          content: [{
            type: "text",
            text: `✅ **Songs Added Successfully!**\n\n**${args.songIds.length} songs** have been added to playlist **${args.playlistId}**\n\nCheck your YouTube Music library to see the updated playlist!`
          }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error adding songs to playlist: ${error}` }],
        };
      }
    }
  );

  // Get My Playlists Tool
  server.tool(
    "get_my_playlists",
    {
      title: "Get My Playlists",
      description: "List all playlists in your YouTube Music library",
      inputSchema: {
        type: "object",
        properties: {}
      } as any,
    },
    async () => {
      try {
        await ensureInitialized();
        const playlists = await ytmusicClient.getLibraryPlaylists();

        if (playlists.length === 0) {
          return {
            content: [{ type: "text", text: "📝 **No Playlists Found**\n\nYou don't have any playlists in your YouTube Music library yet.\n\nUse the `create_playlist` tool to create your first playlist!" }],
          };
        }

        let resultText = `🎵 **Your YouTube Music Playlists** (${playlists.length} total)\n\n`;

        playlists.forEach((playlist, index) => {
          resultText += `**${index + 1}. ${playlist.title}**\n`;
          if (playlist.description) resultText += `   Description: ${playlist.description}\n`;
          if (playlist.trackCount) resultText += `   Tracks: ${playlist.trackCount}\n`;
          if (playlist.author) resultText += `   Created by: ${playlist.author}\n`;
          resultText += `   Playlist ID: ${playlist.id}\n\n`;
        });

        return {
          content: [{ type: "text", text: resultText }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error retrieving playlists: ${error}` }],
        };
      }
    }
  );

  // Get Playlist Details Tool
  server.tool(
    "get_playlist",
    {
      title: "Get Playlist Details",
      description: "Get detailed information about a specific playlist including its songs",
      inputSchema: {
        type: "object",
        properties: {
          playlistId: {
            type: "string",
            description: "Playlist ID to fetch"
          },
          limit: {
            type: "number",
            minimum: 1,
            maximum: 200,
            default: 100,
            description: "Maximum number of songs to fetch"
          }
        },
        required: ["playlistId"]
      } as any,
    },
    async (args) => {
      try {
        await ensureInitialized();
        const { playlist, songs } = await ytmusicClient.getPlaylist(args);

        let resultText = `🎵 **${playlist.title}**\n\n`;
        if (playlist.description) resultText += `**Description**: ${playlist.description}\n`;
        if (playlist.author) resultText += `**Created by**: ${playlist.author}\n`;
        if (playlist.trackCount) resultText += `**Total tracks**: ${playlist.trackCount}\n`;
        resultText += `**Playlist ID**: ${playlist.id}\n\n`;

        if (songs.length > 0) {
          resultText += `**Songs (showing ${songs.length}):**\n\n`;
          songs.forEach((song, index) => {
            resultText += `${index + 1}. **${song.title}** by ${song.artists?.map(a => a.name).join(', ')}\n`;
            if (song.album) resultText += `   Album: ${song.album.name}\n`;
            if (song.duration) resultText += `   Duration: ${song.duration}\n`;
            resultText += `   Video ID: ${song.videoId}\n\n`;
          });
        } else {
          resultText += `📝 This playlist is empty.\n`;
        }

        return {
          content: [{ type: "text", text: resultText }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error getting playlist details: ${error}` }],
        };
      }
    }
  );

  return server.server;
}

// Export the MCP server creation function for Smithery
export default createMcpServer;
export const stateless = true;