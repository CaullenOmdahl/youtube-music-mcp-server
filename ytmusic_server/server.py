"""
YouTube Music MCP Server with Header-Based Authentication
Deployable on Smithery with per-session configuration

IMPORTANT INSTRUCTIONS FOR ASSISTANTS:
=======================================

This MCP server provides TOOLS, not intelligence. You (the assistant) must handle all the thinking and decision-making.

CORE PRINCIPLE:
- The server executes specific commands (search for "Song X", create playlist "Y", add video IDs)
- You interpret user requests and decide what specific actions to take
- You research/determine what songs to search for based on descriptions

WORKFLOW FOR PLAYLIST CREATION:
1. User request: "Create a playlist of 90s rock hits"
2. You decide: What specific 90s rock songs to include
3. You execute:
   - create_playlist() to make the playlist
   - search_music() for each specific song (e.g., "Smells Like Teen Spirit Nirvana")
   - add_songs_to_playlist() with the collected video IDs

DO:
- Search for SPECIFIC songs by name and artist
- Break down complex requests into individual searches
- Handle curation and song selection yourself
- Use video IDs immediately after searching (they can become stale)
- If batch adding fails, try smaller batches or individual songs

DON'T:
- Don't pass descriptions to search (NOT "upbeat music" or "90s hits")
- Don't expect the server to understand genres, moods, or decades
- Don't pass long descriptions to any tool
- Don't expect the server to make musical decisions

SEARCH EXAMPLES:
✅ GOOD: search_music("Bohemian Rhapsody Queen")
✅ GOOD: search_music("Shape of You Ed Sheeran")
❌ BAD: search_music("popular songs from 2020")
❌ BAD: search_music("workout music")

ERROR HANDLING:
- "YouTube Music headers not configured" → Guide user through header setup
- "401 Unauthorized" → Headers have expired, user needs to refresh them
- "400 Precondition check failed" → Video IDs are invalid/stale, search for fresh ones
- No search results → Try alternative search terms (without featured artists, etc.)
"""

from pydantic import BaseModel, Field
from mcp.server.fastmcp import Context, FastMCP
from smithery.decorators import smithery
from ytmusicapi import YTMusic, setup
import json
import hashlib
import time
import base64
from typing import Optional, List, Dict, Any
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ConfigSchema(BaseModel):
    """Configuration schema for YouTube Music authentication"""

    youtube_music_headers: str = Field(
        default="",
        description="Full request headers from music.youtube.com browser session. Go to music.youtube.com -> F12 -> Network tab -> Find any POST request to music.youtube.com -> Right-click -> Copy -> Copy request headers"
    )

    default_privacy: str = Field(
        default="PRIVATE",
        description="Default privacy for new playlists: PRIVATE, PUBLIC, or UNLISTED"
    )


class YouTubeMusicAPI:
    """Wrapper for YouTube Music API with header-based auth"""

    def __init__(self, headers_raw: str):
        """Initialize with raw headers string"""
        self.headers_raw = headers_raw
        self.ytmusic = None
        self.authenticated = False

    def setup_from_headers(self) -> bool:
        """Setup authentication from raw headers string"""
        try:
            if not self.headers_raw.strip():
                logger.error("No headers provided")
                return False

            # Validate headers contain required elements
            headers_lower = self.headers_raw.lower()
            if 'cookie:' not in headers_lower:
                logger.error("Headers missing cookie information")
                return False

            # Check for common header format indicators
            if not any(h in headers_lower for h in ['accept:', 'user-agent:', 'referer:']):
                logger.error("Headers don't appear to be in the correct format. Make sure to copy the full request headers.")
                return False

            if 'music.youtube.com' not in self.headers_raw:
                logger.warning("Headers don't appear to be from music.youtube.com")

            # Setup ytmusicapi using the provided headers directly
            auth_dict = setup(headers_raw=self.headers_raw)

            # Initialize YTMusic with auth
            self.ytmusic = YTMusic(auth_dict)
            self.authenticated = True
            logger.info("Successfully authenticated with YouTube Music using provided headers")
            return True

        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            # Fall back to unauthenticated mode for search
            self.ytmusic = YTMusic()
            self.authenticated = False
            return False


