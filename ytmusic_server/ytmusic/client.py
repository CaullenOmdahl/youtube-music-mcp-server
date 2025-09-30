"""
YouTube Music API client with direct OAuth credentials.
"""

import asyncio
from typing import Optional, Dict, Any, List, Union
from datetime import datetime, timedelta
import structlog
from ytmusicapi import YTMusic

# Optional Google Auth imports - graceful fallback if not available
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False
    Request = None
    Credentials = None

from ..models.config import ServerConfig
from .rate_limiter import RateLimiter

logger = structlog.get_logger(__name__)


class YTMusicError(Exception):
    """YouTube Music API error."""

    pass


class YTMusicClient:
    """
    YouTube Music API client with direct OAuth credentials.

    Features:
    - Direct OAuth 2.0 credentials (client_id, client_secret, refresh_token)
    - Automatic token refresh
    - Rate limiting
    - Comprehensive error handling
    """

    def __init__(
        self,
        config: ServerConfig,
        rate_limiter: Optional[RateLimiter] = None,
    ):
        self.config = config
        self.rate_limiter = rate_limiter or RateLimiter()
        self.logger = logger.bind(component="ytmusic_client")
        self._ytmusic_client: Optional[YTMusic] = None
        self._credentials: Optional[Credentials] = None

        # Validate configuration early to catch issues during initialization
        self._validate_config()

        self.logger.info("YouTube Music client initialized")

    def _validate_config(self) -> None:
        """Validate that required configuration is present."""
        # Check if Google Auth libraries are available
        if not GOOGLE_AUTH_AVAILABLE:
            raise YTMusicError(
                "Google Auth libraries not available. Please install: pip install google-auth google-auth-oauthlib"
            )

        # Check if credentials are configured
        if not all(
            [
                self.config.client_id,
                self.config.client_secret,
                self.config.refresh_token,
            ]
        ):
            missing = []
            if not self.config.client_id:
                missing.append("CLIENT_ID")
            if not self.config.client_secret:
                missing.append("CLIENT_SECRET")
            if not self.config.refresh_token:
                missing.append("REFRESH_TOKEN")

            raise YTMusicError(
                f"Missing OAuth credentials: {', '.join(missing)}. "
                "Please configure these in your Smithery settings."
            )

    async def get_authenticated_client(self) -> YTMusic:
        """
        Get authenticated YouTube Music client using configured credentials.

        Returns:
            Authenticated YTMusic client

        Raises:
            YTMusicError: If authentication fails
        """
        # Check if Google Auth libraries are available
        if not GOOGLE_AUTH_AVAILABLE:
            raise YTMusicError(
                "Google Auth libraries not available. Please install: pip install google-auth google-auth-oauthlib"
            )

        # Check if credentials are configured
        if not all(
            [
                self.config.client_id,
                self.config.client_secret,
                self.config.refresh_token,
            ]
        ):
            missing = []
            if not self.config.client_id:
                missing.append("CLIENT_ID")
            if not self.config.client_secret:
                missing.append("CLIENT_SECRET")
            if not self.config.refresh_token:
                missing.append("REFRESH_TOKEN")

            raise YTMusicError(
                f"Missing OAuth credentials: {', '.join(missing)}. "
                "Please configure these in your Smithery settings."
            )

        try:
            if self._ytmusic_client is None:
                # Create credentials from user-provided OAuth data
                credentials = Credentials(
                    token=None,  # Will be refreshed
                    refresh_token=self.config.refresh_token,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=self.config.client_id,
                    client_secret=self.config.client_secret,
                    scopes=[
                        "https://www.googleapis.com/auth/youtube.readonly",
                        "https://www.googleapis.com/auth/youtubepartner",
                    ],
                )

                # Refresh the token to get a valid access token
                credentials.refresh(Request())
                self._credentials = credentials

                # Create YTMusic client with the access token
                self._ytmusic_client = YTMusic(auth=credentials.token)

                self.logger.info("YouTube Music client authenticated successfully")

            # Check if token needs refresh
            elif self._credentials and self._credentials.expired:
                self.logger.info("Access token expired, refreshing...")
                self._credentials.refresh(Request())
                # Create new client with refreshed token
                self._ytmusic_client = YTMusic(auth=self._credentials.token)
                self.logger.info("YouTube Music client token refreshed")

            return self._ytmusic_client

        except Exception as e:
            self.logger.error(
                "Failed to create authenticated YTMusic client", error=str(e)
            )
            raise YTMusicError(f"Authentication failed: {e}")

    async def search_music(
        self,
        query: str,
        filter_type: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Search for music on YouTube Music.

        Args:
            query: Search query
            filter_type: Optional filter (songs, videos, albums, artists, playlists)
            limit: Maximum results to return

        Returns:
            List of search results

        Raises:
            YTMusicError: If search fails
        """
        try:
            client = await self.get_authenticated_client()
            await self.rate_limiter.wait_if_needed("globalglobal")

            self.logger.debug(
                "Searching YouTube Music",
                query=query[:50] + "..." if len(query) > 50 else query,
                filter_type=filter_type,
                limit=limit,
            )

            results = client.search(query, filter=filter_type, limit=limit)

            self.logger.info(
                "YouTube Music search completed",
                query=query[:50] + "..." if len(query) > 50 else query,
                result_count=len(results),
            )

            return results

        except Exception as e:
            self.logger.error("Search failed", query=query, error=str(e))
            raise YTMusicError(f"Search failed: {e}")

    async def get_user_playlists(self, limit: int = 25) -> List[Dict[str, Any]]:
        """
        Get user's playlists.

        Args:
            limit: Maximum playlists to return

        Returns:
            List of playlists

        Raises:
            YTMusicError: If request fails
        """
        try:
            client = await self.get_authenticated_client()
            await self.rate_limiter.wait_if_needed("global")

            self.logger.debug("Getting user playlists", limit=limit)

            playlists = client.get_library_playlists(limit)

            self.logger.info("Retrieved user playlists", playlist_count=len(playlists))

            return playlists

        except Exception as e:
            self.logger.error("Get playlists failed", error=str(e))
            raise YTMusicError(f"Get playlists failed: {e}")

    async def create_playlist(
        self,
        name: str,
        description: str = "",
        privacy_status: str = "PRIVATE",
    ) -> Dict[str, Any]:
        """
        Create a new playlist.

        Args:
            name: Playlist name
            description: Playlist description
            privacy_status: PRIVATE, PUBLIC, or UNLISTED

        Returns:
            Created playlist information

        Raises:
            YTMusicError: If creation fails
        """
        try:
            client = await self.get_authenticated_client()
            await self.rate_limiter.wait_if_needed("global")

            self.logger.debug(
                "Creating playlist", name=name, privacy_status=privacy_status
            )

            playlist_id = client.create_playlist(
                title=name, description=description, privacy_status=privacy_status
            )

            result = {
                "playlist_id": playlist_id,
                "name": name,
                "description": description,
                "privacy_status": privacy_status,
                "created_at": datetime.utcnow().isoformat(),
            }

            self.logger.info(
                "Playlist created successfully", playlist_id=playlist_id, name=name
            )

            return result

        except Exception as e:
            self.logger.error("Create playlist failed", name=name, error=str(e))
            raise YTMusicError(f"Create playlist failed: {e}")

    async def add_songs_to_playlist(
        self,
        playlist_id: str,
        video_ids: List[str],
    ) -> Dict[str, Any]:
        """
        Add songs to an existing playlist.

        Args:
            playlist_id: Target playlist ID
            video_ids: List of video IDs to add

        Returns:
            Addition result information

        Raises:
            YTMusicError: If addition fails
        """
        try:
            client = await self.get_authenticated_client()
            await self.rate_limiter.wait_if_needed("global")

            self.logger.debug(
                "Adding songs to playlist",
                playlist_id=playlist_id,
                song_count=len(video_ids),
            )

            # Add songs to playlist
            result = client.add_playlist_items(playlist_id, video_ids)

            self.logger.info(
                "Songs added to playlist successfully",
                playlist_id=playlist_id,
                song_count=len(video_ids),
            )

            return {
                "playlist_id": playlist_id,
                "added_count": len(video_ids),
                "video_ids": video_ids,
                "result": result,
                "added_at": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            self.logger.error(
                "Add songs to playlist failed", playlist_id=playlist_id, error=str(e)
            )
            raise YTMusicError(f"Add songs to playlist failed: {e}")

    async def get_playlist_details(
        self,
        playlist_id: str,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Get detailed playlist information including tracks.

        Args:
            playlist_id: Playlist ID
            limit: Limit for tracks

        Returns:
            Detailed playlist information

        Raises:
            YTMusicError: If request fails
        """
        try:
            client = await self.get_authenticated_client()
            await self.rate_limiter.wait_if_needed("global")

            self.logger.debug("Getting playlist details", playlist_id=playlist_id)

            playlist = client.get_playlist(playlist_id, limit)

            self.logger.info(
                "Retrieved playlist details",
                playlist_id=playlist_id,
                track_count=len(playlist.get("tracks", [])),
            )

            return playlist

        except Exception as e:
            self.logger.error(
                "Get playlist details failed", playlist_id=playlist_id, error=str(e)
            )
            raise YTMusicError(f"Get playlist details failed: {e}")

    async def get_client_stats(self) -> Dict[str, Any]:
        """
        Get client statistics and health information.

        Returns:
            Client statistics
        """
        return {
            "authenticated": self._ytmusic_client is not None,
            "credentials_valid": self._credentials is not None
            and not self._credentials.expired
            if self._credentials
            else False,
            "client_id": self.config.client_id[:10] + "..."
            if self.config.client_id
            else None,
            "rate_limiter_stats": await self.rate_limiter.get_stats(),
        }
