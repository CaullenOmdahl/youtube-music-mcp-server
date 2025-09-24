import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { YouTubeMusicClient } from "./youtube-music-client.js";
import { PlaylistCurator } from "./curation.js";

// Configuration schema for user-level settings
export const configSchema = {
  type: "object",
  properties: {
    debug: {
      type: "boolean",
      default: false,
      description: "Enable debug logging"
    },
    cookies: {
      type: "string",
      description: "YouTube Music cookies for authentication"
    }
  },
  required: ["cookies"]
};

interface Config {
  debug?: boolean;
  cookies?: string;
}

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

  // Search Tool - using correct API: tool(name, paramsSchema, handler)
  server.tool(
    "search",
    {
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
    async (args) => {
      try {
        await ensureInitialized();
        const results = await ytmusicClient.search(args);

        let resultText = `Found results for "${args.query}":\n\n`;

        if (results.songs && results.songs.length > 0) {
          resultText += `🎵 Songs:\n`;
          results.songs.forEach((song, i) => {
            resultText += `${i + 1}. ${song.title} by ${song.artists.map(a => a.name).join(", ")}\n`;
            resultText += `   Album: ${song.album.name}\n`;
            if (song.duration) resultText += `   Duration: ${song.duration}\n`;
            resultText += `   ID: ${song.videoId}\n\n`;
          });
        }

        if (results.artists && results.artists.length > 0) {
          resultText += `👤 Artists:\n`;
          results.artists.forEach((artist, i) => {
            resultText += `${i + 1}. ${artist.name}\n`;
            if (artist.subscribers) resultText += `   Subscribers: ${artist.subscribers}\n`;
            resultText += `   ID: ${artist.id}\n\n`;
          });
        }

        if (results.albums && results.albums.length > 0) {
          resultText += `💿 Albums:\n`;
          results.albums.forEach((album, i) => {
            resultText += `${i + 1}. ${album.title} by ${album.artists.map(a => a.name).join(", ")}\n`;
            if (album.year) resultText += `   Year: ${album.year}\n`;
            if (album.trackCount) resultText += `   Tracks: ${album.trackCount}\n`;
            resultText += `   ID: ${album.id}\n\n`;
          });
        }

        if (results.playlists && results.playlists.length > 0) {
          resultText += `📜 Playlists:\n`;
          results.playlists.forEach((playlist, i) => {
            resultText += `${i + 1}. ${playlist.title}\n`;
            if (playlist.author) resultText += `   By: ${playlist.author}\n`;
            if (playlist.trackCount) resultText += `   Tracks: ${playlist.trackCount}\n`;
            resultText += `   ID: ${playlist.id}\n\n`;
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

  // Continue with other tools using the same pattern...
  // For brevity, showing get_auth_status as another example:

  server.tool(
    "get_auth_status",
    {
      type: "object",
      properties: {},
      required: []
    } as any,
    async () => {
      try {
        await ytmusicClient.initialize();
        const status = await ytmusicClient.getAuthStatus();

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

  return server.server;
}

// Export the MCP server creation function for Smithery
export default createMcpServer;
export const stateless = true;