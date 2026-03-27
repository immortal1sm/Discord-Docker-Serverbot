const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");
const Docker = require('dockerode');
const yaml = require('js-yaml');

const {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,
    CONTROL_CHANNEL,
    SERVERS,
    SERVERS_JSON,
    SERVERS_YAML
} = process.env;

// Initialize Docker client (uses mounted socket)
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/* ───────── Dynamic Server Configuration ───────── */

function parseServerConfig() {
    const servers = {};
    
    // Try JSON format first (most reliable for Dockhand)
    if (SERVERS_JSON) {
        try {
            const parsed = JSON.parse(SERVERS_JSON);
            Object.entries(parsed).forEach(([key, config]) => {
                servers[key] = {
                    displayName: config.displayName || config.name || key,
                    container: config.container,
                    serverName: config.serverName || config.servername,
                    password: config.password,
                    scriptsPath: config.scriptsPath
                };
            });
            console.log(`📝 Loaded ${Object.keys(servers).length} servers from JSON config`);
            return servers;
        } catch (error) {
            console.error('Failed to parse SERVERS_JSON:', error);
        }
    }
    
    // Try YAML format second
    if (SERVERS_YAML) {
        try {
            let yamlContent = SERVERS_YAML;
            if (yamlContent.startsWith('|')) {
                yamlContent = yamlContent.substring(1);
            }
            
            const parsed = yaml.load(yamlContent);
            if (parsed && typeof parsed === 'object') {
                Object.entries(parsed).forEach(([key, config]) => {
                    servers[key] = {
                        displayName: config.displayName || config.name || key,
                        container: config.container,
                        serverName: config.serverName || config.servername,
                        password: config.password,
                        scriptsPath: config.scriptsPath
                    };
                });
                console.log(`📝 Loaded ${Object.keys(servers).length} servers from YAML config`);
                return servers;
            }
        } catch (error) {
            console.error('Failed to parse SERVERS_YAML:', error);
        }
    }
    
    // Fallback to CSV format
    if (SERVERS) {
        const serverEntries = SERVERS.split(',');
        serverEntries.forEach(entry => {
            const [key, displayName, container, serverName, password] = entry.split(':');
            if (key && displayName && container) {
                servers[key.trim()] = {
                    displayName: displayName.trim(),
                    container: container.trim(),
                    serverName: serverName ? serverName.trim() : '',
                    password: password ? password.trim() : ''
                };
            }
        });
        console.log(`📝 Loaded ${Object.keys(servers).length} servers from CSV config`);
    }
    
    if (Object.keys(servers).length === 0) {
        console.warn('⚠️ No servers configured. Using default examples.');
        return {
            example: {
                displayName: "Example Game Server",
                container: "example-container",
                serverName: "Example Server",
                password: "example123"
            }
        };
    }
    
    return servers;
}

// Handle unhandled rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Promise Rejection:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

const SERVERS_CONFIG = parseServerConfig();

/* ───────── Docker Helper Functions ───────── */

async function getContainer(containerName) {
    try {
        const containers = await docker.listContainers({
            all: true,
            filters: { name: [containerName] }
        });
        
        if (containers.length === 0) {
            throw new Error(`Container "${containerName}" not found`);
        }
        
        return docker.getContainer(containers[0].Id);
    } catch (error) {
        console.error(`Error getting container ${containerName}:`, error);
        throw error;
    }
}

async function getContainerStats(containerId) {
    try {
        const container = docker.getContainer(containerId);
        const stats = await container.stats({ stream: false });
        
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;
        
        const memUsage = stats.memory_stats.usage;
        const memLimit = stats.memory_stats.limit;
        
        const memUsageFormatted = memUsage > 1024 * 1024 * 1024 
            ? `${(memUsage / 1024 / 1024 / 1024).toFixed(2)} GiB`
            : `${(memUsage / 1024 / 1024).toFixed(2)} MiB`;
        const memLimitFormatted = memLimit > 1024 * 1024 * 1024
            ? `${(memLimit / 1024 / 1024 / 1024).toFixed(2)} GiB`
            : `${(memLimit / 1024 / 1024).toFixed(2)} MiB`;
        
        return {
            cpu: cpuPercent.toFixed(1),
            memory: {
                usage: memUsageFormatted,
                limit: memLimitFormatted,
                percent: ((memUsage / memLimit) * 100).toFixed(1)
            }
        };
    } catch (error) {
        console.error('Error getting container stats:', error);
        return null;
    }
}

async function getContainerUptime(container) {
    try {
        const inspect = await container.inspect();
        if (!inspect.State.Running || !inspect.State.StartedAt) {
            return "N/A";
        }
        
        const started = new Date(inspect.State.StartedAt);
        const now = new Date();
        const diff = Math.floor((now - started) / 1000);
        
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
        
        return parts.join(' ');
    } catch (error) {
        return "N/A";
    }
}

async function getDetailedContainerStatus(containerName) {
    try {
        const container = await getContainer(containerName);
        const inspect = await container.inspect();
        const state = inspect.State;
        
        const status = state.Status;
        const isRunning = state.Running;
        
        if (!isRunning) {
            return {
                status,
                displayStatus: status,
                uptime: "N/A",
                cpu: "N/A",
                memory: "N/A",
                isRunning: false,
                exitCode: state.ExitCode
            };
        }
        
        const [uptime, stats] = await Promise.all([
            getContainerUptime(container),
            getContainerStats(container.id)
        ]);
        
        let displayStatus = "running";
        if (stats) {
            const cpuValue = parseFloat(stats.cpu);
            const isMemoryLow = stats.memory.usage.includes("MiB") && parseFloat(stats.memory.usage) < 500;
            
            if (cpuValue > 50 || isMemoryLow) {
                displayStatus = "building";
            }
        }
        
        return {
            status,
            displayStatus,
            uptime,
            cpu: stats ? `${stats.cpu}%` : "N/A",
            memory: stats ? `${stats.memory.usage} / ${stats.memory.limit}` : "N/A",
            isRunning: true,
            stats
        };
    } catch (error) {
        console.error(`Error getting container status for ${containerName}:`, error);
        return {
            status: "unknown",
            displayStatus: "unknown",
            uptime: "N/A",
            cpu: "N/A",
            memory: "N/A",
            isRunning: false,
            error: error.message
        };
    }
}

