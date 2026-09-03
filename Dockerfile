# ==========================================
# Stage 1: Build React SPA Frontend
# ==========================================
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Python Wheel & Dependency Builder
# ==========================================
FROM python:3.12-slim AS python-builder

WORKDIR /build
ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install build toolchain only in this builder stage
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Extract and install dependencies directly from pyproject.toml
COPY backend/pyproject.toml ./backend/
RUN pip install --upgrade pip setuptools wheel && \
    python -c 'import tomllib; open("requirements.txt", "w").write("\n".join(tomllib.load(open("backend/pyproject.toml", "rb"))["project"]["dependencies"]))' && \
    pip install -r requirements.txt && \
    pip install patchright

# Strip unit tests, compiled bytecode, and C headers from site-packages
RUN find /opt/venv/lib/python3.12/site-packages -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true && \
    find /opt/venv/lib/python3.12/site-packages -name "*.pyc" -delete && \
    find /opt/venv/lib/python3.12/site-packages -name "*.h" -delete

# ==========================================
# Stage 3: Minimal Production Runtime
# ==========================================
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DEBIAN_FRONTEND=noninteractive \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH="/app/backend"

WORKDIR /app

# Copy virtualenv from builder stage (zero compiler/build tools in runtime)
COPY --from=python-builder /opt/venv /opt/venv

# Install curl (healthchecks), ca-certificates, and Patchright Chromium OS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && patchright install-deps chromium \
    && patchright install chromium \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /root/.cache \
    && find /ms-playwright -name "*.zip" -delete

# Optional Go engine: place static patroy binary into /usr/local/bin if bundled
# (Patroy can also be mounted at runtime or connected via microservice daemon)

# Copy backend application source and version
COPY backend/ /app/backend/
COPY VERSION /app/VERSION

# Copy pre-built frontend SPA
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Persistent SQLite database & export files volume
RUN mkdir -p /app/data && chmod 777 /app/data
VOLUME ["/app/data"]

EXPOSE 4040

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:4040/api/health || exit 1

WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4040"]
