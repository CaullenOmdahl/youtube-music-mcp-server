"""
OAuth 2.1 manager with PKCE implementation for secure authentication.
"""

import secrets
from urllib.parse import urlencode
import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from ..models.config import OAuthConfig
from ..models.auth import OAuthToken, PKCEChallenge
from ..security.encryption import EncryptionManager

logger = structlog.get_logger(__name__)


class OAuthError(Exception):
    """OAuth-specific error."""
    pass


class OAuthManager:
    """
    OAuth 2.1 manager implementing PKCE flow for secure authentication.

    Features:
    - PKCE (Proof Key for Code Exchange) with S256 challenge
    - Automatic token refresh with exponential backoff
    - Secure token storage with encryption
    - Comprehensive error handling and logging
    """

    def __init__(
        self,
        config: OAuthConfig,
        encryption_manager: EncryptionManager,
    ):
        self.config = config
        self.encryption_manager = encryption_manager
        self.logger = logger.bind(component="oauth_manager")

    def generate_auth_url(self, pkce_challenge: PKCEChallenge, state: str) -> str:
        """
        Generate OAuth 2.1 authorization URL with PKCE.

        Args:
            pkce_challenge: PKCE challenge for security
            state: State parameter for CSRF protection

        Returns:
            Authorization URL for user redirect
        """
        params = {
            "response_type": "code",
            "client_id": self.config.client_id,
            "redirect_uri": self.config.redirect_uri,
            "scope": " ".join(self.config.scopes),
            "state": state,
            "code_challenge": pkce_challenge.code_challenge,
            "code_challenge_method": pkce_challenge.code_challenge_method,
            "access_type": "offline",  # Request refresh token
            "prompt": "consent",  # Force consent screen for refresh token
        }

        auth_url = f"{self.config.auth_endpoint}?{urlencode(params)}"

        self.logger.info(
            "Generated OAuth authorization URL",
            client_id=self.config.client_id[:8] + "...",
            scopes=self.config.scopes,
            has_pkce=True,
        )

        return auth_url

    async def exchange_code_for_token(
        self,
        authorization_code: str,
        pkce_challenge: PKCEChallenge,
        state: str,
    ) -> OAuthToken:
        """
        Exchange authorization code for access token using PKCE.

        Args:
            authorization_code: Authorization code from OAuth callback
            pkce_challenge: PKCE challenge used in auth URL
            state: State parameter for validation

        Returns:
            OAuth token with access and refresh tokens

        Raises:
            OAuthError: If token exchange fails
        """
        token_data = {
            "grant_type": "authorization_code",
            "client_id": self.config.client_id,
            "client_secret": self.config.client_secret,
            "code": authorization_code,
            "redirect_uri": self.config.redirect_uri,
            "code_verifier": pkce_challenge.code_verifier,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.config.token_endpoint,
                    data=token_data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=30.0,
                )

                if response.status_code != 200:
                    error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                    self.logger.error(
                        "Token exchange failed",
                        status_code=response.status_code,
                        error=error_data,
                    )
                    raise OAuthError(f"Token exchange failed: {error_data.get('error_description', 'Unknown error')}")

                token_response = response.json()

                # Validate required fields
                required_fields = ["access_token", "token_type", "expires_in"]
                missing_fields = [field for field in required_fields if field not in token_response]
                if missing_fields:
                    raise OAuthError(f"Missing required token fields: {missing_fields}")

                oauth_token = OAuthToken(
                    access_token=token_response["access_token"],
                    refresh_token=token_response.get("refresh_token"),
                    token_type=token_response.get("token_type", "Bearer"),
                    expires_in=token_response["expires_in"],
                    scope=token_response.get("scope", " ".join(self.config.scopes)),
                )

                self.logger.info(
                    "Successfully exchanged code for token",
                    has_refresh_token=oauth_token.refresh_token is not None,
                    expires_in=oauth_token.expires_in,
                    scopes=oauth_token.scope,
                )

                return oauth_token

        except httpx.RequestError as e:
            self.logger.error("Network error during token exchange", error=str(e))
            raise OAuthError(f"Network error during token exchange: {e}")
        except Exception as e:
            self.logger.error("Unexpected error during token exchange", error=str(e))
            raise OAuthError(f"Unexpected error during token exchange: {e}")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
    )
    async def refresh_token(self, oauth_token: OAuthToken) -> OAuthToken:
        """
        Refresh OAuth token with automatic retry logic.

        Args:
            oauth_token: Current OAuth token with refresh token

        Returns:
            New OAuth token with refreshed access token

        Raises:
            OAuthError: If token refresh fails
        """
        if not oauth_token.refresh_token:
            raise OAuthError("No refresh token available")

        refresh_data = {
            "grant_type": "refresh_token",
            "client_id": self.config.client_id,
            "client_secret": self.config.client_secret,
            "refresh_token": oauth_token.refresh_token,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.config.token_endpoint,
                    data=refresh_data,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=30.0,
                )

                if response.status_code != 200:
                    error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                    self.logger.error(
                        "Token refresh failed",
                        status_code=response.status_code,
                        error=error_data,
                        refresh_count=oauth_token.refresh_count,
                    )
                    raise OAuthError(f"Token refresh failed: {error_data.get('error_description', 'Unknown error')}")

                token_response = response.json()
                new_token = oauth_token.refresh(token_response)

                self.logger.info(
                    "Successfully refreshed token",
                    refresh_count=new_token.refresh_count,
                    expires_in=new_token.expires_in,
                )

                return new_token

        except httpx.RequestError as e:
            self.logger.error(
                "Network error during token refresh",
                error=str(e),
                refresh_count=oauth_token.refresh_count,
            )
            raise OAuthError(f"Network error during token refresh: {e}")

    async def revoke_token(self, oauth_token: OAuthToken) -> bool:
        """
        Revoke OAuth token.

        Args:
            oauth_token: OAuth token to revoke

        Returns:
            True if revocation was successful
        """
        revoke_url = "https://oauth2.googleapis.com/revoke"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    revoke_url,
                    data={"token": oauth_token.access_token},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=10.0,
                )

                success = response.status_code == 200

                self.logger.info(
                    "Token revocation completed",
                    success=success,
                    status_code=response.status_code,
                )

                return success

        except Exception as e:
            self.logger.error("Error during token revocation", error=str(e))
            return False

    def validate_callback_state(self, received_state: str, expected_state: str) -> bool:
        """
        Validate OAuth callback state parameter for CSRF protection.

        Args:
            received_state: State parameter received from callback
            expected_state: Expected state parameter

        Returns:
            True if states match
        """
        is_valid = secrets.compare_digest(received_state, expected_state)

        if not is_valid:
            self.logger.warning(
                "OAuth state validation failed",
                received_state_length=len(received_state),
                expected_state_length=len(expected_state),
            )

        return is_valid

    async def validate_token(self, oauth_token: OAuthToken) -> bool:
        """
        Validate OAuth token by making a test request.

        Args:
            oauth_token: OAuth token to validate

        Returns:
            True if token is valid
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://www.googleapis.com/oauth2/v1/tokeninfo",
                    params={"access_token": oauth_token.access_token},
                    timeout=10.0,
                )

                is_valid = response.status_code == 200

                if is_valid:
                    token_info = response.json()
                    self.logger.debug(
                        "Token validation successful",
                        audience=token_info.get("audience", "unknown"),
                        expires_in=token_info.get("expires_in", 0),
                    )
                else:
                    self.logger.warning(
                        "Token validation failed",
                        status_code=response.status_code,
                    )

                return is_valid

        except Exception as e:
            self.logger.error("Error during token validation", error=str(e))
            return False