"""
Session manager for user authentication and session lifecycle.
"""

import asyncio
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import structlog

from ..models.auth import UserSession, AuthState, OAuthToken
from ..models.config import SecurityConfig
from .token_storage import TokenStorage

logger = structlog.get_logger(__name__)


class SessionManager:
    """
    Manages user sessions with secure storage and lifecycle management.

    Features:
    - Session creation and validation
    - Automatic session cleanup
    - Rate limiting per session
    - Secure session storage
    """

    def __init__(
        self,
        token_storage: TokenStorage,
        security_config: SecurityConfig,
    ):
        self.storage = token_storage
        self.config = security_config
        self.logger = logger.bind(component="session_manager")
        self._sessions: Dict[str, UserSession] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start the session manager and cleanup task."""
        self.logger.info("Starting session manager")
        self._cleanup_task = asyncio.create_task(self._cleanup_expired_sessions())

    async def stop(self) -> None:
        """Stop the session manager and cleanup task."""
        self.logger.info("Stopping session manager")
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

    async def create_session(
        self,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> UserSession:
        """
        Create a new user session.

        Args:
            ip_address: Client IP address
            user_agent: Client user agent

        Returns:
            New user session
        """
        session = UserSession.create_new(ip_address=ip_address, user_agent=user_agent)

        # Store session
        await self._store_session(session)

        self.logger.info(
            "Created new session",
            session_id=session.session_id[:8] + "...",
            ip_address=ip_address,
            has_pkce=session.pkce_challenge is not None,
        )

        return session

    async def get_session(self, session_id: str) -> Optional[UserSession]:
        """
        Get session by ID.

        Args:
            session_id: Session identifier

        Returns:
            User session if found and valid, None otherwise
        """
        # Try memory cache first
        if session_id in self._sessions:
            session = self._sessions[session_id]
            if not session.is_expired:
                session.update_access()
                await self._store_session(session)
                return session
            else:
                # Remove expired session
                await self.delete_session(session_id)
                return None

        # Try persistent storage
        try:
            session_data = await self.storage.get_session(session_id)
            if session_data:
                session = UserSession(**session_data)
                if not session.is_expired:
                    session.update_access()
                    self._sessions[session_id] = session
                    await self._store_session(session)
                    return session
                else:
                    await self.delete_session(session_id)
                    return None
        except Exception as e:
            self.logger.error(
                "Error retrieving session",
                session_id=session_id[:8] + "...",
                error=str(e),
            )

        return None

    async def update_session(self, session: UserSession) -> None:
        """
        Update existing session.

        Args:
            session: Session to update
        """
        session.update_access()
        await self._store_session(session)

        self.logger.debug(
            "Updated session",
            session_id=session.session_id[:8] + "...",
            state=session.state.value,
        )

    async def delete_session(self, session_id: str) -> bool:
        """
        Delete session by ID.

        Args:
            session_id: Session identifier

        Returns:
            True if session was deleted
        """
        # Remove from memory
        if session_id in self._sessions:
            del self._sessions[session_id]

        # Remove from storage
        try:
            await self.storage.delete_session(session_id)
            self.logger.info(
                "Deleted session",
                session_id=session_id[:8] + "...",
            )
            return True
        except Exception as e:
            self.logger.error(
                "Error deleting session",
                session_id=session_id[:8] + "...",
                error=str(e),
            )
            return False

    async def authenticate_session(
        self,
        session_id: str,
        oauth_token: OAuthToken,
        user_id: Optional[str] = None,
    ) -> Optional[UserSession]:
        """
        Authenticate session with OAuth token.

        Args:
            session_id: Session identifier
            oauth_token: OAuth token from successful authentication
            user_id: Optional user ID

        Returns:
            Authenticated session
        """
        session = await self.get_session(session_id)
        if not session:
            self.logger.warning(
                "Attempted to authenticate non-existent session",
                session_id=session_id[:8] + "...",
            )
            return None

        # Update session with authentication data
        session.oauth_token = oauth_token
        session.user_id = user_id
        session.state = AuthState.AUTHORIZED

        await self._store_session(session)

        self.logger.info(
            "Authenticated session",
            session_id=session_id[:8] + "...",
            user_id=user_id,
            token_expires_in=oauth_token.expires_in,
        )

        return session

    async def check_rate_limit(
        self,
        session_id: str,
        max_requests: Optional[int] = None,
    ) -> bool:
        """
        Check if session is within rate limits.

        Args:
            session_id: Session identifier
            max_requests: Maximum requests per minute (uses config default if None)

        Returns:
            True if within limits, False if rate limited
        """
        session = await self.get_session(session_id)
        if not session:
            return False

        max_req = max_requests or 60  # Default rate limit

        if session.is_rate_limited(max_req):
            self.logger.warning(
                "Session rate limited",
                session_id=session_id[:8] + "...",
                request_count=session.request_count,
                max_requests=max_req,
            )
            return False

        # Increment request count
        session.increment_request_count()
        await self._store_session(session)

        return True

    async def _store_session(self, session: UserSession) -> None:
        """Store session in both memory and persistent storage."""
        # Store in memory cache
        self._sessions[session.session_id] = session

        # Store in persistent storage
        try:
            await self.storage.store_session(session.session_id, session.model_dump())
        except Exception as e:
            self.logger.error(
                "Error storing session",
                session_id=session.session_id[:8] + "...",
                error=str(e),
            )

    async def _cleanup_expired_sessions(self) -> None:
        """Background task to clean up expired sessions."""
        self.logger.info("Started session cleanup task")

        while True:
            try:
                await asyncio.sleep(300)  # Run every 5 minutes

                current_time = datetime.utcnow()
                expired_sessions = []

                # Check memory cache
                for session_id, session in list(self._sessions.items()):
                    if session.is_expired:
                        expired_sessions.append(session_id)

                # Clean up expired sessions
                for session_id in expired_sessions:
                    await self.delete_session(session_id)

                if expired_sessions:
                    self.logger.info(
                        "Cleaned up expired sessions",
                        count=len(expired_sessions),
                    )

            except asyncio.CancelledError:
                self.logger.info("Session cleanup task cancelled")
                break
            except Exception as e:
                self.logger.error(
                    "Error in session cleanup task",
                    error=str(e),
                )
                # Continue running despite errors
                await asyncio.sleep(60)  # Wait before retrying

    async def get_session_stats(self) -> Dict[str, Any]:
        """
        Get session statistics.

        Returns:
            Dictionary with session statistics
        """
        active_sessions = len(self._sessions)
        authenticated_sessions = sum(
            1 for session in self._sessions.values()
            if session.is_authenticated
        )

        return {
            "active_sessions": active_sessions,
            "authenticated_sessions": authenticated_sessions,
            "storage_type": type(self.storage).__name__,
        }