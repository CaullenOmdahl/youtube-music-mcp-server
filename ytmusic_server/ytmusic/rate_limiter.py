"""
Rate limiter for YouTube Music API requests.
"""

import asyncio
import time
from typing import Any
from collections import defaultdict, deque
import structlog

logger = structlog.get_logger(__name__)


class RateLimitExceeded(Exception):
    """Rate limit exceeded error."""
    pass


class RateLimiter:
    """
    Rate limiter for YouTube Music API with per-session tracking.

    Features:
    - Per-session rate limiting
    - Configurable rate limits
    - Exponential backoff for violations
    - Request timing and statistics
    - Memory-efficient cleanup
    """

    def __init__(
        self,
        requests_per_minute: int = 30,
        requests_per_hour: int = 1000,
        burst_limit: int = 10,
        cleanup_interval: int = 300,  # 5 minutes
    ):
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self.burst_limit = burst_limit
        self.cleanup_interval = cleanup_interval
        self.logger = logger.bind(component="rate_limiter")

        # Rate limiting storage
        self._minute_requests: dict[str, deque] = defaultdict(deque)
        self._hour_requests: dict[str, deque] = defaultdict(deque)
        self._burst_requests: dict[str, deque] = defaultdict(deque)
        self._violation_counts: dict[str, int] = defaultdict(int)
        self._last_cleanup = time.time()

        self.logger.info(
            "Rate limiter initialized",
            requests_per_minute=requests_per_minute,
            requests_per_hour=requests_per_hour,
            burst_limit=burst_limit,
        )

    async def check_rate_limit(self, session_id: str) -> bool:
        """
        Check if session is within rate limits.

        Args:
            session_id: Session identifier

        Returns:
            True if within limits, False if rate limited

        Raises:
            RateLimitExceeded: If rate limit is exceeded
        """
        current_time = time.time()

        # Cleanup old entries periodically
        if current_time - self._last_cleanup > self.cleanup_interval:
            await self._cleanup_old_entries()
            self._last_cleanup = current_time

        # Check burst limit (last 10 seconds)
        if not self._check_burst_limit(session_id, current_time):
            self._violation_counts[session_id] += 1
            violation_count = self._violation_counts[session_id]

            self.logger.warning(
                "Burst rate limit exceeded",
                session_id=session_id[:8] + "...",
                violation_count=violation_count,
                burst_limit=self.burst_limit,
            )

            # Apply exponential backoff
            backoff_time = min(60, 2 ** min(violation_count, 6))
            await asyncio.sleep(backoff_time)

            raise RateLimitExceeded(f"Burst rate limit exceeded (backoff: {backoff_time}s)")

        # Check minute limit
        if not self._check_minute_limit(session_id, current_time):
            self._violation_counts[session_id] += 1
            self.logger.warning(
                "Per-minute rate limit exceeded",
                session_id=session_id[:8] + "...",
                limit=self.requests_per_minute,
            )
            raise RateLimitExceeded("Per-minute rate limit exceeded")

        # Check hour limit
        if not self._check_hour_limit(session_id, current_time):
            self._violation_counts[session_id] += 1
            self.logger.warning(
                "Per-hour rate limit exceeded",
                session_id=session_id[:8] + "...",
                limit=self.requests_per_hour,
            )
            raise RateLimitExceeded("Per-hour rate limit exceeded")

        # Record successful request
        self._record_request(session_id, current_time)

        # Reset violation count on successful request
        if session_id in self._violation_counts:
            self._violation_counts[session_id] = max(0, self._violation_counts[session_id] - 1)

        self.logger.debug(
            "Rate limit check passed",
            session_id=session_id[:8] + "...",
            minute_requests=len(self._minute_requests[session_id]),
            hour_requests=len(self._hour_requests[session_id]),
        )

        return True

    async def wait_if_needed(self, session_id: str) -> None:
        """
        Wait if rate limiting is needed before making a request.

        Args:
            session_id: Session identifier
        """
        current_time = time.time()

        # Check if we need to wait for burst limit
        burst_requests = self._burst_requests[session_id]
        if len(burst_requests) >= self.burst_limit:
            # Remove requests older than 10 seconds
            burst_cutoff = current_time - 10
            while burst_requests and burst_requests[0] < burst_cutoff:
                burst_requests.popleft()

            if len(burst_requests) >= self.burst_limit:
                # Calculate wait time
                oldest_request = burst_requests[0]
                wait_time = 10 - (current_time - oldest_request)
                if wait_time > 0:
                    self.logger.debug(
                        "Waiting for burst rate limit",
                        session_id=session_id[:8] + "...",
                        wait_time=f"{wait_time:.2f}s",
                    )
                    await asyncio.sleep(wait_time)

        # Check if we need to wait for minute limit
        minute_requests = self._minute_requests[session_id]
        if len(minute_requests) >= self.requests_per_minute:
            # Remove requests older than 60 seconds
            minute_cutoff = current_time - 60
            while minute_requests and minute_requests[0] < minute_cutoff:
                minute_requests.popleft()

            if len(minute_requests) >= self.requests_per_minute:
                # Calculate wait time
                oldest_request = minute_requests[0]
                wait_time = 60 - (current_time - oldest_request)
                if wait_time > 0:
                    self.logger.debug(
                        "Waiting for per-minute rate limit",
                        session_id=session_id[:8] + "...",
                        wait_time=f"{wait_time:.2f}s",
                    )
                    await asyncio.sleep(wait_time)

    def _check_burst_limit(self, session_id: str, current_time: float) -> bool:
        """Check burst limit (requests in last 10 seconds)."""
        requests = self._burst_requests[session_id]
        cutoff_time = current_time - 10

        # Remove old requests
        while requests and requests[0] < cutoff_time:
            requests.popleft()

        return len(requests) < self.burst_limit

    def _check_minute_limit(self, session_id: str, current_time: float) -> bool:
        """Check per-minute limit."""
        requests = self._minute_requests[session_id]
        cutoff_time = current_time - 60

        # Remove old requests
        while requests and requests[0] < cutoff_time:
            requests.popleft()

        return len(requests) < self.requests_per_minute

    def _check_hour_limit(self, session_id: str, current_time: float) -> bool:
        """Check per-hour limit."""
        requests = self._hour_requests[session_id]
        cutoff_time = current_time - 3600

        # Remove old requests
        while requests and requests[0] < cutoff_time:
            requests.popleft()

        return len(requests) < self.requests_per_hour

    def _record_request(self, session_id: str, current_time: float) -> None:
        """Record a successful request."""
        self._burst_requests[session_id].append(current_time)
        self._minute_requests[session_id].append(current_time)
        self._hour_requests[session_id].append(current_time)

    async def _cleanup_old_entries(self) -> None:
        """Clean up old rate limiting entries to prevent memory leaks."""
        current_time = time.time()
        cleaned_sessions = 0

        # Cleanup thresholds
        burst_cutoff = current_time - 10
        minute_cutoff = current_time - 60
        hour_cutoff = current_time - 3600

        # Get all session IDs
        all_sessions = set()
        all_sessions.update(self._burst_requests.keys())
        all_sessions.update(self._minute_requests.keys())
        all_sessions.update(self._hour_requests.keys())

        for session_id in list(all_sessions):
            # Cleanup burst requests
            burst_requests = self._burst_requests[session_id]
            while burst_requests and burst_requests[0] < burst_cutoff:
                burst_requests.popleft()

            # Cleanup minute requests
            minute_requests = self._minute_requests[session_id]
            while minute_requests and minute_requests[0] < minute_cutoff:
                minute_requests.popleft()

            # Cleanup hour requests
            hour_requests = self._hour_requests[session_id]
            while hour_requests and hour_requests[0] < hour_cutoff:
                hour_requests.popleft()

            # Remove empty deques
            if not burst_requests and not minute_requests and not hour_requests:
                if session_id in self._burst_requests:
                    del self._burst_requests[session_id]
                if session_id in self._minute_requests:
                    del self._minute_requests[session_id]
                if session_id in self._hour_requests:
                    del self._hour_requests[session_id]
                if session_id in self._violation_counts:
                    del self._violation_counts[session_id]
                cleaned_sessions += 1

        if cleaned_sessions > 0:
            self.logger.debug(
                "Cleaned up rate limiter storage",
                cleaned_sessions=cleaned_sessions,
                active_sessions=len(self._minute_requests),
            )

    async def get_rate_limit_status(self, session_id: str) -> dict[str, Any]:
        """
        Get current rate limit status for a session.

        Args:
            session_id: Session identifier

        Returns:
            Dictionary with rate limit status
        """
        current_time = time.time()

        # Count current requests
        burst_count = len([
            req for req in self._burst_requests[session_id]
            if req >= current_time - 10
        ])
        minute_count = len([
            req for req in self._minute_requests[session_id]
            if req >= current_time - 60
        ])
        hour_count = len([
            req for req in self._hour_requests[session_id]
            if req >= current_time - 3600
        ])

        return {
            "burst": {
                "limit": self.burst_limit,
                "used": burst_count,
                "remaining": max(0, self.burst_limit - burst_count),
                "reset_in": 10,
            },
            "minute": {
                "limit": self.requests_per_minute,
                "used": minute_count,
                "remaining": max(0, self.requests_per_minute - minute_count),
                "reset_in": 60,
            },
            "hour": {
                "limit": self.requests_per_hour,
                "used": hour_count,
                "remaining": max(0, self.requests_per_hour - hour_count),
                "reset_in": 3600,
            },
            "violations": self._violation_counts.get(session_id, 0),
        }

    async def get_stats(self) -> dict[str, Any]:
        """
        Get overall rate limiter statistics.

        Returns:
            Dictionary with statistics
        """
        return {
            "active_sessions": len(self._minute_requests),
            "total_violations": sum(self._violation_counts.values()),
            "cleanup_interval": self.cleanup_interval,
            "limits": {
                "burst": self.burst_limit,
                "minute": self.requests_per_minute,
                "hour": self.requests_per_hour,
            },
        }