#!/usr/bin/env bash
# Packer provisioning script. Runs inside the VM during OVA build.
# Installs Docker, configures Themis to start on boot, and lays down all
# runtime files.  The actual Docker images are pulled on first boot, not
# baked in, keeping the OVA small.
set -euo pipefail

THEMIS_VERSION="${THEMIS_VERSION:-latest}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-ghcr.io/your-org}"
THEMIS_DIR="/opt/themis"

echo "==> Waiting for apt lock to clear..."
for i in $(seq 1 30); do
    flock -n /var/lib/dpkg/lock-frontend true 2>/dev/null && break || sleep 5
done

echo "==> Updating packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get -qq update
apt-get -qq install -y \
    ca-certificates curl gnupg lsb-release \
    apt-transport-https software-properties-common \
    htop net-tools dnsutils unzip

# Docker
echo "==> Installing Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get -qq update
apt-get -qq install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

usermod -aG docker themis
systemctl enable docker

# ── App files ─────────────────────────────────────────────────────────────────
echo "==> Installing Themis app files to ${THEMIS_DIR}..."
mkdir -p "${THEMIS_DIR}"

# vendor_profiles.toml (uploaded by Packer file provisioner)
cp /tmp/vendor_profiles.toml "${THEMIS_DIR}/vendor_profiles.toml"

# docker-compose.prod.yml, written inline so the OVA is self-contained
cat > "${THEMIS_DIR}/docker-compose.yml" <<'COMPOSE'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-themis}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}
      POSTGRES_DB: ${POSTGRES_DB:-themis}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-themis}']
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  backend:
    image: ${IMAGE_REGISTRY}/themis-backend:${THEMIS_VERSION}
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-themis}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-themis}
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET must be set}
      MAX_GOLDEN_CONFIGS: ${MAX_GOLDEN_CONFIGS:-10}
      RUST_LOG: ${RUST_LOG:-themis_backend=info}
      VENDOR_PROFILES_PATH: /etc/themis/vendor_profiles.toml
    volumes:
      - ./vendor_profiles.toml:/etc/themis/vendor_profiles.toml:ro
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - '${BACKEND_PORT:-8080}:8080'
    restart: unless-stopped

  frontend:
    image: ${IMAGE_REGISTRY}/themis-frontend:${THEMIS_VERSION}
    ports:
      - '${HTTP_PORT:-80}:80'
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  pgdata:
COMPOSE

# .env template, populated by first-boot script
cat > "${THEMIS_DIR}/.env.template" <<ENV
JWT_SECRET=REPLACE_ME
POSTGRES_PASSWORD=REPLACE_ME
POSTGRES_USER=themis
POSTGRES_DB=themis
HTTP_PORT=80
BACKEND_PORT=8080
MAX_GOLDEN_CONFIGS=10
RUST_LOG=themis_backend=info
IMAGE_REGISTRY=${IMAGE_REGISTRY}
THEMIS_VERSION=${THEMIS_VERSION}
ENV

# First-boot script
cat > /usr/local/bin/themis-firstboot <<'FIRSTBOOT'
#!/usr/bin/env bash
# Runs once on first boot to generate secrets, pull images, and start the stack.
set -euo pipefail
THEMIS_DIR="/opt/themis"
STAMP="${THEMIS_DIR}/.firstboot-done"

[[ -f "$STAMP" ]] && exit 0

echo "[themis] First boot, configuring..."

# Generate secrets
JWT_SECRET="$(openssl rand -hex 48)"
POSTGRES_PASSWORD="$(openssl rand -hex 16)"

# Write .env from template
sed \
    -e "s/REPLACE_ME_JWT/${JWT_SECRET}/g" \
    -e "s/REPLACE_ME_PG/${POSTGRES_PASSWORD}/g" \
    "${THEMIS_DIR}/.env.template" | \
    sed \
        -e "s/JWT_SECRET=REPLACE_ME/JWT_SECRET=${JWT_SECRET}/" \
        -e "s/POSTGRES_PASSWORD=REPLACE_ME/POSTGRES_PASSWORD=${POSTGRES_PASSWORD}/" \
    > "${THEMIS_DIR}/.env"

chmod 600 "${THEMIS_DIR}/.env"

echo "[themis] Pulling Docker images..."
cd "${THEMIS_DIR}"
docker compose pull

echo "[themis] Starting Themis..."
docker compose up -d

touch "$STAMP"
passwd -l themis >/dev/null 2>&1 || true
echo "[themis] First-boot complete."

# Print the access URL to the console / serial log
IP=$(ip -4 addr show scope global | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Themis is running!                           ║"
echo "║  Open: http://${IP:-<VM-IP>}                 ║"
echo "║  Register first. First user becomes admin.   ║"
echo "╚══════════════════════════════════════════════╝"
FIRSTBOOT
chmod +x /usr/local/bin/themis-firstboot

# systemd units
cat > /etc/systemd/system/themis-firstboot.service <<UNIT
[Unit]
Description=Themis first-boot setup
After=network-online.target docker.service
Wants=network-online.target
ConditionPathExists=!/opt/themis/.firstboot-done

[Service]
Type=oneshot
ExecStart=/usr/local/bin/themis-firstboot
RemainAfterExit=yes
StandardOutput=journal+console
StandardError=journal+console

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/themis.service <<UNIT
[Unit]
Description=Themis stack
After=docker.service themis-firstboot.service
Requires=docker.service
Wants=themis-firstboot.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/themis
EnvironmentFile=/opt/themis/.env
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
UNIT

systemctl enable themis-firstboot.service
systemctl enable themis.service

# MOTD
cat > /etc/motd <<'MOTD'

  ╔══════════════════════════════════════════════════════════╗
  ║  Themis Network Configuration Management Platform        ║
  ║                                                          ║
  ║  App directory:   /opt/themis                             ║
  ║  Logs:            sudo docker compose -C /opt/themis logs ║
  ║  Restart:         sudo systemctl restart themis           ║
  ║  Config:          sudo nano /opt/themis/.env              ║
  ╚══════════════════════════════════════════════════════════╝

MOTD

# Hardening
echo "==> Applying basic hardening..."

# Disable password auth if key is present at runtime (best-effort)
sed -i 's/^#\?PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Firewall. Allow SSH (22), HTTP (80), HTTPS (443), backend (8080)
apt-get -qq install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8080/tcp
ufw --force enable

# Cleanup
echo "==> Cleaning up..."
apt-get -qq autoremove -y
apt-get -qq clean
rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
# Zero free space for better OVA compression
dd if=/dev/zero of=/EMPTY bs=1M 2>/dev/null || true
rm -f /EMPTY
sync

echo "==> Provisioning complete."
