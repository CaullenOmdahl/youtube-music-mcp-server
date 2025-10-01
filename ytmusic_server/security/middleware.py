"""
Security middleware for request validation and protection.
"""

import time
from typing import Any
from collections import defaultdict, deque
import structlog

from .validators import SecurityValidator

logger = structlog.get_logger(__name__)


class RateLimitExceeded(Exception):
    """Rate limit exceeded error."""
    pass


class SecurityMiddleware:
    """
    Security middleware providing rate limiting, request validation, and protection.

    Features:
    - IP-based rate limiting
    - Request size validation
    - Security header enforcement
    - Request timing and monitoring
    """

    def __init__(
        self,
        security_validator: SecurityValidator,
        rate_limit_requests: int = 60,
        rate_limit_window: int = 60,
        max_request_size: int = 1024 * 1024,
    ):
        self.validator = security_validator
        self.rate_limit_requests = rate_limit_requests
        self.rate_limit_window = rate_limit_window
        self.max_request_size = max_request_size
        self.logger = logger.bind(component="security_middleware")

        # Rate limiting storage
        self._rate_limit_storage: dict[str, deque] = defaultdict(deque)

        self.logger.info(
            "Security middleware initialized",
            rate_limit_requests=rate_limit_requests,
            rate_limit_window=rate_limit_window,
            max_request_size=max_request_size,
        )

    async def validate_request(
        self,
        ip_address: str | None = None,
        user_agent: str | None = None,
        content_length: int | None = None,
        session_id: str | None = None,
    ) -> bool:
        """
        Validate incoming request for security compliance.

        Args:
            ip_address: Client IP address
            user_agent: Client user agent
            content_length: Request content length
            session_id: Session identifier

        Returns:
            True if request is valid

        Raises:
            SecurityValidationError: If request fails validation
            RateLimitExceeded: If rate limit is exceeded
        """
        request_start = time.time()

        try:
            # Validate IP address if provided
            if ip_address:
                self.validator.validate_ip_address(ip_address)

                # Check rate limit for IP
                if not await self._check_rate_limit(ip_address):
                    raise RateLimitExceeded(f"Rate limit exceeded for IP {ip_address}")

            # Validate user agent
            if user_agent:
                self.validator.validate_user_agent(user_agent)

            # Validate request size
            if content_length is not None:
                self.validator.validate_request_size(content_length, self.max_request_size)

            # Validate session ID format
            if session_id:
                self.validator.validate_session_id(session_id)

            request_duration = time.time() - request_start
            self.logger.debug(
                "Request validation successful",
                ip=ip_address,
                validation_duration=f"{request_duration:.3f}s",
            )

            return True

        except Exception as e:
            request_duration = time.time() - request_start
            self.logger.error(
                "Request validation failed",
                ip=ip_address,
                error=str(e),
                validation_duration=f"{request_duration:.3f}s",
            )
            raise

    async def _check_rate_limit(self, identifier: str) -> bool:
        """
        Check if identifier is within rate limits.

        Args:
            identifier: Rate limit identifier (usually IP address)

        Returns:
            True if within limits, False if rate limited
        """
        current_time = time.time()
        window_start = current_time - self.rate_limit_window

        # Get request history for this identifier
        requests = self._rate_limit_storage[identifier]

        # Remove old requests outside the window
        while requests and requests[0] < window_start:
            requests.popleft()

        # Check if we're within the limit
        if len(requests) >= self.rate_limit_requests:
            self.logger.warning(
                "Rate limit exceeded",
                identifier=identifier,
                request_count=len(requests),
                limit=self.rate_limit_requests,
                window=self.rate_limit_window,
            )
            return False

        # Add current request
        requests.append(current_time)

        self.logger.debug(
            "Rate limit check passed",
            identifier=identifier,
            request_count=len(requests),
            limit=self.rate_limit_requests,
        )

        return True

    def get_security_headers(self) -> dict[str, str]:
        """
        Get security headers to include in responses.

        Returns:
            Dictionary of security headers
        """
        return {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Content-Security-Policy": "default-src 'self'",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Pragma": "no-cache",
        }

    async def cleanup_rate_limits(self) -> None:
        """Clean up old rate limit entries to prevent memory leaks."""
        current_time = time.time()
        window_start = current_time - self.rate_limit_window

        # Clean up entries for all identifiers
        cleaned_count = 0
        for identifier, requests in list(self._rate_limit_storage.items()):
            # Remove old requests
            len(requests)
            while requests and requests[0] < window_start:
                requests.popleft()

            # Remove empty deques
            if not requests:
                del self._rate_limit_storage[identifier]
                cleaned_count += 1

        if cleaned_count > 0:
            self.logger.debug(
                "Cleaned up rate limit storage",
                cleaned_identifiers=cleaned_count,
                active_identifiers=len(self._rate_limit_storage),
            )

    def get_rate_limit_status(self, identifier: str) -> dict[str, Any]:
        """
        Get current rate limit status for an identifier.

        Args:
            identifier: Rate limit identifier

        Returns:
            Dictionary with rate limit status
        """
        current_time = time.time()
        window_start = current_time - self.rate_limit_window

        requests = self._rate_limit_storage.get(identifier, deque())

        # Count requests in current window
        current_requests = sum(1 for req_time in requests if req_time >= window_start)

        remaining = max(0, self.rate_limit_requests - current_requests)
        reset_time = current_time + self.rate_limit_window

        return {
            "limit": self.rate_limit_requests,
            "remaining": remaining,
            "reset": int(reset_time),
            "window": self.rate_limit_window,
        }