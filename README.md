# Discord Docker Game Server Bot

A powerful Discord bot that lets you manage Docker game server containers through slash commands — start, stop, restart, view live logs, and monitor resources, all from Discord. Built with **Discord.js v14** and **Dockerode** for direct Docker API integration. No shell scripts required.

> Works seamlessly with [Dockhand](https://dockhand.pro/) and any Docker Compose deployment.

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-immortalism%2Fdiscord--serverbot-%230db7ed?logo=docker&labelColor=555)](https://hub.docker.com/r/immortalism/discord-serverbot)

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
  - [Option A: Docker Compose with `.env` (recommended)](#option-a-docker-compose-with-env-recommended)
  - [Option B: Docker Run (single command)](#option-b-docker-run-single-command)
  - [Option C: Build from Source](#option-c-build-from-source)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [Server Config Formats](#server-config-formats)
  - [Sample `.env.example`](#sample-envexample)
- [Docker Compose Reference](#docker-compose-reference)
- [Slash Commands](#slash-commands)
- [IoT-Ready Features](#iot-ready-features)
- [Security](#security)
- [Deploy with Dockhand](#deploy-with-dockhand)
- [Updating](#updating)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Features

- **Dynamic Server Management** — Add or remove game servers through environment variables. No code changes needed.
- **Direct Docker API Integration** — Uses Dockerode for efficient container management via the mounted Docker socket.
- **Rich Server Information** — View real-time CPU usage, memory consumption, and uptime directly in Discord embeds.
- **Log Streaming** — Fetch recent container logs, filter by keyword, and download as a file when too long.
- **Resource Monitoring** — Automatic alerts when a server's memory usage exceeds a configurable threshold.
- **Container Death Watcher** — Get notified instantly when a game server crashes or stops unexpectedly.
- **Role-Based Permissions** — Restrict destructive actions (stop/restart) to specific Discord roles.
- **Multiple Config Formats** — Supports YAML, JSON, or CSV for server definitions.
- **Safe Destructive Actions** — Confirmation buttons for stop and restart to prevent accidents.
- **Auto-Disconnect Credentials** — Server credential embeds auto-delete after 30 seconds.

---

## Quick Start

### 0. Prerequisites

1. **Create a Discord Bot** — Go to the [Discord Developer Portal](https://discord.com/developers/applications), create a New Application → Bot → copy the **Token** and **Application ID**.
2. **Get your Guild ID** — Right-click your Discord server → Copy Server ID.
3. **Create a control channel** — Make a text channel in your server (default: `server-control`) where bot commands will work.

### Option A: Docker Compose with `.env` (recommended)

The cleanest approach — all config lives in a `.env` file, compose handles the rest.

```bash
# 1. Create a directory for the bot
mkdir -p ~/discord-serverbot && cd ~/discord-serverbot

# 2. Create your .env file
nano .env    # fill in using the .env.example template below

# 3. Create docker-compose.yml (see Docker Compose Reference section below)
nano docker-compose.yml

# 4. Deploy
docker compose up -d
```

### Option B: Docker Run (single command)

Get up and running in one line — no compose file needed.

```bash
docker run -d \
  --name discord-serverbot \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e DISCORD_TOKEN="your_bot_token" \
  -e CLIENT_ID="your_client_id" \
  -e GUILD_ID="your_guild_id" \
  -e CONTROL_CHANNEL="server-control" \
  -e SERVERS_JSON='{"server":{"displayName":"My Server","container":"my-container","serverName":"World","password":"s3cr3t"}}' \
  immortalism/discord-serverbot:latest
```

### Option C: Build from Source

```bash
git clone https://github.com/immortal1sm/Discord-Docker-Serverbot.git
cd Discord-Docker-Serverbot
nano .env
docker compose up -d --build
```

---

## Configuration

All settings are managed through environment variables in your `.env` file or Docker Compose config. **Never commit your `.env` to version control.**

### Environment Variables

#### Required

| Variable | Description | Example |
|---|---|---|
| `DISCORD_TOKEN` | Bot token from the Discord Developer Portal | `MTQ2Nz...` |
| `CLIENT_ID` | Application Client ID | `123456789012345678` |
| `GUILD_ID` | Discord server (guild) ID | `866693298986156042` |

#### Optional

| Variable | Default | Description |
|---|---|---|
| `CONTROL_CHANNEL` | `server-control` | Channel name where server control commands work. Info commands (`/status`, `/servers`) work anywhere. |
| `SERVERS_JSON` | (none) | Game server definitions as a JSON object (see formats below) |
| `SERVERS_YAML` | (none) | Game server definitions as YAML — oneof JSON or YAML is required |
| `ALERTS_CHANNEL` | (disabled) | Channel name for resource alerts and crash notifications |
| `ADMIN_ROLES` | (disabled) | Comma-separated Discord role names. Only members with these roles can stop/restart servers |
| `RESOURCE_ALERT_THRESHOLD` | `85` | RAM percentage threshold for alerts (1-100) |

### Server Config Formats

Define your game servers in **one** format. Use only `SERVERS_JSON` **or** `SERVERS_YAML` — not both.

**JSON** (recommended):
```json
{
  "icarus": {
    "displayName": "Icarus Dedicated Server",
    "container": "icarus-dedicated",
    "serverName": "My Icarus Server",
    "password": "changeme"
  },
  "palworld": {
    "displayName": "Palworld Dedicated Server",
    "container": "palworld-server",
    "serverName": "Palworld Server",
    "password": "changeme"
  },
  "sotf": {
    "displayName": "Sons of the Forest Server",
    "container": "sotf",
    "serverName": "SOTF Server",
    "password": "changeme"
  }
}
```

**YAML**:
```yaml
icarus:
  displayName: Icarus Dedicated Server
  container: icarus-dedicated
  serverName: My Icarus Server
  password: changeme
palworld:
  displayName: Palworld Dedicated Server
  container: palworld-server
  serverName: Palworld Server
  password: changeme
```

**CSV** (compact fallback):
```
key:displayName:containerName:serverName:password
```

Each server key must match a Docker container name that is already created on your host. The bot manages those containers via the Docker socket.

### Sample `.env.example`

Copy this as a starting template for your `.env` file:

```env
# ============================================
# Discord Bot — Required
# ============================================
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_application_client_id_here
GUILD_ID=your_discord_server_id_here

# ============================================
# Discord Bot — Optional
# ============================================
CONTROL_CHANNEL=server-control
ALERTS_CHANNEL=
ADMIN_ROLES=
RESOURCE_ALERT_THRESHOLD=85

# ============================================
# Server Definitions (pick ONE format)
# ============================================
# JSON — all on one line for docker compose env parsing
SERVERS_JSON={"icarus":{"displayName":"Icarus Server","container":"icarus-dedicated","serverName":"MyServer","password":"changeme"}}

# YAML — uncomment and use instead of SERVERS_JSON
# SERVERS_YAML=
#     icarus:
#       displayName: Icarus Dedicated Server
#       container: icarus-dedicated
#       serverName: My Icarus Server
#       password: changeme

# CSV — uncomment and use instead (one line per server after header)
# SERVERS_CSV=key:displayName:containerName:serverName:password
```

---

## Docker Compose Reference

This compose file uses the prebuilt Docker Hub image (`immortalism/discord-serverbot:latest`). No build step required.

```yaml
services:
  discord-serverbot:
    image: immortalism/discord-serverbot:latest
    container_name: discord-serverbot
    restart: unless-stopped

    # Map container user to host docker group for socket access
    user: "1001:991"

    env_file: .env

    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - CLIENT_ID=${CLIENT_ID}
      - GUILD_ID=${GUILD_ID}
      - CONTROL_CHANNEL=${CONTROL_CHANNEL:-server-control}
      - SERVERS_JSON=${SERVERS_JSON:-}
      - SERVERS_YAML=${SERVERS_YAML:-}
      - SERVERS_CSV=${SERVERS_CSV:-}
      - ALERTS_CHANNEL=${ALERTS_CHANNEL:-}
      - ADMIN_ROLES=${ADMIN_ROLES:-}
      - RESOURCE_ALERT_THRESHOLD=${RESOURCE_ALERT_THRESHOLD:-85}

    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

networks:
  default:
    driver: bridge
```

### How it works

- **`image:`** pulls `immortalism/discord-serverbot:latest` from Docker Hub — no build needed
- **`env_file: .env`** loads all variables from your `.env` file automatically
- **`environment:`** explicitly passes each `${VAR}` to the container with safe defaults via `:-fallback`
- **`user: "1001:991"`** maps the container's node user (UID 1001) to the host's Docker group (GID 991) so the bot can access `/var/run/docker.sock` without running as root
- **`volumes:`** mounts the Docker socket so the bot can manage your game server containers

---

## Slash Commands

All info commands (`/status`, `/servers`) work from **any channel**. Server control commands are restricted to your designated control channel.

| Command | Description | Location |
|---|---|---|
| `/status` | Show real-time status of all game servers | Anywhere |
| `/servers` | List all configured servers and available actions | Anywhere |
| `/logs <server>` | View recent container logs (optional: `--lines`, `--search`) | Control channel |
| `/<server> start` | Start a game server | Control channel |
| `/<server> stop` | Stop a game server (requires confirmation) | Control channel |
| `/<server> restart` | Restart a game server (requires confirmation) | Control channel |
| `/<server> status` | Show detailed stats (CPU, RAM, uptime) | Control channel |
| `/<server> credentials` | Display server name and password (auto-deletes after 30s) | Control channel |

Server-specific commands (`/icarus`, `/palworld`, `/sotf`, etc.) are generated dynamically from your config.

---

## IoT-Ready Features

The bot is designed to be easily extensible for IoT and smart home integration. The following environment variables are placeholders for future expansion:

| Variable | Purpose |
|---|---|
| `ALERTS_CHANNEL` | Route monitoring alerts to a specific Discord channel |
| `MQTT_BROKER_URL` | Publish/subscribe to MQTT topics for IoT device integration |
| `SMART_PLUG_URL` | Control physical power to game server hardware |
| `HA_URL` | Integrate with Home Assistant for smart home automation |

Future releases may include:
- MQTT publish/subscribe for real-time game server state broadcasting
- Smart plug control via Tasmota, Shelly, or TP-Link APIs
- Home Assistant sensor exposure (server status as HA entities)
- Hardware sensor monitoring (CPU temp, power draw, fan speed) via mounted `/sys` paths

---

## Security

- **Channel Restriction:** Server control commands only work in your designated `CONTROL_CHANNEL`. Info commands (`/status`, `/servers`) work anywhere.
- **Role-Based Access:** Set `ADMIN_ROLES` to restrict stop/restart to specific Discord roles.
- **Confirmation Buttons:** Stop and restart require a button confirmation before executing.
- **Auto-Deleting Credentials:** Server password embeds auto-delete after 30 seconds.
- **No Shell Access:** The bot communicates through the Docker API (Dockerode), not shell commands.
- **Non-Root Container:** The bot runs as a non-root user (`nodejs`, UID 1001) with only the minimum GID needed for Docker socket access.

---

## Deploy with Dockhand

1. In Dockhand, create a new **Docker Compose Stack**
2. Link this repository: `https://github.com/immortal1sm/Discord-Docker-Serverbot`
3. Select the `docker-compose.yml` file
4. Set your environment variables (required: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`)
5. Set `SERVERS_JSON` with your game server definitions
6. Deploy — Dockhand handles the build, socket mount, and user mapping automatically

---

## Updating

**Docker Hub image:**
```bash
docker compose pull
docker compose up -d
```

**Build from source:**
```bash
git pull
docker compose up -d --build
```

---

## Tech Stack

- **Node.js 20** (Alpine) — Lightweight runtime
- **Discord.js v14** — Discord API interaction
- **Dockerode** — Docker API client (no shell needed)
- **js-yaml** — YAML config parsing

---

## License

MIT License. See [LICENSE](LICENSE) for details.
