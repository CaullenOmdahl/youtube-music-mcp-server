"""
Authentication models for OAuth 2.1 and session management.
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
import secrets
import hashlib
import base64


class AuthState(str, Enum):
    """OAuth authentication state."""
    PENDING = "pending"
    AUTHORIZED = "authorized"
    EXPIRED = "expired"
    REVOKED = "revoked"


class PKCEChallenge(BaseModel):
    """PKCE challenge for OAuth 2.1 security."""

    code_verifier: str = Field(..., description="PKCE code verifier")
    code_challenge: str = Field(..., description="PKCE code challenge")
    code_challenge_method: str = Field(default="S256", description="Challenge method")

    @classmethod
    def generate(cls) -> "PKCEChallenge":
        """Generate a new PKCE challenge."""
        code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')
        code_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode('utf-8')).digest()
        ).decode('utf-8').rstrip('=')

        return cls(
            code_verifier=code_verifier,
            code_challenge=code_challenge,
            code_challenge_method="S256"
        )


class OAuthToken(BaseModel):
    """OAuth 2.1 token with refresh capabilities."""

    access_token: str = Field(..., description="OAuth access token")
    refresh_token: Optional[str] = Field(None, description="OAuth refresh token")
    token_type: str = Field(default="Bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiry in seconds")
    scope: str = Field(..., description="Granted scopes")

    # Internal fields
    created_at: datetime = Field(default_factory=datetime.utcnow)
    refreshed_at: Optional[datetime] = Field(None, description="Last refresh time")
    refresh_count: int = Field(default=0, description="Number of refreshes")

    @property
    def expires_at(self) -> datetime:
        """Calculate token expiration time."""
        return self.created_at + timedelta(seconds=self.expires_in)

    @property
    def is_expired(self) -> bool:
        """Check if token is expired with buffer."""
        buffer = timedelta(seconds=60)  # 1 minute buffer
        return datetime.utcnow() >= (self.expires_at - buffer)

    @property
    def is_refresh_needed(self) -> bool:
        """Check if token needs refresh."""
        return self.is_expired and self.refresh_token is not None

    def refresh(self, new_token_data: Dict[str, Any]) -> "OAuthToken":
        """Create new token from refresh response."""
        return OAuthToken(
            access_token=new_token_data["access_token"],
            refresh_token=new_token_data.get("refresh_token", self.refresh_token),
            token_type=new_token_data.get("token_type", "Bearer"),
            expires_in=new_token_data["expires_in"],
            scope=new_token_data.get("scope", self.scope),
            created_at=datetime.utcnow(),
            refreshed_at=datetime.utcnow(),
            refresh_count=self.refresh_count + 1,
        )


class UserSession(BaseModel):
    """User session with OAuth token and metadata."""

    session_id: str = Field(..., description="Unique session identifier")
    user_id: Optional[str] = Field(None, description="YouTube user ID")
    oauth_token: Optional[OAuthToken] = Field(None, description="OAuth token")
    state: AuthState = Field(default=AuthState.PENDING, description="Session state")

    # Session metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_accessed: datetime = Field(default_factory=datetime.utcnow)
    ip_address: Optional[str] = Field(None, description="Client IP address")
    user_agent: Optional[str] = Field(None, description="Client user agent")

    # PKCE data for OAuth flow
    pkce_challenge: Optional[PKCEChallenge] = Field(None, description="PKCE challenge")

    # Rate limiting
    request_count: int = Field(default=0, description="Number of requests made")
    rate_limit_reset: datetime = Field(
        default_factory=lambda: datetime.utcnow() + timedelta(minutes=1),
        description="Rate limit reset time"
    )

    @classmethod
    def create_new(cls, ip_address: Optional[str] = None, user_agent: Optional[str] = None) -> "UserSession":
        """Create a new user session."""
        session_id = secrets.token_urlsafe(32)
        return cls(
            session_id=session_id,
            ip_address=ip_address,
            user_agent=user_agent,
            pkce_challenge=PKCEChallenge.generate(),
        )

    @property
    def is_authenticated(self) -> bool:
        """Check if session is authenticated."""
        return (
            self.state == AuthState.AUTHORIZED
            and self.oauth_token is not None
            and not self.oauth_token.is_expired
        )

    @property
    def is_expired(self) -> bool:
        """Check if session is expired."""
        session_timeout = timedelta(hours=1)  # 1 hour session timeout
        return datetime.utcnow() > (self.last_accessed + session_timeout)

    def update_access(self) -> None:
        """Update last access time."""
        self.last_accessed = datetime.utcnow()

    def increment_request_count(self) -> None:
        """Increment request count for rate limiting."""
        now = datetime.utcnow()
        if now >= self.rate_limit_reset:
            self.request_count = 1
            self.rate_limit_reset = now + timedelta(minutes=1)
        else:
            self.request_count += 1

    def is_rate_limited(self, max_requests: int = 60) -> bool:
        """Check if session is rate limited."""
        now = datetime.utcnow()
        if now >= self.rate_limit_reset:
            self.request_count = 0
            self.rate_limit_reset = now + timedelta(minutes=1)
            return False
        return self.request_count >= max_requests