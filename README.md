# Themis

Themis is a network configuration management app for tracking device configs, reviewing changes, deploying over SSH, and detecting golden-config drift.

## Recommended Deployment: Bundle

The recommended deployment method for every environment is the bundle. It produces one archive that contains the required Docker images, compose file, startup script, and default configuration. This makes installs repeatable and avoids pulling dependencies during install.

## Requirements

On the target server:

- Linux server or VM
- Docker Engine
- Docker Compose plugin

On the build machine:

- Docker Engine
- Docker Compose plugin
- Internet access to pull base images and Postgres

## Build the Bundle

From the repo:

```bash
./deploy/bundle.sh v0.1.0
```

This creates:

```text
themis-v0.1.0.tar.gz
```

The bundle command builds Themis from your local source tree and packages it with Postgres.

## Install on the Target Server

Copy the archive to the target server, then run:

```bash
tar xzf themis-v0.1.0.tar.gz
cd themis-v0.1.0
./start.sh
```

The installer will:

- Load the Docker images
- Generate `.env` with random secrets
- Start Postgres, backend, and frontend

Open:

```text
http://<server-ip>
```

The first registered user becomes the admin.

## Day-2 Commands

Run these from the extracted bundle directory:

```bash
docker compose ps
docker compose logs -f backend
docker compose up -d
docker compose down
```

## Upgrading

Build or download a newer bundle, copy it to the server, and run:

```bash
tar xzf themis-vX.Y.Z.tar.gz
cd themis-vX.Y.Z
./start.sh
```

Database migrations run automatically when the backend starts.

## Backup

Back up Postgres before major upgrades:

```bash
docker compose exec postgres pg_dump -U themis themis > themis-backup.sql
```

Restore example:

```bash
cat themis-backup.sql | docker compose exec -T postgres psql -U themis themis
```

## HTTPS

Terminate HTTPS in front of Themis with your existing reverse proxy or load balancer:

```text
Browser -> HTTPS reverse proxy -> Themis on port 80
```

Point the proxy backend at:

```text
http://<themis-server-ip>:80
```

## First Login

1. Open Themis in your browser.
2. Click Register.
3. Create the first account.
4. That first account is automatically promoted to admin.

After login, use Admin to configure users, roles, AD/OAuth, vendor profiles, rollback guard time, and deployment settings.
