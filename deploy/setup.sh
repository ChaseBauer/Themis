#!/usr/bin/env bash
# Themis online setup. Downloads the compose file, generates secrets, and starts the stack.
# Usage: curl -fsSL https://raw.githubusercontent.com/ChaseBauer/Themis/main/deploy/setup.sh | bash
set -euo pipefail

REGISTRY="ghcr.io/chasebauer"
TAG="${THEMIS_VERSION:-latest}"
RAW="https://raw.githubusercontent.com/ChaseBauer/Themis/main"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; NC='\033[0m'
info()    { echo -e "${CYAN}[themis]${NC} $*"; }
success() { echo -e "${GREEN}[themis]${NC} $*"; }

# Deps
for cmd in docker curl openssl; do
    command -v "$cmd" &>/dev/null || { echo "ERROR: $cmd is required but not installed." >&2; exit 1; }
done
docker compose version &>/dev/null 2>&1 || { echo "ERROR: docker compose plugin is required." >&2; exit 1; }

# Download files
info "Downloading Themis ${TAG}..."
curl -fsSL "${RAW}/docker-compose.standalone.yml" -o docker-compose.yml
curl -fsSL "${RAW}/vendor_profiles.toml"          -o vendor_profiles.toml

# Generate env file
if [[ -f .env ]]; then
    info ".env already exists, skipping secret generation."
else
    info "Generating secrets..."
    cat > .env <<EOF
IMAGE_REGISTRY=${REGISTRY}
IMAGE_TAG=${TAG}

JWT_SECRET=$(openssl rand -hex 48)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_USER=themis
POSTGRES_DB=themis

HTTP_PORT=${HTTP_PORT:-80}
BACKEND_PORT=${BACKEND_PORT:-8080}
MAX_GOLDEN_CONFIGS=10
RUST_LOG=themis_backend=info
EOF
    chmod 600 .env
fi

# Start
info "Pulling images and starting Themis..."
docker compose pull
docker compose up -d

success "Themis is running!"
echo
echo -e "  ${CYAN}URL:${NC}  http://$(hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0 2>/dev/null || echo localhost):${HTTP_PORT:-80}"
echo
echo "  The first user to register gets the admin role."
echo "  To stop:    docker compose down"
echo "  To upgrade: docker compose pull && docker compose up -d"
echo
