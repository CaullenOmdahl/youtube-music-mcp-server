"""
YouTube Music API client with OAuth integration and rate limiting.
"""

import asyncio
from typing import Optional, Dict, Any, List, Union
from datetime import datetime, timedelta
import structlog
from ytmusicapi import YTMusic

from ..models.auth import OAuthToken, UserSession
from ..models.config import APIConfig
from .rate_limiter import RateLimiter

logger = structlog.get_logger(__name__)


class YTMusicError(Exception):
    """YouTube Music API error."""
    pass


class YTMusicClient:
    """
    YouTube Music API client with OAuth integration and comprehensive error handling.

    Features:
    - OAuth 2.1 token-based authentication
    - Rate limiting per session
    - Automatic retry with exponential backoff
    - Comprehensive error handling
    - Request logging and monitoring
    """

    def __init__(
        self,
        api_config: APIConfig,
        rate_limiter: Optional[RateLimiter] = None,
    ):
        self.config = api_config
        self.rate_limiter = rate_limiter or RateLimiter()
        self.logger = logger.bind(component="ytmusic_client")
        self._clients: Dict[str, YTMusic] = {}

        self.logger.info("YouTube Music client initialized")

    async def get_authenticated_client(
        self,
        session: UserSession,
        oauth_token: OAuthToken,
    ) -> YTMusic:
        """
        Get authenticated YouTube Music client for session.

        Args:
            session: User session
            oauth_token: OAuth token for authentication

        Returns:
            Authenticated YTMusic client

        Raises:
            YTMusicError: If authentication fails
        """
        try:
            # Check if we have a cached client
            client_key = f"{session.session_id}_{oauth_token.access_token[:8]}"
            if client_key in self._clients:
                self.logger.debug(
                    "Using cached YTMusic client",
                    session_id=session.session_id[:8] + "...",
                )
                return self._clients[client_key]

            # Check rate limits
            if not await self.rate_limiter.check_rate_limit(session.session_id):
                raise YTMusicError("Rate limit exceeded for session")

            # Create authenticated client
            auth_headers = {
                "Authorization": f"Bearer {oauth_token.access_token}",
                "X-Origin": "https://music.youtube.com",
            }

            # Initialize YTMusic with OAuth headers
            ytmusic = YTMusic(auth=auth_headers, language="en")

            # Cache the client
            self._clients[client_key] = ytmusic

            self.logger.info(
                "Created authenticated YTMusic client",
                session_id=session.session_id[:8] + "...",
                token_expires_in=oauth_token.expires_in,
            )

            return ytmusic

        except Exception as e:
            self.logger.error(
                "Failed to create authenticated YTMusic client",
                session_id=session.session_id[:8] + "...",
                error=str(e),
            )
            raise YTMusicError(f"Authentication failed: {e}")

    async def search_music(
        self,
        session: UserSession,
        oauth_token: OAuthToken,
        query: str,
        filter_type: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Search for music on YouTube Music.

        Args:
            session: User session
            oauth_token: OAuth token
            query: Search query
            filter_type: Optional filter (songs, videos, albums, artists, playlists)
            limit: Maximum results to return

        Returns:
            List of search results

        Raises:
            YTMusicError: If search fails
        """
        try:
            client = await self.get_authenticated_client(session, oauth_token)

            # Apply rate limiting
            await self.rate_limiter.wait_if_needed(session.session_id)

            self.logger.debug(
                "Searching YouTube Music",
                session_id=session.session_id[:8] + "...",
                query=query[:50] + "..." if len(query) > 50 else query,
                filter_type=filter_type,
                limit=limit,
            )

            # Perform search
            results = client.search(query, filter=filter_type, limit=limit)

            self.logger.info(
                "YouTube Music search completed",
                session_id=session.session_id[:8] + "...",
                query=query[:50] + "..." if len(query) > 50 else query,
                result_count=len(results),
            )

            return results

        except Exception as e:
            self.logger.error(
                "YouTube Music search failed",
                session_id=session.session_id[:8] + "...",
                query=query[:50] + "..." if len(query) > 50 else query,
                error=str(e),
            )
            raise YTMusicError(f"Search failed: {e}")

    async def get_user_playlists(
        self,
        session: UserSession,
        oauth_token: OAuthToken,
        limit: int = 25,
    ) -> List[Dict[str, Any]]:
        """
        Get user's playlists from YouTube Music.

        Args:
            session: User session
            oauth_token: OAuth token
            limit: Maximum playlists to return

        Returns:
            List of user playlists

        Raises:
            YTMusicError: If operation fails
        """
        try:
            client = await self.get_authenticated_client(session, oauth_token)

            # Apply rate limiting
            await self.rate_limiter.wait_if_needed(session.session_id)

            self.logger.debug(
                "Getting user playlists",
                session_id=session.session_id[:8] + "...",
                limit=limit,
            )

            # Get playlists
            playlists = client.get_library_playlists(limit=limit)

            self.logger.info(
                "Retrieved user playlists",
                session_id=session.session_id[:8] + "...",
                playlist_count=len(playlists),
            )

            return playlists

        except Exception as e:
            self.logger.error(
                "Failed to get user playlists",
                session_id=session.session_id[:8] + "...",
                error=str(e),
            )
            raise YTMusicError(f"Failed to get playlists: {e}")

    async def create_playlist(
        self,
        session: UserSession,
        oauth_token: OAuthToken,
        title: str,
        description: Optional[str] = None,
        privacy_status: str = "PRIVATE",
        video_ids: Optional[List[str]] = None,
    ) -> str:
        """
        Create a new playlist on YouTube Music.

        Args:
            session: User session
            oauth_token: OAuth token
            title: Playlist title
            description: Optional playlist description
            privacy_status: Playlist privacy (PRIVATE, PUBLIC, UNLISTED)
            video_ids: Optional list of video IDs to add

        Returns:
            Created playlist ID

        Raises:
            YTMusicError: If creation fails
        """
        try:
            client = await self.get_authenticated_client(session, oauth_token)

            # Apply rate limiting
            await self.rate_limiter.wait_if_needed(session.session_id)

            self.logger.debug(
                "Creating playlist",
                session_id=session.session_id[:8] + "...",
                title=title,
                privacy_status=privacy_status,
                initial_videos=len(video_ids) if video_ids else 0,
            )

            # Create playlist
            playlist_id = client.create_playlist(
                title=title,
                description=description,
                privacy_status=privacy_status,
                video_ids=video_ids,
            )

            self.logger.info(
                "Created playlist",
                session_id=session.session_id[:8] + "...",
                playlist_id=playlist_id,
                title=title,
            )

            return playlist_id

        except Exception as e:
            self.logger.error(
                "Failed to create playlist",
                session_id=session.session_id[:8] + "...",
                title=title,
                error=str(e),
            )
            raise YTMusicError(f"Failed to create playlist: {e}")

    async def add_songs_to_playlist(
        self,
        session: UserSession,
        oauth_token: OAuthToken,
        playlist_id: str,
        video_ids: List[str],
    ) -> bool:
        """
        Add songs to an existing playlist.

        Args:
            session: User session
            oauth_token: OAuth token
            playlist_id: Target playlist ID
            video_ids: List of video IDs to add

        Returns:
            True if successful

        Raises:
            YTMusicError: If operation fails
        """
        try:
            client = await self.get_authenticated_client(session, oauth_token)

            # Apply rate limiting
            await self.rate_limiter.wait_if_needed(session.session_id)

            self.logger.debug(
                "Adding songs to playlist",
                session_id=session.session_id[:8] + "...",
                playlist_id=playlist_id,
                video_count=len(video_ids),
            )

            # Add songs to playlist
            status = client.add_playlist_items(playlist_id, video_ids)

            self.logger.info(
                "Added songs to playlist",
                session_id=session.session_id[:8] + "...",
                playlist_id=playlist_id,
                added_count=len(video_ids),
                status=status,
            )

            return True

        except Exception as e:
            self.logger.error(
                "Failed to add songs to playlist",
                session_id=session.session_id[:8] + "...",
                playlist_id=playlist_id,
                error=str(e),
            )
            raise YTMusicError(f"Failed to add songs to playlist: {e}")

    async def get_playlist_details(
        self,
        session: UserSession,
        oauth_token: OAuthToken,
        playlist_id: str,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Get detailed information about a playlist.

        Args:
            session: User session
            oauth_token: OAuth token
            playlist_id: Playlist ID
            limit: Optional limit for tracks

        Returns:
            Playlist details including tracks

        Raises:
            YTMusicError: If operation fails
        """
        try:
            client = await self.get_authenticated_client(session, oauth_token)

            # Apply rate limiting
            await self.rate_limiter.wait_if_needed(session.session_id)

            self.logger.debug(
                "Getting playlist details",
                session_id=session.session_id[:8] + "...",
                playlist_id=playlist_id,
                limit=limit,
            )

            # Get playlist details
            playlist = client.get_playlist(playlist_id, limit=limit)

            self.logger.info(
                "Retrieved playlist details",
                session_id=session.session_id[:8] + "...",
                playlist_id=playlist_id,
                track_count=len(playlist.get("tracks", [])),
            )

            return playlist

        except Exception as e:
            self.logger.error(
                "Failed to get playlist details",
                session_id=session.session_id[:8] + "...",
                playlist_id=playlist_id,
                error=str(e),
            )
            raise YTMusicError(f"Failed to get playlist details: {e}")

    def clear_client_cache(self, session_id: Optional[str] = None) -> None:
        """
        Clear cached clients for memory management.

        Args:
            session_id: Optional specific session to clear (clears all if None)
        """
        if session_id:
            # Clear specific session clients
            keys_to_remove = [key for key in self._clients.keys() if key.startswith(session_id)]
            for key in keys_to_remove:
                del self._clients[key]

            self.logger.debug(
                "Cleared cached clients for session",
                session_id=session_id[:8] + "...",
                cleared_count=len(keys_to_remove),
            )
        else:
            # Clear all cached clients
            cleared_count = len(self._clients)
            self._clients.clear()

            self.logger.debug(
                "Cleared all cached clients",
                cleared_count=cleared_count,
            )

    async def get_client_stats(self) -> Dict[str, Any]:
        """
        Get client statistics.

        Returns:
            Dictionary with client statistics
        """
        return {
            "cached_clients": len(self._clients),
            "rate_limiter_stats": await self.rate_limiter.get_stats(),
        }