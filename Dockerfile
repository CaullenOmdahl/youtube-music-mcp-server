FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml ./
COPY ytmusic_server ./ytmusic_server

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir . && \
    pip install --no-cache-dir uvicorn

# Set environment variable for port
ENV PORT=8081

# Expose the port
EXPOSE 8081

# Run the server
CMD ["python", "-m", "uvicorn", "ytmusic_server.server:app", "--host", "0.0.0.0", "--port", "8081"]
