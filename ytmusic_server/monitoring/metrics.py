"""
Metrics collection and monitoring for the YouTube Music MCP server.
"""

import time
from typing import Any
from collections import defaultdict, deque
from datetime import datetime
from dataclasses import dataclass
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class RequestMetrics:
    """Metrics for individual requests."""
    timestamp: float
    session_id: str
    method: str
    duration: float
    success: bool
    error_type: str | None = None
    response_size: int | None = None


@dataclass
class SessionMetrics:
    """Metrics for user sessions."""
    session_id: str
    created_at: float
    last_active: float
    request_count: int = 0
    error_count: int = 0
    total_duration: float = 0.0
    avg_duration: float = 0.0


class MetricsCollector:
    """
    Comprehensive metrics collector for monitoring server performance and usage.

    Features:
    - Request timing and success/failure tracking
    - Session-based metrics aggregation
    - Rate limiting violation tracking
    - OAuth flow monitoring
    - Memory usage and performance metrics
    - Configurable retention periods
    """

    def __init__(
        self,
        retention_hours: int = 24,
        max_requests_stored: int = 10000,
        cleanup_interval: int = 3600,  # 1 hour
    ):
        self.retention_hours = retention_hours
        self.max_requests_stored = max_requests_stored
        self.cleanup_interval = cleanup_interval
        self.logger = logger.bind(component="metrics_collector")

        # Storage for metrics
        self._requests: deque = deque(maxlen=max_requests_stored)
        self._sessions: dict[str, SessionMetrics] = {}
        self._oauth_flows: dict[str, dict[str, Any]] = {}
        self._rate_limit_violations: deque = deque(maxlen=1000)
        self._error_counts: dict[str, int] = defaultdict(int)
        self._last_cleanup = time.time()

        # Server startup metrics
        self._server_start_time = time.time()
        self._total_requests = 0
        self._total_errors = 0

        self.logger.info(
            "Metrics collector initialized",
            retention_hours=retention_hours,
            max_requests_stored=max_requests_stored,
        )

    def record_request(
        self,
        session_id: str,
        method: str,
        duration: float,
        success: bool,
        error_type: str | None = None,
        response_size: int | None = None,
    ) -> None:
        """
        Record metrics for a request.

        Args:
            session_id: Session identifier
            method: API method called
            duration: Request duration in seconds
            success: Whether request was successful
            error_type: Type of error if failed
            response_size: Response size in bytes
        """
        current_time = time.time()

        # Create request metrics
        request_metrics = RequestMetrics(
            timestamp=current_time,
            session_id=session_id,
            method=method,
            duration=duration,
            success=success,
            error_type=error_type,
            response_size=response_size,
        )

        # Store request metrics
        self._requests.append(request_metrics)

        # Update session metrics
        self._update_session_metrics(session_id, duration, success, current_time)

        # Update global counters
        self._total_requests += 1
        if not success:
            self._total_errors += 1
            if error_type:
                self._error_counts[error_type] += 1

        # Periodic cleanup
        if current_time - self._last_cleanup > self.cleanup_interval:
            self._cleanup_old_metrics()
            self._last_cleanup = current_time

        self.logger.debug(
            "Request metrics recorded",
            session_id=session_id[:8] + "...",
            method=method,
            duration=f"{duration:.3f}s",
            success=success,
            error_type=error_type,
        )

    def record_oauth_flow_start(
        self,
        session_id: str,
        flow_type: str = "authorization_code_pkce",
    ) -> None:
        """
        Record the start of an OAuth flow.

        Args:
            session_id: Session identifier
            flow_type: Type of OAuth flow
        """
        self._oauth_flows[session_id] = {
            "flow_type": flow_type,
            "started_at": time.time(),
            "completed": False,
            "success": False,
            "error": None,
        }

        self.logger.debug(
            "OAuth flow started",
            session_id=session_id[:8] + "...",
            flow_type=flow_type,
        )

    def record_oauth_flow_completion(
        self,
        session_id: str,
        success: bool,
        error: str | None = None,
    ) -> None:
        """
        Record the completion of an OAuth flow.

        Args:
            session_id: Session identifier
            success: Whether flow was successful
            error: Error message if failed
        """
        if session_id in self._oauth_flows:
            flow = self._oauth_flows[session_id]
            flow["completed"] = True
            flow["success"] = success
            flow["error"] = error
            flow["duration"] = time.time() - flow["started_at"]

            self.logger.info(
                "OAuth flow completed",
                session_id=session_id[:8] + "...",
                flow_type=flow["flow_type"],
                success=success,
                duration=f"{flow['duration']:.3f}s",
                error=error,
            )

    def record_rate_limit_violation(
        self,
        session_id: str,
        violation_type: str,
        limit_type: str = "api",
    ) -> None:
        """
        Record a rate limit violation.

        Args:
            session_id: Session identifier
            violation_type: Type of violation (burst, minute, hour)
            limit_type: Type of limit (api, security)
        """
        violation = {
            "timestamp": time.time(),
            "session_id": session_id,
            "violation_type": violation_type,
            "limit_type": limit_type,
        }

        self._rate_limit_violations.append(violation)

        self.logger.warning(
            "Rate limit violation recorded",
            session_id=session_id[:8] + "...",
            violation_type=violation_type,
            limit_type=limit_type,
        )

    def _update_session_metrics(
        self,
        session_id: str,
        duration: float,
        success: bool,
        current_time: float,
    ) -> None:
        """Update metrics for a session."""
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionMetrics(
                session_id=session_id,
                created_at=current_time,
                last_active=current_time,
            )

        session = self._sessions[session_id]
        session.last_active = current_time
        session.request_count += 1
        session.total_duration += duration

        if not success:
            session.error_count += 1

        # Update average duration
        session.avg_duration = session.total_duration / session.request_count

    def _cleanup_old_metrics(self) -> None:
        """Clean up old metrics to prevent memory leaks."""
        current_time = time.time()
        retention_threshold = current_time - (self.retention_hours * 3600)

        # Clean up old requests (deque handles this automatically)
        len(self._requests)

        # Clean up old sessions
        expired_sessions = [
            session_id for session_id, session in self._sessions.items()
            if session.last_active < retention_threshold
        ]

        for session_id in expired_sessions:
            del self._sessions[session_id]

        # Clean up completed OAuth flows
        expired_flows = [
            session_id for session_id, flow in self._oauth_flows.items()
            if flow.get("completed", False) and flow["started_at"] < retention_threshold
        ]

        for session_id in expired_flows:
            del self._oauth_flows[session_id]

        # Clean up old rate limit violations
        while (self._rate_limit_violations and
               self._rate_limit_violations[0]["timestamp"] < retention_threshold):
            self._rate_limit_violations.popleft()

        if expired_sessions or expired_flows:
            self.logger.debug(
                "Cleaned up old metrics",
                expired_sessions=len(expired_sessions),
                expired_flows=len(expired_flows),
                active_sessions=len(self._sessions),
            )

    def get_summary_metrics(self) -> dict[str, Any]:
        """
        Get summary metrics for the server.

        Returns:
            Dictionary with summary metrics
        """
        current_time = time.time()
        uptime = current_time - self._server_start_time

        # Calculate recent metrics (last hour)
        hour_ago = current_time - 3600
        recent_requests = [r for r in self._requests if r.timestamp >= hour_ago]
        recent_successes = [r for r in recent_requests if r.success]
        recent_errors = [r for r in recent_requests if not r.success]

        # Calculate average response time
        if recent_requests:
            avg_response_time = sum(r.duration for r in recent_requests) / len(recent_requests)
        else:
            avg_response_time = 0.0

        # Success rate
        if recent_requests:
            success_rate = len(recent_successes) / len(recent_requests)
        else:
            success_rate = 1.0

        return {
            "server": {
                "uptime_seconds": uptime,
                "uptime_hours": uptime / 3600,
                "start_time": datetime.fromtimestamp(self._server_start_time).isoformat(),
            },
            "requests": {
                "total": self._total_requests,
                "total_errors": self._total_errors,
                "recent_hour": len(recent_requests),
                "recent_errors": len(recent_errors),
                "success_rate": success_rate,
                "avg_response_time_seconds": avg_response_time,
            },
            "sessions": {
                "active_count": len(self._sessions),
                "total_oauth_flows": len(self._oauth_flows),
                "active_oauth_flows": len([f for f in self._oauth_flows.values() if not f.get("completed", False)]),
            },
            "rate_limiting": {
                "violations_hour": len([v for v in self._rate_limit_violations if v["timestamp"] >= hour_ago]),
                "total_violations": len(self._rate_limit_violations),
            },
            "errors": dict(self._error_counts),
        }

    def get_session_metrics(self, session_id: str) -> dict[str, Any | None]:
        """
        Get metrics for a specific session.

        Args:
            session_id: Session identifier

        Returns:
            Session metrics or None if not found
        """
        if session_id not in self._sessions:
            return None

        session = self._sessions[session_id]
        oauth_flow = self._oauth_flows.get(session_id)

        return {
            "session_id": session_id,
            "created_at": datetime.fromtimestamp(session.created_at).isoformat(),
            "last_active": datetime.fromtimestamp(session.last_active).isoformat(),
            "request_count": session.request_count,
            "error_count": session.error_count,
            "error_rate": session.error_count / max(session.request_count, 1),
            "avg_response_time": session.avg_duration,
            "total_duration": session.total_duration,
            "oauth_flow": oauth_flow,
        }

    def get_performance_metrics(self) -> dict[str, Any]:
        """
        Get performance-related metrics.

        Returns:
            Performance metrics
        """
        current_time = time.time()

        # Response time percentiles (last hour)
        hour_ago = current_time - 3600
        recent_requests = [r for r in self._requests if r.timestamp >= hour_ago]

        if recent_requests:
            durations = sorted([r.duration for r in recent_requests])
            count = len(durations)

            percentiles = {
                "p50": durations[int(count * 0.5)] if count > 0 else 0,
                "p90": durations[int(count * 0.9)] if count > 0 else 0,
                "p95": durations[int(count * 0.95)] if count > 0 else 0,
                "p99": durations[int(count * 0.99)] if count > 0 else 0,
            }
        else:
            percentiles = {"p50": 0, "p90": 0, "p95": 0, "p99": 0}

        return {
            "response_time_percentiles": percentiles,
            "memory_usage": {
                "stored_requests": len(self._requests),
                "active_sessions": len(self._sessions),
                "active_oauth_flows": len(self._oauth_flows),
                "rate_limit_violations": len(self._rate_limit_violations),
            },
            "throughput": {
                "requests_per_hour": len(recent_requests),
                "requests_per_minute": len([r for r in recent_requests if r.timestamp >= current_time - 60]),
            },
        }