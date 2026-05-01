#!/usr/bin/env bash
# Themis portable bundle builder.
# The output is a single archive that can be transferred to a target machine.
#
# Usage:
#   ./deploy/bundle.sh [VERSION] [local]
#
#   VERSION   Image tag to pull from GHCR (default: latest).
#             Ignored when local mode is set.
#   local     Build images from source instead of pulling from GHCR.
#             Use this before cutting a release or when you have no registry access.
#
# Examples:
#   ./deploy/bundle.sh v0.1.0          # pull v0.1.0 from GHCR
#   ./deploy/bundle.sh local         # build from source, tag as "local"
#   ./deploy/bundle.sh v0.1.0 local  # build from source, tag as v0.1.0
#
# Output: themis-<version>.tar.gz
set -euo pipefail

# Args
LOCAL=false
VERSION=""
for arg in "$@"; do
    case "$arg" in
        local) LOCAL=true ;;
        *)       VERSION="$arg" ;;
    esac
done

# Default version: latest git tag, or "dev" if no tags exist
if [[ -z "$VERSION" ]]; then
    VERSION="$(git -C "$(dirname "${BASH_SOURCE[0]}")" describe --tags --abbrev=0 2>/dev/null || echo "dev")"
fi

REGISTRY="ghcr.io/chasebauer"
BUNDLE_DIR="themis-${VERSION}"
IMAGES_DIR="${BUNDLE_DIR}/images"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; NC='\033[0m'
info()    { echo -e "${CYAN}[bundle]${NC} $*"; }
success() { echo -e "${GREEN}[bundle]${NC} $*"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Deps
for cmd in docker; do
    command -v "$cmd" &>/dev/null || { echo "ERROR: $cmd is required." >&2; exit 1; }
done
docker compose version &>/dev/null 2>&1 || { echo "ERROR: docker compose plugin is required." >&2; exit 1; }

# Clean previous build
rm -rf "${BUNDLE_DIR}" "${BUNDLE_DIR}.tar.gz"
mkdir -p "${IMAGES_DIR}"

BACKEND_IMAGE="${REGISTRY}/themis-backend:${VERSION}"
FRONTEND_IMAGE="${REGISTRY}/themis-frontend:${VERSION}"
POSTGRES_IMAGE="postgres:16-alpine"

# Build or pull images
if [[ "$LOCAL" == true ]]; then
    info "Building images from source (version: ${VERSION})..."
    docker build -t "${BACKEND_IMAGE}"  "${REPO_ROOT}/backend"
    docker build -t "${FRONTEND_IMAGE}" "${REPO_ROOT}/frontend"
    docker pull "${POSTGRES_IMAGE}"
else
    info "Pulling images for version ${VERSION} from GHCR..."
    docker pull "${BACKEND_IMAGE}"
    docker pull "${FRONTEND_IMAGE}"
    docker pull "${POSTGRES_IMAGE}"
fi

# Save images to tars
info "Saving images..."
docker save "${BACKEND_IMAGE}"  | gzip > "${IMAGES_DIR}/themis-backend.tar.gz"
docker save "${FRONTEND_IMAGE}" | gzip > "${IMAGES_DIR}/themis-frontend.tar.gz"
docker save "${POSTGRES_IMAGE}" | gzip > "${IMAGES_DIR}/postgres.tar.gz"

# Copy app files
info "Copying app files..."
cp "${REPO_ROOT}/docker-compose.standalone.yml" "${BUNDLE_DIR}/docker-compose.yml"
cp "${REPO_ROOT}/vendor_profiles.toml"          "${BUNDLE_DIR}/vendor_profiles.toml"
cp "${REPO_ROOT}/.env.example"                  "${BUNDLE_DIR}/.env.example"

# Write start.sh
cat > "${BUNDLE_DIR}/start.sh" <<STARTSCRIPT
#!/usr/bin/env bash
# Themis portable bundle installer.
# Run this on the target machine after copying the bundle.
set -euo pipefail

BUNDLE_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "\${CYAN}[themis]\${NC} \$*"; }
success() { echo -e "\${GREEN}[themis]\${NC} \$*"; }
warn()    { echo -e "\${YELLOW}[themis]\${NC} \$*"; }

for cmd in docker openssl; do
    command -v "\$cmd" &>/dev/null || { echo "ERROR: \$cmd is required." >&2; exit 1; }
done
docker compose version &>/dev/null 2>&1 || { echo "ERROR: docker compose plugin is required." >&2; exit 1; }

cd "\${BUNDLE_DIR}"

info "Loading Docker images (this takes a minute)..."
for tar in images/*.tar.gz; do
    info "  Loading \${tar}..."
    docker load < "\${tar}"
done

if [[ -f .env ]]; then
    warn ".env already exists, skipping secret generation."
else
    info "Generating secrets..."
    cat > .env <<EOF
IMAGE_REGISTRY=${REGISTRY}
IMAGE_TAG=${VERSION}

JWT_SECRET=\$(openssl rand -hex 48)
POSTGRES_PASSWORD=\$(openssl rand -hex 16)
POSTGRES_USER=themis
POSTGRES_DB=themis

HTTP_PORT=\${HTTP_PORT:-80}
BACKEND_PORT=\${BACKEND_PORT:-8080}
MAX_GOLDEN_CONFIGS=10
RUST_LOG=themis_backend=info
EOF
    chmod 600 .env
fi

info "Starting Themis..."
docker compose up -d

success "Themis is running!"
echo
echo -e "  \${CYAN}URL:\${NC}  http://\$(hostname -I 2>/dev/null | awk '{print \$1}' || ipconfig getifaddr en0 2>/dev/null || echo localhost):\${HTTP_PORT:-80}"
echo
echo "  The first user to register gets the admin role."
echo "  To stop:    docker compose down"
echo "  To restart: docker compose up -d"
echo
STARTSCRIPT
chmod +x "${BUNDLE_DIR}/start.sh"

# Write README
cat > "${BUNDLE_DIR}/README.txt" <<README
Themis ${VERSION} Bundle
========================

Requirements on the target machine:
  - Docker Engine
  - Docker Compose plugin  (verify: docker compose version)
  - No internet connection required

Install:
  1. Copy this folder to the target machine (USB, SFTP, SCP, etc.)
  2. Run: ./start.sh

The start.sh script will:
  - Load the Docker images from the images/ directory
  - Generate a secure .env with random secrets
  - Start the Themis stack

Access:
  Open http://<machine-IP> in a browser.
  The first user to register gets the admin role.

Useful commands (run from this directory):
  docker compose logs -f backend  , tail backend logs
  docker compose down             , stop all services
  docker compose up -d            , start again
  cat .env                        , view generated secrets
README

# Package
info "Creating archive..."
tar czf "${BUNDLE_DIR}.tar.gz" "${BUNDLE_DIR}"
rm -rf "${BUNDLE_DIR}"

BUNDLE_SIZE=$(du -sh "${BUNDLE_DIR}.tar.gz" | cut -f1)
success "Bundle created: ${BUNDLE_DIR}.tar.gz (${BUNDLE_SIZE})"
echo
echo "  Transfer to target machine and run:"
echo "    tar xzf ${BUNDLE_DIR}.tar.gz"
echo "    cd ${BUNDLE_DIR}"
echo "    ./start.sh"
echo
