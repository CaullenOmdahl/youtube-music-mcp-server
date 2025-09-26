FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml README.md ./
COPY ytmusic_server ./ytmusic_server

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# Set environment variable for port (Smithery expects 8081)
ENV PORT=8081
ENV SMITHERY_PORT=8081

# Expose the port
EXPOSE 8081

# Run the server using smithery CLI which properly handles the FastMCP server
CMD ["python", "-m", "smithery.cli.dev", "--port", "8081", "--host", "0.0.0.0"]
