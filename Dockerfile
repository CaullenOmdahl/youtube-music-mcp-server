FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml README.md ./
COPY ytmusic_server ./ytmusic_server
COPY main_mcp_oauth.py oauth_handler.py ./

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir . && \
    pip install --no-cache-dir uvicorn starlette httpx

# Set environment variables
ENV PORT=8081
ENV TRANSPORT=http

# Expose the port
EXPOSE 8081

# Run the unified MCP-OAuth server
CMD ["python", "main_mcp_oauth.py"]
