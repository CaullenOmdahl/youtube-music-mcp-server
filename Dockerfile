FROM python:3.12-slim

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py ./

# Set environment variables for HTTP mode
ENV PORT=8081
ENV TRANSPORT=http
ENV HOST=0.0.0.0

# Expose the port
EXPOSE 8081

# Run the MCP server
CMD ["python", "main.py"]
