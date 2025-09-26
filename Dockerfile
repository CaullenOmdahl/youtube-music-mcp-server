# Dockerfile for YouTube Music MCP Server
# This custom Dockerfile fixes the Smithery auto-generated Dockerfile syntax error

FROM python:3.12-slim-bookworm

# Set working directory
WORKDIR /app

# Set environment variables for Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies if needed
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml README.md ./
COPY src/ ./src/

# Upgrade pip and install the package
RUN pip install --upgrade pip && \
    pip install -e .

# Expose port if needed (Smithery handles this)
# EXPOSE 8000

# The entry point is handled by Smithery configuration
# The server will be started using the smithery.yaml configuration
CMD ["python", "-m", "ytmusic_server.server"]
