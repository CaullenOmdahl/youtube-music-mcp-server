"""
Token storage implementations for sessions and OAuth tokens.
"""

import asyncio
import json
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, Union
import redis.asyncio as redis
import structlog

from ..security.encryption import EncryptionManager

logger = structlog.get_logger(__name__)


class TokenStorage(ABC):
    """Abstract base class for token storage implementations."""

    @abstractmethod
    async def store_session(self, session_id: str, session_data: Dict[str, Any]) -> None:
        """Store session data."""
        pass

    @abstractmethod
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve session data."""
        pass

    @abstractmethod
    async def delete_session(self, session_id: str) -> None:
        """Delete session data."""
        pass

    @abstractmethod
    async def store_token(self, key: str, token_data: Dict[str, Any], ttl: Optional[int] = None) -> None:
        """Store token data."""
        pass

    @abstractmethod
    async def get_token(self, key: str) -> Optional[Dict[str, Any]]:
        """Retrieve token data."""
        pass

    @abstractmethod
    async def delete_token(self, key: str) -> None:
        """Delete token data."""
        pass


class MemoryTokenStorage(TokenStorage):
    """
    In-memory token storage for development and testing.

    Warning: Data is lost when the application restarts.
    """

    def __init__(self, encryption_manager: EncryptionManager):
        self.encryption_manager = encryption_manager
        self.logger = logger.bind(component="memory_storage")
        self._sessions: Dict[str, str] = {}  # Encrypted data
        self._tokens: Dict[str, str] = {}    # Encrypted data

        self.logger.info("Memory token storage initialized")

    async def store_session(self, session_id: str, session_data: Dict[str, Any]) -> None:
        """Store encrypted session data in memory."""
        try:
            encrypted_data = self.encryption_manager.encrypt(session_data)
            self._sessions[session_id] = encrypted_data

            self.logger.debug(
                "Stored session in memory",
                session_id=session_id[:8] + "...",
            )
        except Exception as e:
            self.logger.error(
                "Error storing session",
                session_id=session_id[:8] + "...",
                error=str(e),
            )
            raise

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve and decrypt session data from memory."""
        try:
            encrypted_data = self._sessions.get(session_id)
            if not encrypted_data:
                return None

            session_data = self.encryption_manager.decrypt(encrypted_data, return_json=True)

            self.logger.debug(
                "Retrieved session from memory",
                session_id=session_id[:8] + "...",
            )

            return session_data
        except Exception as e:
            self.logger.error(
                "Error retrieving session",
                session_id=session_id[:8] + "...",
                error=str(e),
            )
            return None

    async def delete_session(self, session_id: str) -> None:
        """Delete session data from memory."""
        if session_id in self._sessions:
            del self._sessions[session_id]
            self.logger.debug(
                "Deleted session from memory",
                session_id=session_id[:8] + "...",
            )

    async def store_token(self, key: str, token_data: Dict[str, Any], ttl: Optional[int] = None) -> None:
        """Store encrypted token data in memory."""
        try:
            encrypted_data = self.encryption_manager.encrypt(token_data)
            self._tokens[key] = encrypted_data

            self.logger.debug(
                "Stored token in memory",
                key=key[:8] + "...",
                ttl=ttl,
            )
        except Exception as e:
            self.logger.error(
                "Error storing token",
                key=key[:8] + "...",
                error=str(e),
            )
            raise

    async def get_token(self, key: str) -> Optional[Dict[str, Any]]:
        """Retrieve and decrypt token data from memory."""
        try:
            encrypted_data = self._tokens.get(key)
            if not encrypted_data:
                return None

            token_data = self.encryption_manager.decrypt(encrypted_data, return_json=True)

            self.logger.debug(
                "Retrieved token from memory",
                key=key[:8] + "...",
            )

            return token_data
        except Exception as e:
            self.logger.error(
                "Error retrieving token",
                key=key[:8] + "...",
                error=str(e),
            )
            return None

    async def delete_token(self, key: str) -> None:
        """Delete token data from memory."""
        if key in self._tokens:
            del self._tokens[key]
            self.logger.debug(
                "Deleted token from memory",
                key=key[:8] + "...",
            )


