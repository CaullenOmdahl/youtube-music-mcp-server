import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Register workflow prompts for common YouTube Music tasks
 */
export function registerWorkflowPrompts(server: McpServer): void {
  server.registerPrompt(
    'search-and-create-playlist',
    {
      title: 'Search Songs & Create Playlist',
      description: 'End-to-end workflow: search for songs by mood, genre or artist and create a new YouTube Music playlist with them.',
      argsSchema: {
        theme: z.string().describe('Playlist theme or mood (e.g. "chill lo-fi", "workout", "90s rock")').optional(),
        name: z.string().describe('Name for the new playlist').optional(),
      },
    },
    async ({ theme, name }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I want to create a YouTube Music playlist${name ? ` called "${name}"` : ''}${theme ? ` with a "${theme}" theme` : ''}.

Please help me:
1. Search for songs that match the theme using search_songs
2. Collect at least 10 good matches
3. Create a new playlist with create_playlist
4. Add the songs with add_songs_to_playlist, distributing artists evenly (no consecutive same-artist tracks)

Start by searching for songs now.`,
        },
      }],
    })
  );

  server.registerPrompt(
    'discover-artist',
    {
      title: 'Discover Artist Discography',
      description: 'Explore an artist\'s top songs and albums, then optionally add favourites to a playlist.',
      argsSchema: {
        artist: z.string().describe('Artist name to explore').optional(),
      },
    },
    async ({ artist }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I want to explore${artist ? ` ${artist}'s` : ' an artist\'s'} music on YouTube Music.

Please:
1. Use search_artists to find the artist
2. Use get_artist_info to get their top songs and albums
3. For each album I'm interested in, use get_album_info to see the full tracklist
4. Ask me if I'd like to add any songs to an existing playlist or create a new one

Start by searching for the artist.`,
        },
      }],
    })
  );

  server.registerPrompt(
    'manage-playlist',
    {
      title: 'Manage Existing Playlist',
      description: 'View, reorganise or update an existing YouTube Music playlist — add songs, remove duplicates, or reorder tracks.',
      argsSchema: {
        action: z.string().describe('What to do: "view", "add songs", "remove songs", or "reorganise"').optional(),
      },
    },
    async ({ action }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I want to ${action ?? 'manage'} one of my YouTube Music playlists.

Please:
1. Use get_playlists to show all my playlists
2. Ask me which playlist I want to work with
3. Use get_playlist_details with fetch_all=true to load the full content
4. Help me ${action ?? 'view or modify the playlist'} as needed

Start by fetching my playlists.`,
        },
      }],
    })
  );

  server.registerPrompt(
    'smart-recommendations',
    {
      title: 'Get Smart Music Recommendations',
      description: 'Get AI-curated song recommendations based on mood, energy level or seed artists using Reccobeats and adaptive playlist tools.',
      argsSchema: {
        mood: z.string().describe('Desired mood or energy (e.g. "happy", "melancholic", "energetic")').optional(),
      },
    },
    async ({ mood }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I want personalised music recommendations${mood ? ` with a "${mood}" mood` : ''}.

Please:
1. Use start_playlist_conversation to begin a recommendation session
2. Use continue_conversation to gather my preferences (mood, energy, genres, artists)
3. Use get_music_recommendations from Reccobeats for seed-based suggestions
4. Use generate_adaptive_playlist to create a curated list
5. Ask if I'd like to save it as a YouTube Music playlist

Start the conversation now.`,
        },
      }],
    })
  );

  server.registerPrompt(
    'library-overview',
    {
      title: 'Browse My Music Library',
      description: 'Get an overview of your YouTube Music library — liked songs and saved playlists.',
      argsSchema: {},
    },
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Give me an overview of my YouTube Music library.

Please:
1. Use get_library_songs to fetch my liked songs (limit 20 to start)
2. Use get_playlists to list all my playlists
3. Summarise what I have and ask what I'd like to do next

Start fetching my library now.`,
        },
      }],
    })
  );
}
