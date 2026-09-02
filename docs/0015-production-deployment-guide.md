# 0015: Production Deployment Guide (Docker Compose, Synology NAS, & Bare Metal)

This guide details how to deploy **MyKrawl** in production environments, including Docker Compose, Synology NAS (Container Manager / DSM Reverse Proxy), and Linux systemd services.

---

## 1. Quick Start via Docker Compose (Recommended)

### Prerequisites
- Docker Engine >= 24.0
- Docker Compose >= 2.20

### 1-Command Deployment
1. Clone the repository and navigate to the project root:
   ```bash
   git clone https://github.com/marcuz-apl/MyKrawl.git
   cd MyKrawl
   ```
2. Copy and configure the environment variables:
   ```bash
   cp .env.example .env
   # Edit .env to set your secure secret key and admin credentials
   ```
3. Start the container in detached mode:
   ```bash
   docker compose up -d --build
   ```
4. Access the web workbench at **`http://localhost:4040`** (or your server's local/public IP).

### Inspecting Logs & Health
```bash
# View live application logs
docker compose logs -f mykrawl

# Check container health status
docker compose ps
```

---

## 2. Deploying on Synology NAS (Container Manager / DSM)

Deploying MyKrawl on Synology NAS provides automatic restarts, persistent storage, and built-in SSL reverse proxying.

### Step 1: Storage Setup in File Station
Create a directory structure on your storage pool:
- `/volume1/docker/mykrawl`
- `/volume1/docker/mykrawl/data` (holds `mykrawl.db` and exports)

### Step 2: Launch via Synology Container Manager
1. Open **Container Manager** in DSM.
2. Go to **Project** -> **Create**.
3. Set Project Name: `mykrawl`.
4. Path: `/docker/mykrawl`.
5. Source: Select **Create docker-compose.yml** and paste the following:

```yaml
services:
  mykrawl:
    build:
      context: .
      dockerfile: Dockerfile
    image: mykrawl:latest
    container_name: mykrawl
    restart: unless-stopped
    ports:
      - "4040:4040"
    volumes:
      - ./data:/app/data
    environment:
      - MYKRAWL_SECRET_KEY=replace-with-a-secure-random-key
      - MYKRAWL_ADMIN_USER=admin
      - MYKRAWL_ADMIN_PASSWORD=admin123
      - MYKRAWL_COOKIE_SECURE=false # Set to true if accessing strictly via HTTPS domain
      - MYKRAWL_MAX_CONCURRENT_JOBS=4
      - MYKRAWL_MAX_PARALLEL_TARGETS_PER_JOB=10
      - MYKRAWL_DEFAULT_SPLIT_SIZE_MB=40
      - MYKRAWL_ROBOTS_TXT_ENABLED=true
      - MYKRAWL_PER_DOMAIN_INTERVAL_S=1.0
      - MYKRAWL_SSRF_GUARD_ENABLED=true
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4040/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

### Step 3: Synology DSM Reverse Proxy Configuration (HTTPS & SSL)
To access MyKrawl securely over the internet without exposing raw ports:

1. Open **Control Panel** -> **Login Portal** -> **Advanced** -> **Reverse Proxy**.
2. Click **Create**:
   - **General Tab**:
     - **Source**:
       - Protocol: `HTTPS`
       - Hostname: `mykrawl.your-domain.com` (or your Synology DDNS: `*.synology.me`)
       - Port: `443`
       - Enable HSTS: Checked
     - **Destination**:
       - Protocol: `HTTP`
       - Hostname: `localhost` (or `127.0.0.1`)
       - Port: `4040`
   - **Custom Header Tab**:
     - Click **Create** -> **WebSocket**.
     - This automatically adds `Upgrade: $http_upgrade` and `Connection: $connection_upgrade`, which is required for live crawl progress streaming and log views.
3. Assign a free Let's Encrypt SSL Certificate to `mykrawl.your-domain.com` in **Security** -> **Certificate**.

### Access URLs:
- **Via HTTPS Reverse Proxy**: `https://mykrawl.your-domain.com`
- **Via Local Home Network (Direct LAN)**: `http://<SYNOLOGY_LOCAL_IP>:4040` (e.g. `http://192.168.1.100:4040`)

---

## 3. Docker Storage & Persistence

The container maps the host directory `./data` to `/app/data`:
- **`data/mykrawl.db`**: SQLite database storing jobs, schedules, users, and saved datasets.
- **`data/exports/`**: CSV and XLSX export files generated from crawls and datasets.
- **WAL Journals**: SQLite Write-Ahead Log (`mykrawl.db-wal`) is automatically preserved.
- **Backup Command**:
  ```bash
  # Backup SQLite database cleanly while running:
  sqlite3 data/mykrawl.db ".backup 'data/backup-$(date +%Y%m%d).db'"
  ```

---

## 4. Alternative: Bare-Metal Linux Service (Systemd)

For non-containerized Linux hosts:

1. **Build the Frontend SPA**:
   ```bash
   cd frontend
   npm ci
   npm run build
   ```

2. **Setup Python Virtual Environment**:
   ```bash
   cd ../backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -e .
   pip install trafilatura scrapy playwright
   playwright install chromium
   playwright install-deps chromium
   ```

3. **Create Systemd Unit (`/etc/systemd/system/mykrawl.service`)**:
   ```ini
   [Unit]
   Description=MyKrawl Web Scraping Workbench
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/MyKrawl/backend
   EnvironmentFile=/var/www/MyKrawl/.env
   ExecStart=/var/www/MyKrawl/backend/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 4040
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

4. **Enable & Start**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now mykrawl
   ```

---

## 5. Other Reverse Proxy Configurations

### Nginx Example
```nginx
server {
    listen 80;
    server_name mykrawl.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mykrawl.example.com;

    ssl_certificate /etc/letsencrypt/live/mykrawl.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mykrawl.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4040;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket & Server-Sent Events (SSE) support for live crawl progress
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache off;
    }
}
```

### Caddy Example
```caddy
mykrawl.example.com {
    reverse_proxy 127.0.0.1:4040 {
        flush_interval -1
    }
}
```
