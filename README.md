# Discord Docker Game Server Bot

A powerful Discord bot that lets you manage Docker game server containers through slash commands — start, stop, restart, view live logs, and monitor resources, all from Discord. Built with **Discord.js v14** and **Dockerode** for direct Docker API integration. No shell scripts required.

> Works seamlessly with [Dockhand](https://dockhand.pro/) and any Docker Compose deployment.

---

## Table of Contents

- [Features](#features)
- [Slash Commands](#slash-commands)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [IoT-Ready Features](#iot-ready-features)
- [Security](#security)
- [Deploy with Dockhand](#deploy-with-dockhand)
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
- **Auto-Disconnect Credentials** — Credential embeds auto-delete after 30 seconds.

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

## Quick Start

### 1. Create a Discord Bot Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, name it, and save
3. Go to **Bot** → click **Add Bot** → copy the **Token**
4. Go to **General Information** → copy the **Application (Client) ID**
5. Enable **Developer Mode** in Discord Settings (Appearance → Advanced)
6. Right-click your Discord server → **Copy Server ID** (this is the Guild ID)
7. Under **Bot Permissions**, enable:
   - `Send Messages`
   - `Read Message History`
   - `Use Slash Commands`
8. Under **OAuth2**, check `bot` and `applications.commands` to generate an invite URL
9. Use the URL to invite the bot to your server

### 2. Create Your Control Channel

Create a text channel in your Discord server named `server-control` (or any name you prefer — you'll configure it later).

### 3. Deploy

**Docker Compose (standalone):**

```bash
# Clone the repo
git clone https://github.com/immortal1sm/Discord-Docker-Serverbot.git
cd Discord-Docker-Serverbot

# Create your .env file (see Configuration below)
nano .env

# Deploy
docker compose up -d --build
```

See [Deploy with Dockhand](#deploy-with-dockhand) for stack-based deployment.

---

## Configuration

All settings are managed through environment variables in your `.env` file or Docker Compose config.

### Required Variables

| Variable | Description | Example |
|---|---|---|
| `DISCORD_TOKEN` | Your bot token from the Developer Portal | `MTQ2Nz...` |
| `CLIENT_ID` | Application Client ID | `123456789012345678` |
| `GUILD_ID` | Discord server (guild) ID | `866693298986156042` |

### Optional Variables

| Variable | Default | Description |
|---|---|---|
| `CONTROL_CHANNEL` | `server-control` | Channel name where server control commands work |
| `SERVERS_JSON` | (none) | Game servers as JSON (see examples below) |
| `SERVERS_YAML` | (none) | Game servers as YAML |
| `ALERTS_CHANNEL` | (disabled) | Channel name for resource alerts and crash notifications |
| `ADMIN_ROLES` | (disabled = all users) | Comma-separated Discord role names. Only members with these roles can stop/restart servers |
| `RESOURCE_ALERT_THRESHOLD` | `85` | RAM percentage threshold for alerts (1-100) |

### Server Configuration Examples

You can define servers in **one** of three formats. JSON is recommended for Dockhand.

**JSON** (recommended):
```json
{
  "palworld": {
    "displayName": "Palworld Dedicated Server",
    "container": "palworld-server",
    "serverName": "Sever123",
    "password": "s3cr3t"
  },
  "sotf": {
    "displayName": "Sons of the Forest Server",
    "container": "sotf",
    "serverName": "Server123",
    "password": "play4fun"
  },
  "icarus": {
    "displayName": "Icarus Dedicated Server",
    "container": "icarus-dedicated",
    "serverName": "Server123",
    "password": "explore!"
  }
}
```

**YAML**:
```yaml
palworld:
  displayName: Palworld Dedicated Server
  container: palworld-server
  serverName: Server123
  password: s3cr3t
sotf:
  displayName: Sons of the Forest Server
  container: sotf
  serverName: Server123
  password: play4fun
```

**CSV** (compact fallback):
```
key:displayName:containerName:serverName:password
```

---

## IoT-Ready Features

The bot is designed to be easily extensible for IoT and smart home integration. The following environment variables are placeholders for future expansion:

| Variable | Purpose |
|---|---|
| `ALERTS_CHANNEL` | Route monitoring alerts to a specific Discord channel |
| `MQTT_BROKER_URL` | Publish subscribe to MQTT topics for IoT device integration |
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
- **Non-Root Container:** The bot runs as a non-root user (`nodejs`) with only the minimum GID needed for Docker socket access.

---

## Deploy with Dockhand

1. In Dockhand, create a new **Docker Compose Stack**
2. Link this repository: `https://github.com/immortal1sm/Discord-Docker-Serverbot`
3. Select the `docker-compose.yml` file
4. Set your environment variables (required: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`)
5. Set `SERVERS_JSON` with your game server definitions
6. Deploy — Dockhand handles the build, socket mount, and user mapping automatically

The `docker-compose.yml` includes `user: "1001:991"` which maps the container user to the host's Docker group, enabling socket access without running as root.

---

## Tech Stack

- **Node.js 20** (Alpine) — Runtime
- **Discord.js v14** — Discord API interaction
- **Dockerode** — Docker API client (no shell needed)
- **js-yaml** — YAML config parsing

---

## License

MIT License. See [LICENSE](LICENSE) for details.
