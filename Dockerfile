# Stage 1: Build the React SPA Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Python Runtime with Playwright & Crawl Engines
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1     PYTHONDONTWRITEBYTECODE=1     PLAYWRIGHT_BROWSERS_PATH=/ms-playwright     DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies, curl for healthchecks, and Playwright OS requirements
RUN apt-get update && apt-get install -y --no-install-recommends     curl     ca-certificates     build-essential     && rm -rf /var/lib/apt/lists/*

# Copy backend source and project metadata
COPY backend/ /app/backend/
COPY VERSION /app/VERSION

RUN pip install --no-cache-dir --upgrade pip setuptools wheel &&     pip install --no-cache-dir -e /app/backend &&     pip install --no-cache-dir crawl4ai scrapy playwright &&     playwright install-deps chromium &&     playwright install chromium &&     rm -rf /root/.cache

# Copy compiled frontend SPA from builder stage
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Create persistent data directory for SQLite database & export files
RUN mkdir -p /app/data && chmod 777 /app/data
VOLUME ["/app/data"]

EXPOSE 4040

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3     CMD curl -f http://localhost:4040/api/health || exit 1

WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4040"]
