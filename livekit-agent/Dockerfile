FROM python:3.12-slim

WORKDIR /app

# Install build and runtime dependencies
# LiveKit requires GLib for audio/video processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libglib2.0-0 \
    libgstreamer1.0-0 \
    libgstreamer-plugins-base1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY agent.py .

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash agent
USER agent

# LiveKit agent starts with the "start" command
CMD ["python", "agent.py", "start"]