@smithery.server(config_schema=ConfigSchema)
def create_server():
    """
    YouTube Music MCP Server - Simple tools for YouTube Music operations.
    Uses header-based authentication from browser request headers.

    IMPORTANT: This server provides tools, not intelligence. The assistant must:
    - Interpret user requests (e.g., "90s rock playlist")
    - Decide what specific songs to search for
    - Execute the tools in sequence (create → search → add)

    See module docstring for detailed usage instructions.
    """

    server = FastMCP(
        name="YouTube Music"
    )

    # Store YTMusic instances per session
    ytmusic_sessions: Dict[str, YouTubeMusicAPI] = {}

    def get_ytmusic(ctx: Context) -> Optional[YouTubeMusicAPI]:
        """Get or create YTMusic instance for this session"""
        session_id = id(ctx.session_config) if ctx and ctx.session_config else "default"

        if session_id not in ytmusic_sessions:
            # Check if headers are provided
            headers = ctx.session_config.youtube_music_headers if ctx and ctx.session_config else ""

            if not headers:
                # Return None to indicate no headers configured
                return None

            # Create new instance with session's headers
            yt = YouTubeMusicAPI(headers)
            yt.setup_from_headers()
            ytmusic_sessions[session_id] = yt

        return ytmusic_sessions[session_id]

    # === SEARCH TOOL (Works without auth) ===

    @server.tool()
    def search_music(
        query: str,
        filter: Optional[str] = None,
        limit: int = 20,
        ctx: Context = None
    ) -> Dict[str, Any]:
        """
        Search YouTube Music for SPECIFIC songs, artists, albums, or playlists.

        IMPORTANT: Search for exact names, not descriptions or genres.
        Examples:
        - ✅ "Blinding Lights The Weeknd"
        - ✅ "Abbey Road Beatles album"
        - ❌ "popular songs"
        - ❌ "workout music"

        Args:
            query: Specific song/artist/album name to search for
            filter: Optional filter - 'songs', 'videos', 'albums', 'artists', 'playlists', 'uploads'
            limit: Maximum results to return (default 20)

        Returns:
            Search results with videoId for each result (use these IDs with add_songs_to_playlist)
        """
        yt = get_ytmusic(ctx)
        if not yt:
            return {
                "success": False,
                "error": "YouTube Music headers not configured",
                "message": "Please configure your YouTube Music headers in the server settings"
            }

        try:
            results = yt.ytmusic.search(query, filter=filter, limit=limit)
            return {
                "success": True,
                "count": len(results),
                "results": results
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Search failed. Check your query and try again."
            }

    # === PLAYLIST MANAGEMENT TOOLS (Require auth) ===

    @server.tool()
    def get_library_playlists(ctx: Context) -> Dict[str, Any]:
        """
        Get all playlists from your YouTube Music library.

        Returns:
            List of your playlists with IDs and metadata
        """
        yt = get_ytmusic(ctx)
        if not yt:
            return {
                "success": False,
                "error": "YouTube Music headers not configured",
                "message": "Please configure your YouTube Music headers in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music headers in the configuration"
            }

        try:
            playlists = yt.ytmusic.get_library_playlists()
            return {
                "success": True,
                "count": len(playlists),
                "playlists": playlists
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to get playlists. Check your authentication."
            }

    @server.tool()
    def get_playlist(playlist_id: str, ctx: Context) -> Dict[str, Any]:
        """
        Get detailed information about a specific playlist.

        Args:
            playlist_id: The YouTube Music playlist ID

        Returns:
            Detailed playlist information including all tracks
        """
        yt = get_ytmusic(ctx)
        if not yt:
            return {
                "success": False,
                "error": "YouTube Music headers not configured",
                "message": "Please configure your YouTube Music headers in the server settings"
            }

        try:
            playlist = yt.ytmusic.get_playlist(playlist_id)
            return {
                "success": True,
                "playlist": playlist
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to get playlist {playlist_id}"
            }

    @server.tool()
    def create_playlist(
        title: str,
        description: str = "",
        privacy: Optional[str] = None,
        ctx: Context = None
    ) -> Dict[str, Any]:
        """
        Create a new empty playlist in your YouTube Music library.

        NOTE: This creates an EMPTY playlist. You must:
        1. Create the playlist first (returns playlist_id)
        2. Search for specific songs to add
        3. Use add_songs_to_playlist() with the video IDs

        Args:
            title: Name of the playlist
            description: Optional description (brief text, not a list of songs)
            privacy: Privacy setting - PRIVATE, PUBLIC, or UNLISTED (uses default from config if not specified)

        Returns:
            The playlist_id to use with add_songs_to_playlist()
        """
        yt = get_ytmusic(ctx)
        if not yt:
            return {
                "success": False,
                "error": "YouTube Music headers not configured",
                "message": "Please configure your YouTube Music headers in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music headers in the configuration"
            }

        # Use privacy from params or fall back to config default
        privacy = privacy or ctx.session_config.default_privacy

        try:
            playlist_id = yt.ytmusic.create_playlist(
                title=title,
                description=description,
                privacy_status=privacy
            )
            return {
                "success": True,
                "playlist_id": playlist_id,
                "message": f"Created playlist '{title}' with ID: {playlist_id}"
            }
        except Exception as e:
            error_str = str(e)
            if "401" in error_str or "Unauthorized" in error_str:
                return {
                    "success": False,
                    "error": error_str,
                    "message": "Authentication expired. Please refresh your YouTube Music headers from music.youtube.com"
                }
            else:
                return {
                    "success": False,
                    "error": error_str,
                    "message": f"Failed to create playlist '{title}'"
                }

    @server.tool()
    def add_songs_to_playlist(
        playlist_id: str,
        video_ids: List[str],
        ctx: Context = None
    ) -> Dict[str, Any]:
        """
        Add specific songs to an existing playlist using their video IDs.

        WORKFLOW:
        1. Get video IDs from search_music() results
        2. Collect all IDs you want to add
        3. Call this once with all IDs (more efficient than multiple calls)

        Args:
            playlist_id: The playlist ID from create_playlist()
            video_ids: List of video IDs from search_music() results

        Returns:
            Status of the operation
        """
        yt = get_ytmusic(ctx)
        if not yt:
            return {
                "success": False,
                "error": "YouTube Music headers not configured",
                "message": "Please configure your YouTube Music headers in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music headers in the configuration"
            }

        try:
            result = yt.ytmusic.add_playlist_items(playlist_id, video_ids)
            return {
                "success": True,
                "message": f"Added {len(video_ids)} songs to playlist",
                "result": result
            }
        except Exception as e:
            error_str = str(e)

            # Provide helpful error messages for common failures
            if "401" in error_str or "Unauthorized" in error_str:
                return {
                    "success": False,
                    "error": error_str,
                    "message": "Authentication expired. Please refresh your YouTube Music headers."
                }
            elif "400" in error_str or "Precondition" in error_str:
                return {
                    "success": False,
                    "error": error_str,
                    "message": "Some video IDs may be invalid or outdated. Try searching for fresh IDs or adding songs individually."
                }
            elif "403" in error_str:
                return {
                    "success": False,
                    "error": error_str,
                    "message": "Permission denied. You may not have access to modify this playlist."
                }
            else:
                return {
                    "success": False,
                    "error": error_str,
                    "message": f"Failed to add songs to playlist {playlist_id}"
                }

    @server.tool()
    def remove_songs_from_playlist(
        playlist_id: str,
        videos: List[Dict[str, str]],
        ctx: Context = None
    ) -> Dict[str, Any]:
        """
        Remove songs from a playlist.

        Args:
            playlist_id: The playlist ID
            videos: List of video objects with videoId and setVideoId

        Returns:
            Status of the operation
        """
        yt = get_ytmusic(ctx)
        if not yt:
            return {
                "success": False,
                "error": "YouTube Music headers not configured",
                "message": "Please configure your YouTube Music headers in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music headers in the configuration"
            }

        try:
            result = yt.ytmusic.remove_playlist_items(playlist_id, videos)
            return {
                "success": True,
                "message": f"Removed {len(videos)} songs from playlist",
                "result": result
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to remove songs from playlist {playlist_id}"
            }

    @server.tool()
    def delete_playlist(playlist_id: str, ctx: Context = None) -> Dict[str, Any]:
        """
        Delete a playlist from your library.

        Args:
            playlist_id: The playlist ID to delete

        Returns:
            Status of the deletion
        """
        yt = get_ytmusic(ctx)
        if not yt:
            return {
                "success": False,
                "error": "YouTube Music headers not configured",
                "message": "Please configure your YouTube Music headers in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music headers in the configuration"
            }

        try:
            result = yt.ytmusic.delete_playlist(playlist_id)
            return {
                "success": True,
                "message": f"Deleted playlist {playlist_id}",
                "result": result
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to delete playlist {playlist_id}"
            }

    @server.tool()
    def edit_playlist(
        playlist_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        privacy: Optional[str] = None,
        ctx: Context = None
    ) -> Dict[str, Any]:
        """
        Edit playlist title, description, or privacy settings.

        Args:
            playlist_id: The playlist ID to edit
            title: New title (optional)
            description: New description (optional)
            privacy: New privacy setting - PRIVATE, PUBLIC, or UNLISTED (optional)

        Returns:
            Status of the edit operation
        """
        yt = get_ytmusic(ctx)
        if not yt:
            return {
                "success": False,
                "error": "YouTube Music headers not configured",
                "message": "Please configure your YouTube Music headers in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music headers in the configuration"
            }

        try:
            result = yt.ytmusic.edit_playlist(
                playlist_id,
                title=title,
                description=description,
                privacyStatus=privacy
            )
            return {
                "success": True,
                "message": "Playlist updated successfully",
                "result": result
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to edit playlist {playlist_id}"
            }

    # Note: Removed create_smart_playlist function
    # The AI assistant should use the search and playlist management tools directly
    # to build playlists based on user descriptions

    @server.tool()
    def get_auth_status(ctx: Context) -> Dict[str, Any]:
        """
        Check authentication status and capabilities.

        Returns:
            Current authentication status and available features
        """
        yt = get_ytmusic(ctx)

        if not yt:
            return {
                "authenticated": False,
                "capabilities": {
                    "search": False,
                    "playlist_management": False,
                    "library_access": False
                },
                "message": "YouTube Music headers not configured. Please add headers in server settings."
            }

        return {
            "authenticated": yt.authenticated,
            "capabilities": {
                "search": True,  # Always available
                "playlist_management": yt.authenticated,
                "library_access": yt.authenticated
            },
            "message": "Authenticated and ready!" if yt.authenticated else "Limited to search only. Add headers for full access."
        }

    return server


# Create the server instance for uvicorn
app = create_server()
