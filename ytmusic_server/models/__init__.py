"""
Data models and schemas for the YouTube Music MCP server.
"""

from .config import ServerConfig, OAuthConfig, SecurityConfig
from .auth import OAuthToken, UserSession, AuthState
from .youtube import (
    SearchResult,
    Playlist,
    Song,
    Artist,
    Album,
    PlaylistItem,
    SearchFilter,
)

__all__ = [
    # Configuration models
    "ServerConfig",
    "OAuthConfig",
    "SecurityConfig",
    # Authentication models
    "OAuthToken",
    "UserSession",
    "AuthState",
    # YouTube Music models
    "SearchResult",
    "Playlist",
    "Song",
    "Artist",
    "Album",
    "PlaylistItem",
    "SearchFilter",
]