"""
OAuth Handler for MCP Server
Implements OAuth flow compatible with Smithery's client example
"""

import os
import json
import secrets
import hashlib
import base64
import time
from typing import Dict, Optional, Any
from dataclasses import dataclass, asdict
import logging

logger = logging.getLogger(__name__)

@dataclass
class OAuthSession:
    """OAuth session data"""
    state: str
    code_verifier: str
    code_challenge: str
    redirect_uri: str
    created_at: float
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_at: Optional[float] = None
    youtube_tokens: Optional[str] = None  # Store YouTube browser.json format

class OAuthHandler:
    """
    Handles OAuth 2.0 flow for YouTube Music MCP Server
    Compatible with Smithery's OAuth client implementation
    """

    def __init__(self):
        # Load OAuth credentials from environment variables (preferred)
        self.client_id = os.getenv("GOOGLE_CLIENT_ID", "")
        self.client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")

        # Fallback to oauth.json file if env vars not set (for local development)
        if not self.client_id or not self.client_secret:
            oauth_path = os.getenv("OAUTH_CONFIG_PATH", "oauth.json")
            if os.path.exists(oauth_path):
                with open(oauth_path, 'r') as f:
                    oauth_data = json.load(f)
                    if 'installed' in oauth_data:
                        self.client_id = oauth_data['installed']['client_id']
                        self.client_secret = oauth_data['installed']['client_secret']

        # Validate credentials are available
        if not self.client_id or not self.client_secret:
            logger.warning("OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.")

        # OAuth endpoints
        self.auth_endpoint = "https://accounts.google.com/o/oauth2/v2/auth"
        self.token_endpoint = "https://oauth2.googleapis.com/token"

        # In-memory session storage (in production, use Redis or similar)
        self.sessions: Dict[str, OAuthSession] = {}

        # Clean up old sessions periodically
        self._cleanup_old_sessions()

    def _cleanup_old_sessions(self):
        """Remove sessions older than 10 minutes"""
        current_time = time.time()
        expired = [
            state for state, session in self.sessions.items()
            if current_time - session.created_at > 600
        ]
        for state in expired:
            del self.sessions[state]

    def generate_pkce(self) -> tuple[str, str]:
        """Generate PKCE code verifier and challenge"""
        # Generate code verifier (43-128 characters)
        code_verifier = base64.urlsafe_b64encode(
            secrets.token_bytes(32)
        ).decode('utf-8').rstrip('=')

        # Generate code challenge (SHA256 of verifier)
        challenge_bytes = hashlib.sha256(code_verifier.encode()).digest()
        code_challenge = base64.urlsafe_b64encode(
            challenge_bytes
        ).decode('utf-8').rstrip('=')

        return code_verifier, code_challenge

    def create_authorization_url(self, redirect_uri: str) -> Dict[str, Any]:
        """
        Create authorization URL for OAuth flow
        Returns data matching MCP OAuth spec
        """
        # Ensure credentials are available
        if not self.client_id or not self.client_secret:
            raise ValueError("OAuth credentials not configured. Server owner must set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.")

        # Generate state for CSRF protection
        state = secrets.token_urlsafe(32)

        # Generate PKCE parameters
        code_verifier, code_challenge = self.generate_pkce()

        # Store session
        session = OAuthSession(
            state=state,
            code_verifier=code_verifier,
            code_challenge=code_challenge,
            redirect_uri=redirect_uri,
            created_at=time.time()
        )
        self.sessions[state] = session

        # Build authorization URL with YouTube Music scopes
        auth_params = {
            'client_id': self.client_id,
            'redirect_uri': redirect_uri,
            'response_type': 'code',
            'scope': 'https://www.googleapis.com/auth/youtube',
            'state': state,
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256',
            'access_type': 'offline',
            'prompt': 'consent'
        }

        # Construct URL
        from urllib.parse import urlencode
        auth_url = f"{self.auth_endpoint}?{urlencode(auth_params)}"

        logger.info(f"Created authorization URL with state: {state}")

        return {
            "auth_url": auth_url,
            "state": state,
            "expires_in": 600  # 10 minutes to complete auth
        }

    async def exchange_code_for_tokens(self, code: str, state: str) -> Dict[str, Any]:
        """
        Exchange authorization code for access and refresh tokens
        """
        # Verify state
        if state not in self.sessions:
            logger.error(f"Invalid state: {state}")
            raise ValueError("Invalid or expired state parameter")

        session = self.sessions[state]

        # Prepare token exchange request
        token_data = {
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'code': code,
            'redirect_uri': session.redirect_uri,
            'grant_type': 'authorization_code',
            'code_verifier': session.code_verifier
        }

        # Make token request
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_endpoint,
                data=token_data
            )

            if response.status_code != 200:
                logger.error(f"Token exchange failed: {response.text}")
                raise ValueError(f"Token exchange failed: {response.status_code}")

            tokens = response.json()

        # Update session with tokens
        session.access_token = tokens['access_token']
        session.refresh_token = tokens.get('refresh_token')
        session.expires_at = time.time() + tokens.get('expires_in', 3600)

        # Create browser.json format for ytmusicapi
        browser_json = {
            "access_token": tokens['access_token'],
            "refresh_token": tokens.get('refresh_token'),
            "expires_at": session.expires_at,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "token_type": "Bearer"
        }
        session.youtube_tokens = json.dumps(browser_json)

        logger.info(f"Successfully exchanged code for tokens (state: {state})")

        # Return tokens in MCP format
        return {
            "access_token": session.access_token,
            "token_type": "Bearer",
            "expires_in": tokens.get('expires_in', 3600),
            "refresh_token": session.refresh_token,
            "state": state
        }

    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """
        Refresh an access token using refresh token
        """
        refresh_data = {
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'refresh_token': refresh_token,
            'grant_type': 'refresh_token'
        }

        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_endpoint,
                data=refresh_data
            )

            if response.status_code != 200:
                logger.error(f"Token refresh failed: {response.text}")
                raise ValueError(f"Token refresh failed: {response.status_code}")

            tokens = response.json()

        logger.info("Successfully refreshed access token")

        return {
            "access_token": tokens['access_token'],
            "token_type": "Bearer",
            "expires_in": tokens.get('expires_in', 3600)
        }

    def get_session_by_token(self, access_token: str) -> Optional[OAuthSession]:
        """Get session by access token"""
        for session in self.sessions.values():
            if session.access_token == access_token:
                return session
        return None

    def get_youtube_tokens(self, access_token: str) -> Optional[str]:
        """Get YouTube tokens in browser.json format for a given access token"""
        session = self.get_session_by_token(access_token)
        if session:
            return session.youtube_tokens
        return None