async function executeDockerAction(containerName, action) {
    const container = await getContainer(containerName);
    
    switch (action) {
        case 'start':
            await container.start();
            break;
        case 'stop':
            await container.stop();
            break;
        case 'restart':
            await container.restart();
            break;
        default:
            throw new Error(`Unknown action: ${action}`);
    }
}



/* ───────── Slash Commands ───────── */

const commands = [];

Object.keys(SERVERS_CONFIG).forEach(key => {
    commands.push(
        new SlashCommandBuilder()
            .setName(key)
            .setDescription(`Control ${SERVERS_CONFIG[key].displayName}`)
            .addStringOption(opt =>
                opt.setName("action")
                    .setDescription("Action to perform")
                    .setRequired(true)
                    .addChoices(
                        { name: "Start", value: "start" },
                        { name: "Stop", value: "stop" },
                        { name: "Restart", value: "restart" },
                        { name: "Status", value: "status" },
                        { name: "Credentials", value: "credentials" }
                    )
            ).toJSON()
    );
});

commands.push(
    new SlashCommandBuilder()
        .setName("status")
        .setDescription("Show status of all game servers")
        .toJSON()
);

commands.push(
    new SlashCommandBuilder()
        .setName("servers")
        .setDescription("List all configured game servers")
        .toJSON()
);

/* ───────── Register Commands ───────── */
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log("🔄 Registering slash commands...");
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log(`✅ Registered ${commands.length} slash commands:`);
        commands.forEach(cmd => {
            if (cmd.name === "status") {
                console.log(`   /${cmd.name} - Show all server status`);
            } else if (cmd.name === "servers") {
                console.log(`   /${cmd.name} - List configured servers`);
            } else {
                console.log(`   /${cmd.name} [start|stop|restart|status|credentials]`);
            }
        });
    } catch (error) {
        console.error("❌ Failed to register commands:", error);
    }
})();

/* ───────── Discord Client ───────── */
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Fixed: Changed 'ready' to 'clientReady'
client.once("clientReady", () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`📝 Monitoring channel: #${CONTROL_CHANNEL}`);
    console.log(`🎮 Managing ${Object.keys(SERVERS_CONFIG).length} game servers:`);
    Object.entries(SERVERS_CONFIG).forEach(([key, config]) => {
        console.log(`   - ${key}: ${config.displayName} (${config.container})`);
        if (config.serverName) {
            console.log(`     🔐 Server Name: ${config.serverName}`);
        }
    });
    
    // Test Docker connection
    docker.ping((err) => {
        if (err) {
            console.error("❌ Failed to connect to Docker daemon:", err);
        } else {
            console.log("✅ Connected to Docker daemon");
        }
    });
});

// ... (keep all the handler functions - they're good)

/* ───────── Main Command Router ───────── */

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    if (interaction.commandName === "status") {
        return handleGlobalStatus(interaction);
    }
    
    if (interaction.commandName === "servers") {
        return handleServersList(interaction);
    }
    
    const serverKey = interaction.commandName;
    const config = SERVERS_CONFIG[serverKey];
    
    if (!config) {
        return interaction.reply({
            content: "❌ Server not found. Use `/servers` to see available servers.",
            flags: MessageFlags.Ephemeral
        });
    }
    
    if (interaction.channel.name !== CONTROL_CHANNEL) {
        return interaction.reply({
            content: `❌ Server control commands only work in the **#${CONTROL_CHANNEL}** channel.\nUse **/status** or **/servers** anywhere to check information.`,
            flags: MessageFlags.Ephemeral
        });
    }
    
    const action = interaction.options.getString("action");
    
    try {
        switch (action) {
            case "credentials":
                await handleServerCredentials(interaction, serverKey, config);
                break;
            case "status":
                await handleServerStatus(interaction, serverKey, config);
                break;
            case "start":
                await handleServerStart(interaction, serverKey, config);
                break;
            case "stop":
                await handleDestructiveAction(interaction, serverKey, config, "stop");
                break;
            case "restart":
                await handleDestructiveAction(interaction, serverKey, config, "restart");
                break;
            default:
                await interaction.reply({
                    content: `❌ Unknown action: ${action}`,
                    flags: MessageFlags.Ephemeral
                });
        }
    } catch (error) {
        console.error(`Error in ${action} for ${serverKey}:`, error);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `❌ Error: ${error.message}`,
                flags: MessageFlags.Ephemeral
            });
        } else {
            await interaction.editReply({
                content: `❌ Error: ${error.message}`
            });
        }
    }
});

// Login with retry
async function loginWithRetry(retries = 3, delay = 5000) {
    for (let i = 0; i < retries; i++) {
        try {
            await client.login(DISCORD_TOKEN);
            return;
        } catch (error) {
            console.error(`Login attempt ${i + 1} failed:`, error.message);
            if (i < retries - 1) {
                console.log(`Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}

loginWithRetry().catch(console.error);