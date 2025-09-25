"""
YouTube Music MCP Server with Cookie Authentication
Deployable on Smithery with per-session configuration
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

    youtube_music_cookies: str = Field(
        default="",
        description="Your YouTube Music cookies from the browser. Get them from music.youtube.com -> F12 -> Application -> Cookies -> Copy all cookies as a single string"
    )

    default_privacy: str = Field(
        default="PRIVATE",
        description="Default privacy for new playlists: PRIVATE, PUBLIC, or UNLISTED"
    )


class YouTubeMusicAPI:
    """Wrapper for YouTube Music API with cookie-based auth"""

    def __init__(self, cookie_string: str):
        """Initialize with cookie string"""
        self.cookie_string = cookie_string
        self.ytmusic = None
        self.authenticated = False

    def setup_from_cookies(self) -> bool:
        """Setup authentication from cookie string"""
        try:
            # Extract required values from cookies
            cookies_dict = {}
            for cookie in self.cookie_string.split('; '):
                if '=' in cookie:
                    key, value = cookie.split('=', 1)
                    cookies_dict[key] = value

            # Check for required cookies
            if 'SAPISID' not in cookies_dict:
                logger.error("Missing SAPISID cookie required for authentication")
                return False

            # Generate authorization header
            sapisid = cookies_dict['SAPISID']
            timestamp = str(int(time.time()))
            origin = "https://music.youtube.com"
            hash_input = f"{timestamp} {sapisid} {origin}"
            hash_output = hashlib.sha1(hash_input.encode()).hexdigest()
            auth = f"SAPISIDHASH {timestamp}_{hash_output}"

            # Generate visitor ID
            visitor_id = ""
            if 'VISITOR_INFO1_LIVE' in cookies_dict:
                visitor_data = f"Cgt{cookies_dict['VISITOR_INFO1_LIVE']}".encode()
                visitor_id = base64.b64encode(visitor_data).decode()

            # Construct headers
            headers_raw = f"""accept: */*
accept-language: en-US,en;q=0.9
authorization: {auth}
content-type: application/json
cookie: {self.cookie_string}
origin: https://music.youtube.com
referer: https://music.youtube.com/
user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
x-goog-authuser: 0
x-goog-visitor-id: {visitor_id}
x-origin: https://music.youtube.com"""

            # Setup ytmusicapi
            auth_dict = setup(headers_raw=headers_raw)

            # Initialize YTMusic with auth
            self.ytmusic = YTMusic(auth_dict)
            self.authenticated = True
            logger.info("Successfully authenticated with YouTube Music")
            return True

        except Exception as e:
            logger.error(f"Authentication failed: {e}")
            # Fall back to unauthenticated mode for search
            self.ytmusic = YTMusic()
            self.authenticated = False
            return False


@smithery.server(config_schema=ConfigSchema)
def create_server():
    """Create and configure the YouTube Music MCP server"""

    server = FastMCP(
        name="YouTube Music"
    )

    # Store YTMusic instances per session
    ytmusic_sessions: Dict[str, YouTubeMusicAPI] = {}

    def get_ytmusic(ctx: Context) -> Optional[YouTubeMusicAPI]:
        """Get or create YTMusic instance for this session"""
        session_id = id(ctx.session_config) if ctx and ctx.session_config else "default"

        if session_id not in ytmusic_sessions:
            # Check if cookies are provided
            cookies = ctx.session_config.youtube_music_cookies if ctx and ctx.session_config else ""

            if not cookies:
                # Return None to indicate no cookies configured
                return None

            # Create new instance with session's cookies
            yt = YouTubeMusicAPI(cookies)
            yt.setup_from_cookies()
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
        Search YouTube Music for songs, artists, albums, or playlists.

        Args:
            query: Search query
            filter: Optional filter - 'songs', 'videos', 'albums', 'artists', 'playlists', 'uploads'
            limit: Maximum results to return (default 20)

        Returns:
            Search results from YouTube Music
        """
        yt = get_ytmusic(ctx)
        if not yt:
            return {
                "success": False,
                "error": "YouTube Music cookies not configured",
                "message": "Please configure your YouTube Music cookies in the server settings"
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
                "error": "YouTube Music cookies not configured",
                "message": "Please configure your YouTube Music cookies in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music cookies in the configuration"
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
                "error": "YouTube Music cookies not configured",
                "message": "Please configure your YouTube Music cookies in the server settings"
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
        Create a new playlist in your YouTube Music library.

        Args:
            title: Name of the playlist
            description: Optional description
            privacy: Privacy setting - PRIVATE, PUBLIC, or UNLISTED (uses default from config if not specified)

        Returns:
            The ID of the created playlist
        """
        yt = get_ytmusic(ctx)
        if not yt:
            return {
                "success": False,
                "error": "YouTube Music cookies not configured",
                "message": "Please configure your YouTube Music cookies in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music cookies in the configuration"
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
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to create playlist '{title}'"
            }

    @server.tool()
    def add_songs_to_playlist(
        playlist_id: str,
        video_ids: List[str],
        ctx: Context = None
    ) -> Dict[str, Any]:
        """
        Add songs to an existing playlist.

        Args:
            playlist_id: The playlist ID to add songs to
            video_ids: List of YouTube video IDs to add

        Returns:
            Status of the operation
        """
        yt = get_ytmusic(ctx)
        if not yt:
            return {
                "success": False,
                "error": "YouTube Music cookies not configured",
                "message": "Please configure your YouTube Music cookies in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music cookies in the configuration"
            }

        try:
            result = yt.ytmusic.add_playlist_items(playlist_id, video_ids)
            return {
                "success": True,
                "message": f"Added {len(video_ids)} songs to playlist",
                "result": result
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
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
                "error": "YouTube Music cookies not configured",
                "message": "Please configure your YouTube Music cookies in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music cookies in the configuration"
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
                "error": "YouTube Music cookies not configured",
                "message": "Please configure your YouTube Music cookies in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music cookies in the configuration"
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
                "error": "YouTube Music cookies not configured",
                "message": "Please configure your YouTube Music cookies in the server settings"
            }

        if not yt.authenticated:
            return {
                "success": False,
                "error": "Authentication required",
                "message": "Please provide YouTube Music cookies in the configuration"
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
                "message": "YouTube Music cookies not configured. Please add cookies in server settings."
            }

        return {
            "authenticated": yt.authenticated,
            "capabilities": {
                "search": True,  # Always available
                "playlist_management": yt.authenticated,
                "library_access": yt.authenticated
            },
            "message": "Authenticated and ready!" if yt.authenticated else "Limited to search only. Add cookies for full access."
        }

    return server
