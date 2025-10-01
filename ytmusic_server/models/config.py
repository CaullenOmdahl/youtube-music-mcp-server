"""
Configuration models for the YouTube Music MCP server.
"""

from pydantic import BaseModel, Field, field_validator
import base64


class OAuthConfig(BaseModel):
    """OAuth 2.1 configuration with PKCE support."""

    client_id: str = Field(..., description="Google OAuth 2.1 client ID")
    client_secret: str = Field(..., description="Google OAuth 2.1 client secret")
    redirect_uri: str = Field(
        default="http://localhost:8080/auth/callback", description="OAuth redirect URI"
    )
    scopes: list[str] = Field(
        default=[
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/youtubepartner",
        ],
        description="OAuth scopes for YouTube Music access",
    )
    token_endpoint: str = Field(
        default="https://oauth2.googleapis.com/token",
        description="OAuth token endpoint",
    )
    auth_endpoint: str = Field(
        default="https://accounts.google.com/o/oauth2/v2/auth",
        description="OAuth authorization endpoint",
    )


class SecurityConfig(BaseModel):
    """Security configuration for encryption and token management."""

    encryption_key: str = Field(
        ..., description="Base64 encoded 32-byte encryption key"
    )
    token_expiry_buffer: int = Field(
        default=60, description="Token expiry buffer in seconds"
    )
    session_timeout: int = Field(default=3600, description="Session timeout in seconds")
    max_token_refresh_attempts: int = Field(
        default=3, description="Maximum token refresh attempts"
    )

    @field_validator("encryption_key")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        """Validate that encryption key is properly formatted."""
        try:
            decoded = base64.b64decode(v)
            if len(decoded) != 32:
                raise ValueError("Encryption key must be 32 bytes when decoded")
            return v
        except Exception as e:
            raise ValueError(f"Invalid encryption key format: {e}")


class APIConfig(BaseModel):
    """YouTube Music API configuration."""

    rate_limit_per_minute: int = Field(
        default=30, description="API requests per minute"
    )
    rate_limit_per_hour: int = Field(default=1000, description="API requests per hour")
    timeout_seconds: int = Field(default=30, description="API request timeout")
    max_retries: int = Field(default=3, description="Maximum retry attempts")
    user_agent: str = Field(
        default="YouTube Music MCP Server/2.0.0",
        description="User agent for API requests",
    )


class ServerConfig(BaseModel):
    """Main server configuration combining all config sections."""

    # User-provided OAuth credentials
    client_id: str = Field(..., description="Google OAuth client ID")
    client_secret: str = Field(..., description="Google OAuth client secret")
    refresh_token: str = Field(..., description="Google OAuth refresh token")

    # Optional configurations
    redis_url: str | None = Field(default=None, description="Redis connection URL")
    log_level: str = Field(default="INFO", description="Logging level")
    rate_limit_per_minute: int = Field(
        default=60, ge=1, le=300, description="Rate limit per minute per user"
    )
    enable_metrics: bool = Field(default=True, description="Enable Prometheus metrics")

    # Derived configurations
    @property
    def oauth_config(self) -> OAuthConfig:
        """Get OAuth configuration."""
        return OAuthConfig(
            client_id=self.client_id,
            client_secret=self.client_secret,
        )

    @property
    def api_config(self) -> APIConfig:
        """Get API configuration."""
        return APIConfig(
            rate_limit_per_minute=self.rate_limit_per_minute,
        )

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Validate log level."""
        valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        if v.upper() not in valid_levels:
            raise ValueError(f"Log level must be one of: {valid_levels}")
        return v.upper()