class RedisTokenStorage(TokenStorage):
    """
    Redis-based token storage for production environments.

    Features:
    - Encrypted data storage
    - Automatic expiration with TTL
    - Connection pooling
    - Error handling and retries
    """

    def __init__(self, encryption_manager: EncryptionManager, redis_url: str):
        self.encryption_manager = encryption_manager
        self.redis_url = redis_url
        self.logger = logger.bind(component="redis_storage")
        self._redis: Optional[redis.Redis] = None

    async def _get_redis(self) -> redis.Redis:
        """Get Redis connection with lazy initialization."""
        if self._redis is None:
            try:
                self._redis = redis.from_url(
                    self.redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5,
                    retry_on_timeout=True,
                    max_connections=20,
                )

                # Test connection
                await self._redis.ping()

                self.logger.info(
                    "Redis connection established",
                    redis_url=self.redis_url.split('@')[-1] if '@' in self.redis_url else self.redis_url,
                )

            except Exception as e:
                self.logger.error(
                    "Failed to connect to Redis",
                    error=str(e),
                    redis_url=self.redis_url.split('@')[-1] if '@' in self.redis_url else self.redis_url,
                )
                raise

        return self._redis

    async def store_session(self, session_id: str, session_data: Dict[str, Any]) -> None:
        """Store encrypted session data in Redis."""
        try:
            redis_client = await self._get_redis()
            encrypted_data = self.encryption_manager.encrypt(session_data)

            key = f"session:{session_id}"
            await redis_client.setex(key, 3600, encrypted_data)  # 1 hour TTL

            self.logger.debug(
                "Stored session in Redis",
                session_id=session_id[:8] + "...",
            )
        except Exception as e:
            self.logger.error(
                "Error storing session in Redis",
                session_id=session_id[:8] + "...",
                error=str(e),
            )
            raise

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve and decrypt session data from Redis."""
        try:
            redis_client = await self._get_redis()
            key = f"session:{session_id}"

            encrypted_data = await redis_client.get(key)
            if not encrypted_data:
                return None

            session_data = self.encryption_manager.decrypt(encrypted_data, return_json=True)

            self.logger.debug(
                "Retrieved session from Redis",
                session_id=session_id[:8] + "...",
            )

            return session_data
        except Exception as e:
            self.logger.error(
                "Error retrieving session from Redis",
                session_id=session_id[:8] + "...",
                error=str(e),
            )
            return None

    async def delete_session(self, session_id: str) -> None:
        """Delete session data from Redis."""
        try:
            redis_client = await self._get_redis()
            key = f"session:{session_id}"

            await redis_client.delete(key)

            self.logger.debug(
                "Deleted session from Redis",
                session_id=session_id[:8] + "...",
            )
        except Exception as e:
            self.logger.error(
                "Error deleting session from Redis",
                session_id=session_id[:8] + "...",
                error=str(e),
            )

    async def store_token(self, key: str, token_data: Dict[str, Any], ttl: Optional[int] = None) -> None:
        """Store encrypted token data in Redis."""
        try:
            redis_client = await self._get_redis()
            encrypted_data = self.encryption_manager.encrypt(token_data)

            redis_key = f"token:{key}"
            if ttl:
                await redis_client.setex(redis_key, ttl, encrypted_data)
            else:
                await redis_client.set(redis_key, encrypted_data)

            self.logger.debug(
                "Stored token in Redis",
                key=key[:8] + "...",
                ttl=ttl,
            )
        except Exception as e:
            self.logger.error(
                "Error storing token in Redis",
                key=key[:8] + "...",
                error=str(e),
            )
            raise

    async def get_token(self, key: str) -> Optional[Dict[str, Any]]:
        """Retrieve and decrypt token data from Redis."""
        try:
            redis_client = await self._get_redis()
            redis_key = f"token:{key}"

            encrypted_data = await redis_client.get(redis_key)
            if not encrypted_data:
                return None

            token_data = self.encryption_manager.decrypt(encrypted_data, return_json=True)

            self.logger.debug(
                "Retrieved token from Redis",
                key=key[:8] + "...",
            )

            return token_data
        except Exception as e:
            self.logger.error(
                "Error retrieving token from Redis",
                key=key[:8] + "...",
                error=str(e),
            )
            return None

    async def delete_token(self, key: str) -> None:
        """Delete token data from Redis."""
        try:
            redis_client = await self._get_redis()
            redis_key = f"token:{key}"

            await redis_client.delete(redis_key)

            self.logger.debug(
                "Deleted token from Redis",
                key=key[:8] + "...",
            )
        except Exception as e:
            self.logger.error(
                "Error deleting token from Redis",
                key=key[:8] + "...",
                error=str(e),
            )

    async def close(self) -> None:
        """Close Redis connection."""
        if self._redis:
            await self._redis.close()
            self.logger.info("Redis connection closed")