"""
YouTube Music data models for API responses and requests.
"""

from typing import Any
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class SearchType(str, Enum):
    """Search result types."""
    SONG = "song"
    VIDEO = "video"
    ALBUM = "album"
    ARTIST = "artist"
    PLAYLIST = "playlist"
    PODCAST = "podcast"
    EPISODE = "episode"


class PlaylistPrivacy(str, Enum):
    """Playlist privacy settings."""
    PRIVATE = "PRIVATE"
    PUBLIC = "PUBLIC"
    UNLISTED = "UNLISTED"


class Artist(BaseModel):
    """Artist information."""

    id: str | None = Field(None, description="Artist channel ID")
    name: str = Field(..., description="Artist name")
    thumbnails: list[dict[str, Any]] = Field(default_factory=list, description="Artist thumbnails")
    subscribers: str | None = Field(None, description="Subscriber count")


class Album(BaseModel):
    """Album information."""

    id: str | None = Field(None, description="Album playlist ID")
    title: str = Field(..., description="Album title")
    artists: list[Artist] = Field(default_factory=list, description="Album artists")
    year: str | None = Field(None, description="Release year")
    thumbnails: list[dict[str, Any]] = Field(default_factory=list, description="Album artwork")
    track_count: int | None = Field(None, description="Number of tracks")


class Song(BaseModel):
    """Song information."""

    video_id: str = Field(..., description="YouTube video ID")
    title: str = Field(..., description="Song title")
    artists: list[Artist] = Field(default_factory=list, description="Song artists")
    album: Album | None = Field(None, description="Album information")
    duration: str | None = Field(None, description="Song duration")
    thumbnails: list[dict[str, Any]] = Field(default_factory=list, description="Song thumbnails")
    explicit: bool = Field(default=False, description="Explicit content flag")
    is_library: bool = Field(default=False, description="In user's library")
    like_status: str | None = Field(None, description="Like status")


class PlaylistItem(BaseModel):
    """Playlist item with position tracking."""

    song: Song = Field(..., description="Song information")
    set_video_id: str | None = Field(None, description="Set video ID for removal")
    position: int | None = Field(None, description="Position in playlist")
    added_at: datetime | None = Field(None, description="When item was added")


class Playlist(BaseModel):
    """Playlist information and metadata."""

    id: str = Field(..., description="Playlist ID")
    title: str = Field(..., description="Playlist title")
    description: str | None = Field(None, description="Playlist description")
    privacy: PlaylistPrivacy = Field(default=PlaylistPrivacy.PRIVATE, description="Privacy setting")

    # Metadata
    owner: str | None = Field(None, description="Playlist owner")
    track_count: int = Field(default=0, description="Number of tracks")
    duration: str | None = Field(None, description="Total duration")
    thumbnails: list[dict[str, Any]] = Field(default_factory=list, description="Playlist thumbnails")

    # Tracks (populated when requested)
    tracks: list[PlaylistItem] = Field(default_factory=list, description="Playlist tracks")

    # System metadata
    created_at: datetime | None = Field(None, description="Creation timestamp")
    updated_at: datetime | None = Field(None, description="Last update timestamp")


class SearchFilter(BaseModel):
    """Search filters and parameters."""

    query: str = Field(..., description="Search query")
    search_type: SearchType | None = Field(None, description="Type of content to search")
    limit: int = Field(default=20, ge=1, le=100, description="Number of results")
    include_uploads: bool = Field(default=False, description="Include user uploads")
    ignore_spelling: bool = Field(default=False, description="Ignore spelling corrections")


class SearchResult(BaseModel):
    """Search result container."""

    query: str = Field(..., description="Original search query")
    search_type: SearchType | None = Field(None, description="Search type filter")
    total_results: int = Field(default=0, description="Total number of results")

    # Results by type
    songs: list[Song] = Field(default_factory=list, description="Song results")
    albums: list[Album] = Field(default_factory=list, description="Album results")
    artists: list[Artist] = Field(default_factory=list, description="Artist results")
    playlists: list[Playlist] = Field(default_factory=list, description="Playlist results")

    # Metadata
    search_time: datetime = Field(default_factory=datetime.utcnow, description="Search timestamp")
    response_time_ms: float | None = Field(None, description="Response time in milliseconds")


class LibraryStats(BaseModel):
    """User library statistics."""

    total_songs: int = Field(default=0, description="Total songs in library")
    total_albums: int = Field(default=0, description="Total albums in library")
    total_artists: int = Field(default=0, description="Total artists followed")
    total_playlists: int = Field(default=0, description="Total playlists created")
    last_updated: datetime = Field(default_factory=datetime.utcnow, description="Last update time")


class WatchPlaylist(BaseModel):
    """Watch playlist for radio functionality."""

    playlist_id: str = Field(..., description="Watch playlist ID")
    radio_type: str = Field(..., description="Type of radio playlist")
    tracks: list[Song] = Field(default_factory=list, description="Radio tracks")
    continuation_token: str | None = Field(None, description="Token for more tracks")


class APIError(BaseModel):
    """API error response."""

    error_code: str = Field(..., description="Error code")
    error_message: str = Field(..., description="Human-readable error message")
    details: dict[str, Any | None] = Field(None, description="Additional error details")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Error timestamp")
    request_id: str | None = Field(None, description="Request ID for debugging")