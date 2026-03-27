# Game Server Discord Bot  A powerful Discord bot that lets trusted users manage Docker game server containers through slash commands. Built with Discord.js v14 and Dockerode for direct Docker API integration. 
> **Note**: This bot communicates directly with the Docker API through the mounted socket. No shell scripts required! All server configurations are managed through environment variables.
## ✨ Features
- **Dynamic Server Management** - Add/remove servers via environment variables, no code changes
- **Direct Docker API Integration** - Uses Dockerode for efficient container management
- **Multiple Configuration Formats** - Supports YAML, JSON, or CSV server definitions
- **Rich Server Information** - View container stats (CPU, Memory, Uptime) directly in Discord
- **Secure by Design** - Slash commands only, channel restrictions, confirmation for destructive actions
- **Dockhand Compatible** - Works seamlessly with Dockhand deployments
## 🚀 Quick Start
### Prerequisites
- **Docker** and **Docker Compose** installed on your host
- A **Discord account** with server management permissions
- **Docker containers** for your game servers (create them first)
### 1. Create Your Discord Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** and give it a name
3. Navigate to the **"Bot"** section and create a bot
4. Copy these credentials: 
- **Bot Token** (from Bot section)
- **Application (Client) ID** (from General Information)
- **Guild (Server) ID** (Enable Developer Mode → Right-click server → Copy ID)
5. Under **OAuth2 → URL Generator**, select: 
- `applications.commands`
- `bot`     
6. Under **Bot Permissions**, select: 
- `Send Messages`
- `Read Message History`
- `Use Slash Commands`  
7. Use the generated URL to invite your bot to your Discord server

## Table of Contents
- [Description](#description)
- [Demo/Screenshots](#demoscreenshots)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Description
The Discord Game Server Bot is a powerful tool for gamers and Discord server administrators. It allows for the dynamic management of game server Docker containers directly from your Discord server. With this bot, you can easily start, stop, and manage game servers, making it an ideal solution for gaming communities.

## Demo/Screenshots
Unfortunately, due to the nature of this project, providing a demo GIF or screenshots is challenging. However, the bot's functionality can be demonstrated through its commands and the ability to manage Docker containers.

## Features
- 🎮 **Game Server Management**: Start, stop, and manage game servers with ease.
- ⚡ **Docker Integration**: Leverage the power of Docker for containerization.
- 📝 **Command-Based Interface**: Interact with the bot using simple and intuitive commands.
- 🚀 **Dynamic Scaling**: Easily scale your game servers up or down as needed.
- 🔒 **Security**: Ensure your game servers are secure with the bot's management capabilities.

## Tech Stack
- **JavaScript**: The primary programming language used.
- **Node.js**: The runtime environment for executing JavaScript code.
- **Docker**: For containerizing game servers.
- **discord.js**: A library for interacting with the Discord API.
- **dockerode**: A library for interacting with Docker.

## Project Structure
```markdown
discord-game-server-bot/
├── Dockerfile             # Dockerfile for building the bot image
├── docker-compose.yml     # Docker Compose configuration
├── package.json           # npm package file
├── bot.js                 # The main bot script
├── README.md              # This file
```

## Prerequisites
- **Node.js**: Ensure you have Node.js installed on your system.
- **Docker**: Docker must be installed and running on your system.
- **Discord Server**: You need a Discord server to use the bot.

## Installation
To install the bot, follow these steps:
```bash


```

## Usage
To use the bot, you'll need to invite it to your Discord server and configure it according to your needs. The bot responds to a set of commands that allow you to manage your game servers.

## Contributing
Contributions are welcome! If you have any ideas or want to report a bug, please open an issue or a pull request.

## License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.