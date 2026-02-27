import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const INSTRUCTIONS_URI = 'ytmusic://instructions';

const INSTRUCTIONS = `Music MCP Instructions:

URL FORMAT (crítico - nunca usar youtube.com normal):
- Songs: https://music.youtube.com/watch?v={videoId}
- Playlists: https://music.youtube.com/playlist?list={playlistId}

LIBRARY CACHE:
- Después de fetchear liked songs una vez, tratar como cacheado. No volver a llamar get_library_songs en la misma sesión a menos que el usuario lo pida explícitamente.
- Lo mismo para get_playlists: fetchear una vez, reutilizar.

ABRIR LINKS (CRÍTICO):
- SIEMPRE usar el tool "open_url" para abrir cualquier URL de YouTube Music.
- NUNCA usar navigate, mcp__claude-in-chrome__navigate, ni ningún otro tool de Chrome.
- open_url es el único tool correcto para abrir links. No hay excepciones.

SELECCIÓN DE CANCIONES:
- Default: seleccionar de liked songs a menos que el usuario especifique playlist.
- No preguntar qué poner. Elegir basándose en mood/contexto y abrir directo con open_url.
- "Random" = elegir un índice aleatorio de la lista cacheada y abrir directo.

PLAYLISTS CONOCIDAS (no necesitas fetchear para estas):
- "Selección del Claude 🤖" → PLEc9dOmgYl-XiZQ6FzyLQvHI8GQP6cq80

OPERACIONES DE PLAYLIST:
- Agregar canción: add_songs_to_playlist(playlist_id, [videoId])
- Eliminar canción: necesitas setVideoId (NO videoId) → primero get_playlist_details() para obtenerlo, luego remove_songs_from_playlist(playlist_id, [setVideoId])
- Abrir playlist completa: construir URL y abrir, no necesitas fetchear los tracks.

WORKFLOW EFICIENTE:
- "Pon algo random" → si biblioteca en cache: elige y abre (1 step). Si no: fetch → elige → abre (2 steps).
- "Agrega a playlist" → si tienes videoId y playlistId: add directo sin fetches extra.
- "Abre playlist X" → construir URL y abrir, sin fetchear tracks.`;

/**
 * Register static resources exposed to the LLM on every connection.
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    'ytmusic-instructions',
    INSTRUCTIONS_URI,
    {
      description: 'Usage guidelines and efficiency tips for the YouTube Music MCP server. Read this before using any tool.',
      mimeType: 'text/plain',
    },
    async () => ({
      contents: [{
        uri: INSTRUCTIONS_URI,
        text: INSTRUCTIONS,
        mimeType: 'text/plain',
      }],
    })
  );
}
