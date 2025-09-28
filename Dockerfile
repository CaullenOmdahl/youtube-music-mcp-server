FROM python:3.12-slim AS builder

# Security: Create non-root user
RUN groupadd -r ytmusic && useradd -r -g ytmusic ytmusic

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Set up Python environment
WORKDIR /app
COPY pyproject.toml README.md ./
COPY ytmusic_server ./ytmusic_server

# Install dependencies with cache for faster builds
RUN pip install --upgrade pip setuptools wheel && \
    pip install .

FROM python:3.12-slim AS runtime

# Security: Create non-root user
RUN groupadd -r ytmusic && useradd -r -g ytmusic ytmusic

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up application directory
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code is already copied in builder stage
# Just copy any additional files needed at runtime
COPY README.md ./

# Security: Set ownership and permissions
RUN chown -R ytmusic:ytmusic /app && \
    chmod -R 755 /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8081}/health || exit 1

# Security: Run as non-root user
USER ytmusic

# Environment variables
ENV PYTHONPATH=/app \
    PORT=8081 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Expose port
EXPOSE 8081

# Run the application
CMD ["python", "-m", "ytmusic_server.server"]