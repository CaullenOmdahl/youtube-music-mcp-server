"""
Health check system for monitoring server status and dependencies.
"""

import asyncio
import time
from typing import Dict, Any, Optional, List, Callable, Awaitable
from dataclasses import dataclass
from enum import Enum
import structlog

logger = structlog.get_logger(__name__)


class HealthStatus(Enum):
    """Health check status values."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class HealthCheckResult:
    """Result of a health check."""
    name: str
    status: HealthStatus
    duration_ms: float
    message: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    timestamp: float = 0.0

    def __post_init__(self):
        if self.timestamp == 0.0:
            self.timestamp = time.time()


class HealthChecker:
    """
    Comprehensive health checking system for monitoring server status.

    Features:
    - Multiple health check types (database, API, dependencies)
    - Configurable check intervals and timeouts
    - Dependency health tracking
    - Overall system health calculation
    - Health history and trending
    """

    def __init__(
        self,
        check_interval: int = 30,
        timeout_seconds: int = 10,
        history_size: int = 100,
    ):
        self.check_interval = check_interval
        self.timeout_seconds = timeout_seconds
        self.history_size = history_size
        self.logger = logger.bind(component="health_checker")

        # Health check registry
        self._checks: Dict[str, Callable[[], Awaitable[HealthCheckResult]]] = {}
        self._last_results: Dict[str, HealthCheckResult] = {}
        self._health_history: List[Dict[str, Any]] = []
        self._check_task: Optional[asyncio.Task] = None
        self._running = False

        self.logger.info(
            "Health checker initialized",
            check_interval=check_interval,
            timeout_seconds=timeout_seconds,
        )

    def register_check(
        self,
        name: str,
        check_function: Callable[[], Awaitable[HealthCheckResult]],
    ) -> None:
        """
        Register a health check function.

        Args:
            name: Health check name
            check_function: Async function that returns HealthCheckResult
        """
        self._checks[name] = check_function
        self.logger.debug("Health check registered", check_name=name)

    async def start(self) -> None:
        """Start the health checking background task."""
        if self._running:
            self.logger.warning("Health checker already running")
            return

        self._running = True
        self._check_task = asyncio.create_task(self._periodic_checks())
        self.logger.info("Health checker started")

    async def stop(self) -> None:
        """Stop the health checking background task."""
        if not self._running:
            return

        self._running = False
        if self._check_task:
            self._check_task.cancel()
            try:
                await self._check_task
            except asyncio.CancelledError:
                pass

        self.logger.info("Health checker stopped")

    async def run_checks(self) -> Dict[str, HealthCheckResult]:
        """
        Run all registered health checks.

        Returns:
            Dictionary of check names to results
        """
        results = {}

        for name, check_function in self._checks.items():
            try:
                start_time = time.time()

                # Run check with timeout
                result = await asyncio.wait_for(
                    check_function(),
                    timeout=self.timeout_seconds
                )

                # Ensure duration is set
                if result.duration_ms == 0:
                    result.duration_ms = (time.time() - start_time) * 1000

                results[name] = result
                self._last_results[name] = result

                self.logger.debug(
                    "Health check completed",
                    check_name=name,
                    status=result.status.value,
                    duration_ms=result.duration_ms,
                )

            except asyncio.TimeoutError:
                result = HealthCheckResult(
                    name=name,
                    status=HealthStatus.UNHEALTHY,
                    duration_ms=self.timeout_seconds * 1000,
                    message=f"Health check timed out after {self.timeout_seconds}s",
                )
                results[name] = result
                self._last_results[name] = result

                self.logger.error(
                    "Health check timed out",
                    check_name=name,
                    timeout_seconds=self.timeout_seconds,
                )

            except Exception as e:
                result = HealthCheckResult(
                    name=name,
                    status=HealthStatus.UNHEALTHY,
                    duration_ms=0,
                    message=f"Health check failed: {str(e)}",
                )
                results[name] = result
                self._last_results[name] = result

                self.logger.error(
                    "Health check failed",
                    check_name=name,
                    error=str(e),
                )

        return results

    async def get_health_status(self) -> Dict[str, Any]:
        """
        Get current health status.

        Returns:
            Dictionary with overall health status and check results
        """
        # Run checks if needed
        if not self._last_results:
            await self.run_checks()

        # Calculate overall status
        overall_status = self._calculate_overall_status()

        # Get summary statistics
        check_count = len(self._last_results)
        healthy_count = len([r for r in self._last_results.values() if r.status == HealthStatus.HEALTHY])
        degraded_count = len([r for r in self._last_results.values() if r.status == HealthStatus.DEGRADED])
        unhealthy_count = len([r for r in self._last_results.values() if r.status == HealthStatus.UNHEALTHY])

        return {
            "status": overall_status.value,
            "timestamp": time.time(),
            "checks": {
                name: {
                    "status": result.status.value,
                    "duration_ms": result.duration_ms,
                    "message": result.message,
                    "details": result.details,
                    "timestamp": result.timestamp,
                }
                for name, result in self._last_results.items()
            },
            "summary": {
                "total_checks": check_count,
                "healthy": healthy_count,
                "degraded": degraded_count,
                "unhealthy": unhealthy_count,
            },
        }

    def _calculate_overall_status(self) -> HealthStatus:
        """Calculate overall health status from individual checks."""
        if not self._last_results:
            return HealthStatus.UNKNOWN

        statuses = [result.status for result in self._last_results.values()]

        # If any checks are unhealthy, system is unhealthy
        if HealthStatus.UNHEALTHY in statuses:
            return HealthStatus.UNHEALTHY

        # If any checks are degraded, system is degraded
        if HealthStatus.DEGRADED in statuses:
            return HealthStatus.DEGRADED

        # If all checks are healthy, system is healthy
        if all(status == HealthStatus.HEALTHY for status in statuses):
            return HealthStatus.HEALTHY

        # Default to unknown
        return HealthStatus.UNKNOWN

    async def _periodic_checks(self) -> None:
        """Background task for periodic health checks."""
        self.logger.info("Started periodic health checks")

        while self._running:
            try:
                check_start = time.time()

                # Run all health checks
                results = await self.run_checks()

                # Record health snapshot
                overall_status = self._calculate_overall_status()
                health_snapshot = {
                    "timestamp": time.time(),
                    "overall_status": overall_status.value,
                    "check_count": len(results),
                    "healthy_count": len([r for r in results.values() if r.status == HealthStatus.HEALTHY]),
                    "unhealthy_count": len([r for r in results.values() if r.status == HealthStatus.UNHEALTHY]),
                    "avg_duration_ms": sum(r.duration_ms for r in results.values()) / len(results) if results else 0,
                }

                self._health_history.append(health_snapshot)

                # Limit history size
                if len(self._health_history) > self.history_size:
                    self._health_history.pop(0)

                check_duration = time.time() - check_start

                self.logger.debug(
                    "Periodic health check completed",
                    overall_status=overall_status.value,
                    check_count=len(results),
                    duration=f"{check_duration:.3f}s",
                )

                # Wait for next check interval
                await asyncio.sleep(self.check_interval)

            except asyncio.CancelledError:
                self.logger.info("Periodic health checks cancelled")
                break
            except Exception as e:
                self.logger.error(
                    "Error in periodic health checks",
                    error=str(e),
                )
                # Continue after error, but wait a bit
                await asyncio.sleep(min(self.check_interval, 30))

    def get_health_history(self) -> List[Dict[str, Any]]:
        """
        Get health check history.

        Returns:
            List of health snapshots
        """
        return self._health_history.copy()

    async def check_database_connectivity(self) -> HealthCheckResult:
        """Example database connectivity check."""
        start_time = time.time()

        try:
            # This would check database connectivity
            # For now, simulate a check
            await asyncio.sleep(0.01)  # Simulate DB query

            duration_ms = (time.time() - start_time) * 1000

            return HealthCheckResult(
                name="database",
                status=HealthStatus.HEALTHY,
                duration_ms=duration_ms,
                message="Database connection successful",
                details={"connection_pool": "active"},
            )

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return HealthCheckResult(
                name="database",
                status=HealthStatus.UNHEALTHY,
                duration_ms=duration_ms,
                message=f"Database connection failed: {str(e)}",
            )

    async def check_ytmusic_api(self) -> HealthCheckResult:
        """Example YouTube Music API connectivity check."""
        start_time = time.time()

        try:
            # This would check API connectivity
            # For now, simulate a check
            await asyncio.sleep(0.05)  # Simulate API call

            duration_ms = (time.time() - start_time) * 1000

            return HealthCheckResult(
                name="ytmusic_api",
                status=HealthStatus.HEALTHY,
                duration_ms=duration_ms,
                message="YouTube Music API accessible",
                details={"api_version": "v1", "rate_limit_ok": True},
            )

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return HealthCheckResult(
                name="ytmusic_api",
                status=HealthStatus.UNHEALTHY,
                duration_ms=duration_ms,
                message=f"YouTube Music API check failed: {str(e)}",
            )

    async def check_memory_usage(self) -> HealthCheckResult:
        """Example memory usage health check."""
        start_time = time.time()

        try:
            import psutil
            memory = psutil.virtual_memory()
            memory_percent = memory.percent

            duration_ms = (time.time() - start_time) * 1000

            if memory_percent < 80:
                status = HealthStatus.HEALTHY
                message = f"Memory usage normal: {memory_percent:.1f}%"
            elif memory_percent < 90:
                status = HealthStatus.DEGRADED
                message = f"Memory usage high: {memory_percent:.1f}%"
            else:
                status = HealthStatus.UNHEALTHY
                message = f"Memory usage critical: {memory_percent:.1f}%"

            return HealthCheckResult(
                name="memory",
                status=status,
                duration_ms=duration_ms,
                message=message,
                details={
                    "memory_percent": memory_percent,
                    "total_gb": round(memory.total / (1024**3), 2),
                    "available_gb": round(memory.available / (1024**3), 2),
                },
            )

        except ImportError:
            # psutil not available
            duration_ms = (time.time() - start_time) * 1000
            return HealthCheckResult(
                name="memory",
                status=HealthStatus.UNKNOWN,
                duration_ms=duration_ms,
                message="Memory monitoring not available (psutil not installed)",
            )
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return HealthCheckResult(
                name="memory",
                status=HealthStatus.UNHEALTHY,
                duration_ms=duration_ms,
                message=f"Memory check failed: {str(e)}",
            )