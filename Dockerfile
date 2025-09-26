# Custom Dockerfile for YouTube Music MCP Server
# Overrides Smithery's auto-generated Dockerfile

FROM ghcr.io/astral-sh/uv:python3.12-alpine AS builder

# Set working directory
WORKDIR /app

# Enable bytecode compilation for better performance
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies using uv with the lock file
RUN uv sync --frozen --no-install-project --no-dev

# Copy the rest of the application
COPY . .

# Install the project itself
RUN uv sync --frozen --no-dev

# Final stage - use a slim image
FROM python:3.12-alpine

WORKDIR /app

# Copy the virtual environment from builder
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src /app/src
COPY --from=builder /app/pyproject.toml /app/pyproject.toml

# Set environment to use the virtual environment
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/app/.venv

# The entry point will be handled by Smithery
ENTRYPOINT []
CMD ["python", "-m", "ytmusic_server.server"]
