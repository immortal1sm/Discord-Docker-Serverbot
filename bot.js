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
    SERVERS_YAML,
    // IoT-ready configuration (optional env vars)
    ALERTS_CHANNEL,
    ADMIN_ROLES,
    RESOURCE_ALERT_THRESHOLD
} = process.env;

const RESOURCE_ALERT_PCT = RESOURCE_ALERT_THRESHOLD ? parseInt(RESOURCE_ALERT_THRESHOLD, 10) : 85;

// Initialize Docker client (uses mounted socket)
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/* ───────── Dynamic Server Configuration ───────── */

/**
 * Parse server configuration from environment variables
 * Supports three formats (in order of preference):
 * 1. YAML: SERVERS_YAML with YAML syntax (most readable)
 * 2. JSON: SERVERS_JSON with JSON format
 * 3. CSV: SERVERS with "key:display:container:serverName:password" format
 */
function parseServerConfig() {
    const servers = {};
    
    // Try YAML format first (cleanest)
    if (SERVERS_YAML) {
        try {
            // Remove the pipe character and trim whitespace
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
    
    // Try JSON format second
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
    
    // If no servers configured, use defaults as fallback
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

const SERVERS_CONFIG = parseServerConfig();

/* ───────── Docker Helper Functions ───────── */

/**
 * Get container object by name
 */
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

/**
 * Get detailed container stats (CPU, Memory, Network)
 */
async function getContainerStats(containerId) {
    try {
        const container = docker.getContainer(containerId);
        const stats = await container.stats({ stream: false });
        
        // Calculate CPU percentage
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;
        
        // Calculate memory usage
        const memUsage = stats.memory_stats.usage;
        const memLimit = stats.memory_stats.limit;
        const memPercent = (memUsage / memLimit) * 100;
        
        // Format memory
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
                percent: memPercent.toFixed(1)
            }
        };
    } catch (error) {
        console.error('Error getting container stats:', error);
        return null;
    }
}

/**
 * Get container uptime
 */
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

/**
 * Get detailed container status with metrics
 */
async function getDetailedContainerStatus(containerName) {
    try {
        const container = await getContainer(containerName);
        const inspect = await container.inspect();
        const state = inspect.State;
        
        // Basic status
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
        
        // Get stats and uptime
        const [uptime, stats] = await Promise.all([
            getContainerUptime(container),
            getContainerStats(container.id)
        ]);
        
        // Determine if server is building (high CPU/low memory)
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

/**
 * Execute Docker action on container
 */
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

// Build dynamic slash commands
const commands = [];

// Add individual server control commands
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

// Add global status command
commands.push(
    new SlashCommandBuilder()
        .setName("status")
        .setDescription("Show status of all game servers")
        .toJSON()
);

// Add servers list command
commands.push(
    new SlashCommandBuilder()
        .setName("servers")
        .setDescription("List all configured game servers")
        .toJSON()
);

// Add /logs command
const { AttachmentBuilder } = require('discord.js');

commands.push(
    new SlashCommandBuilder()
        .setName("logs")
        .setDescription("View recent server logs")
        .addStringOption(opt =>
            opt.setName("server")
                .setDescription("Server to view logs for")
                .setRequired(true)
                .addChoices(
                    ...Object.keys(SERVERS_CONFIG).map(key => ({
                        name: SERVERS_CONFIG[key].displayName,
                        value: key
                    }))
                )
        )
        .addIntegerOption(opt =>
            opt.setName("lines")
                .setDescription("Number of lines (default: 50, max: 200)")
                .setRequired(false)
                .setMinValue(10)
                .setMaxValue(200)
        )
        .addStringOption(opt =>
            opt.setName("search")
                .setDescription("Filter logs for search text")
                .setRequired(false)
        )
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

client.once("clientReady", () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`📝 Monitoring channel: #${CONTROL_CHANNEL}`);
    if (ALERTS_CHANNEL) {
        console.log(`🔔 Alerts channel: #${ALERTS_CHANNEL}`);
    }
    if (ADMIN_ROLES) {
        console.log(`👑 Admin roles: ${ADMIN_ROLES}`);
    } else {
        console.log('👑 Admin roles: ALL (no restriction)');
    }
    console.log(`📊 Resource alert threshold: ${RESOURCE_ALERT_PCT}% RAM`);

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

    // ──── Start background monitoring ────
    startResourceMonitoring();
    startDeathWatcher();
});


/* ───────── Permission Helpers ───────── */

function hasAdminRole(interaction) {
    if (!ADMIN_ROLES) return true;
    const member = interaction.member;
    if (!member || !member.roles) return false;
    const required = ADMIN_ROLES.split(',').map(r => r.trim().toLowerCase());
    for (const role of member.roles.cache.values()) {
        if (required.includes(role.name.toLowerCase())) return true;
    }
    return false;
}

/* ───────── Logs Handler ───────── */

async function handleServerLogs(interaction, serverKey, config) {
    const linesCount = interaction.options.getInteger("lines") || 50;
    const search = interaction.options.getString("search");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const container = await getContainer(config.container);
        const logBuffer = await container.logs({
            stdout: true,
            stderr: true,
            tail: Math.min(linesCount, 200)
        });

        let logs = logBuffer.toString('utf-8');
        // Remove Docker timestamp prefix for cleaner reading
        logs = logs.replace(/^\d{4}-\d{2}-\d{2}T[^\s]+\s+/gm, '').trim();

        if (!logs) {
            return interaction.editReply({
                content: '📭 No recent logs for **' + config.displayName + '**.'
            });
        }

        let filteredLogs = logs;
        if (search) {
            const searchLines = logs.split('\n').filter(function(l) {
                return l.toLowerCase().includes(search.toLowerCase());
            });
            filteredLogs = searchLines.length > 0
                ? searchLines.join('\n')
                : 'No log lines matching "' + search + '".';
        }

        if (filteredLogs.length > 1800) {
            const attachment = new AttachmentBuilder(
                Buffer.from(filteredLogs),
                { name: config.container + '-logs.txt' }
            );
            await interaction.editReply({
                content: '📋 Logs for **' + config.displayName + '**' + (search ? ' (filter: "' + search + '")' : '') + ':',
                files: [attachment]
            });
        } else {
            const codeFence = '```';
            const embed = new EmbedBuilder()
                .setColor(0x808080)
                .setTitle('📋 ' + config.displayName + ' - Logs')
                .setDescription(codeFence + (search ? 'Filtered: "' + search + '"' : 'Last ' + Math.min(linesCount, 200) + ' lines') + '\n' + filteredLogs + codeFence)
                .setTimestamp()
                .setFooter({ text: 'Requested by ' + interaction.user.tag });
            await interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        await interaction.editReply({
            content: '❌ Error fetching logs: ' + error.message
        });
    }
}

/* ───────── Alert Sender ───────── */

async function sendAlert(type, config, data) {
    if (!ALERTS_CHANNEL) return;

    const channel = client.channels.cache.find(function(ch) {
        return ch.name === ALERTS_CHANNEL || ch.name === '#' + ALERTS_CHANNEL || ch.name === 'bot-alerts';
    });
    if (!channel) return;

    var title, color, description;

    if (type === 'memory') {
        title = '⚠️ High Memory Usage';
        color = 0xFFAA00;
        description = '**' + config.displayName + '** memory exceeded ' + RESOURCE_ALERT_PCT + '%.\nCurrent: **' + data.current + '**\nUsage: ' + data.usage + ' / ' + data.limit;
    } else if (type === 'crash') {
        title = '💥 Container Crashed';
        color = 0xFF0000;
        description = '**' + config.displayName + '** has stopped unexpectedly.\nExit code: ' + (data.exitCode || 'unknown') + '\nStatus: ' + (data.status || 'unknown');
    } else if (type === 'custom') {
        title = data.title || '🔔 Alert';
        color = data.color || 0x0099FF;
        description = data.message;
    } else {
        title = '🔔 Alert';
        color = 0x0099FF;
        description = JSON.stringify(data);
    }

    var embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    try {
        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('Failed to send alert:', e.message);
    }
}

/* ───────── Resource Monitoring ───────── */

var lastAlertTime = {};

async function startResourceMonitoring() {
    console.log('📊 Resource monitoring enabled (threshold: ' + RESOURCE_ALERT_PCT + '% RAM)');

    setInterval(async function() {
        if (!ALERTS_CHANNEL) return;

        var entries = Object.entries(SERVERS_CONFIG);
        for (var j = 0; j < entries.length; j++) {
            var config = entries[j][1];
            try {
                var details = await getDetailedContainerStatus(config.container);
                if (!details.isRunning || !details.stats) continue;

                var memPct = parseFloat(details.stats.memory.percent);
                var alertKey = config.container + '_mem';

                if (memPct >= RESOURCE_ALERT_PCT && !lastAlertTime[alertKey]) {
                    lastAlertTime[alertKey] = Date.now();
                    await sendAlert('memory', config, {
                        current: memPct.toFixed(1) + '%',
                        usage: details.stats.memory.usage,
                        limit: details.stats.memory.limit
                    });
                } else if (memPct < RESOURCE_ALERT_PCT - 10) {
                    delete lastAlertTime[alertKey];
                }
            } catch (e) { /* skip */ }
        }
    }, 60000);
}

/* ───────── Container Death Watcher ───────── */

var knownStates = {};

async function startDeathWatcher() {
    console.log('💀 Container death watcher enabled');

    // Initialize known states
    var entries = Object.entries(SERVERS_CONFIG);
    for (var k = 0; k < entries.length; k++) {
        var config = entries[k][1];
        try {
            var details = await getDetailedContainerStatus(config.container);
            knownStates[config.container] = details.isRunning;
        } catch (e) {
            knownStates[config.container] = false;
        }
    }

    setInterval(async function() {
        if (!ALERTS_CHANNEL) return;

        var entries2 = Object.entries(SERVERS_CONFIG);
        for (var m = 0; m < entries2.length; m++) {
            var config2 = entries2[m][1];
            try {
                var details2 = await getDetailedContainerStatus(config2.container);
                var wasRunning = knownStates[config2.container];
                var isRunning = details2.isRunning;

                if (wasRunning && !isRunning && details2.exitCode !== undefined && details2.exitCode !== 0) {
                    await sendAlert('crash', config2, {
                        exitCode: details2.exitCode,
                        status: details2.status
                    });
                }

                knownStates[config2.container] = isRunning;
            } catch (e) { /* skip */ }
        }
    }, 30000);
}

/* ───────── Command Handlers ───────── */


async function handleGlobalStatus(interaction) {
    await interaction.deferReply();
    
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle("🎮 Game Servers Status")
        .setDescription("Current status of all monitored game servers")
        .setTimestamp()
        .setFooter({ text: "Use /<server> [action] to control individual servers" });
    
    // Get status for each server
    for (const [key, config] of Object.entries(SERVERS_CONFIG)) {
        const details = await getDetailedContainerStatus(config.container);
        
        // Determine emoji based on state
        let emoji = "❓";
        if (details.displayStatus === "running") emoji = "🟢";
        else if (details.displayStatus === "building") emoji = "🟡";
        else if (details.status === "exited") emoji = "🔴";
        else if (details.status === "restarting") emoji = "🟡";
        else if (details.status === "paused") emoji = "🟠";
        
        embed.addFields({
            name: `${emoji} ${config.displayName}`,
            value: `**State:** \`${details.displayStatus}\`\n**Uptime:** \`${details.uptime}\`\n**CPU:** \`${details.cpu}\`\n**Memory:** \`${details.memory}\``,
            inline: true
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleServersList(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle("📋 Configured Game Servers")
        .setDescription("These servers are available for control")
        .addFields(
            { name: "Server Commands", value: Object.keys(SERVERS_CONFIG).map(key => `\`${key}\``).join(", "), inline: false },
            { name: "Available Actions", value: "`start` • `stop` • `restart` • `status` • `credentials`", inline: false },
            { name: "Example", value: `\`/${Object.keys(SERVERS_CONFIG)[0]} start\``, inline: false }
        )
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleServerCredentials(interaction, serverKey, config) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("dismiss_credentials")
            .setLabel("Dismiss")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("❌")
    );
    
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`🔐 ${config.displayName} - Server Credentials`)
        .setDescription("Here are the credentials to connect to the server:")
        .addFields(
            { name: "Server Name", value: `\`\`\`${config.serverName || "Not configured"}\`\`\``, inline: true },
            { name: "Password", value: `\`\`\`${config.password || "No password set"}\`\`\``, inline: true }
        )
        .setFooter({ text: "This message will disappear in 30 seconds" });
    
    await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
    });
    
    // Auto-dismiss after 30 seconds
    setTimeout(async () => {
        try {
            await interaction.deleteReply();
        } catch (error) {
            // Message might already be deleted
        }
    }, 30000);
}

async function handleServerStatus(interaction, serverKey, config) {
    await interaction.deferReply();
    
    const details = await getDetailedContainerStatus(config.container);
    
    // Determine emoji based on display status
    let emoji = "❓";
    if (details.displayStatus === "running") emoji = "🟢";
    else if (details.displayStatus === "building") emoji = "🟡";
    else if (details.status === "exited") emoji = "🔴";
    else if (details.status === "restarting") emoji = "🟡";
    else if (details.status === "paused") emoji = "🟠";
    
    const embed = new EmbedBuilder()
        .setColor(details.isRunning ? 0x00FF00 : 0xFF0000)
        .setTitle(`${emoji} ${config.displayName} - Status`)
        .addFields(
            { name: "State", value: `\`\`\`${details.displayStatus}\`\`\``, inline: true },
            { name: "Uptime", value: `\`\`\`${details.uptime}\`\`\``, inline: true },
            { name: "CPU Usage", value: `\`\`\`${details.cpu}\`\`\``, inline: true },
            { name: "Memory Usage", value: `\`\`\`${details.memory}\`\`\``, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Requested by ${interaction.user.tag}` });
    
    if (!details.isRunning) {
        embed.setDescription(`⚠️ **Server is not running. Use \`start\` action to start it.**`);
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleServerStart(interaction, serverKey, config) {
    await interaction.deferReply();
    
    try {
        await executeDockerAction(config.container, 'start');
        
        // Wait for container to start
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const details = await getDetailedContainerStatus(config.container);
        
        let emoji = "❓";
        if (details.displayStatus === "running") emoji = "🟢";
        else if (details.displayStatus === "building") emoji = "🟡";
        
        const embed = new EmbedBuilder()
            .setColor(0xFFFF00)
            .setTitle(`${emoji} ${config.displayName} - Started`)
            .addFields(
                { name: "State", value: `\`\`\`${details.displayStatus}\`\`\``, inline: true },
                { name: "Uptime", value: `\`\`\`${details.uptime}\`\`\``, inline: true },
                { name: "CPU Usage", value: `\`\`\`${details.cpu}\`\`\``, inline: true },
                { name: "Memory Usage", value: `\`\`\`${details.memory}\`\`\``, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `Started by ${interaction.user.tag}` });
        
        if (details.displayStatus === "building") {
            embed.setDescription(`🏗️ **Server is starting up. It will be ready in a moment.**`);
        }
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await interaction.editReply({
            content: `❌ Error starting server: ${error.message}`
        });
    }
}

async function handleDestructiveAction(interaction, serverKey, config, action) {
    if (ADMIN_ROLES && !hasAdminRole(interaction)) {
        return interaction.reply({
            content: "❌ You need an admin role to perform this action. Required: `" + ADMIN_ROLES + "`",
            flags: MessageFlags.Ephemeral
        });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("confirm_yes")
            .setLabel("Yes, proceed")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId("confirm_no")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
    );
    
    const warningMessage = action === "stop"
        ? "⚠️ **WARNING**: This will stop the server and disconnect all players!"
        : "⚠️ **WARNING**: This will restart the server and disconnect all players!";
    
    await interaction.reply({
        content: `${warningMessage}\n\nAre you sure you want to **${action.toUpperCase()}** the **${config.displayName}**?`,
        components: [row],
        flags: MessageFlags.Ephemeral
    });
    
    try {
        const confirmation = await interaction.channel.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id && i.isButton(),
            time: 30000
        });
        
        if (confirmation.customId === "confirm_no") {
            await confirmation.update({
                content: "❎ Action cancelled.",
                components: []
            });
            return;
        }
        
        if (confirmation.customId === "confirm_yes") {
            await confirmation.update({
                content: `⏳ **${action === "stop" ? "Stopping" : "Restarting"} ${config.displayName}...**`,
                components: []
            });
            
            await executeDockerAction(config.container, action);
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const details = await getDetailedContainerStatus(config.container);
            
            let emoji = "❓";
            if (details.status === "exited") emoji = "🔴";
            else if (details.status === "running") emoji = "🟢";
            
            const embed = new EmbedBuilder()
                .setColor(action === "stop" ? 0xFF0000 : 0xFFA500)
                .setTitle(`${emoji} ${config.displayName} - ${action === "stop" ? "Stopped" : "Restarted"}`)
                .addFields(
                    { name: "Current State", value: `\`\`\`${details.displayStatus}\`\`\``, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `${action === "stop" ? "Stopped" : "Restarted"} by ${interaction.user.tag}` });
            
            await interaction.deleteReply();
            await interaction.followUp({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Confirmation error:', error);
        try {
            await interaction.editReply({
                content: "⏰ Confirmation timed out. Action cancelled.",
                components: []
            });
        } catch (editError) {
            console.error('Failed to edit reply:', editError);
        }
    }
}

/* ───────── Button Handler ───────── */

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === "dismiss_credentials") {
        try { await interaction.deleteReply(); } catch (e) {}
    }
});

/* ───────── Main Command Router ───────── */

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // Handle /logs command
    if (interaction.commandName === "logs") {
        var logsServerKey = interaction.options.getString("server");
        var logsConfig = SERVERS_CONFIG[logsServerKey];
        if (!logsConfig) {
            return interaction.reply({
                content: "❌ Server not found. Use /servers to see available servers.",
                flags: MessageFlags.Ephemeral
            });
        }
        return handleServerLogs(interaction, logsServerKey, logsConfig);
    }
    
    // Handle global commands
    if (interaction.commandName === "status") {
        return handleGlobalStatus(interaction);
    }
    
    if (interaction.commandName === "servers") {
        return handleServersList(interaction);
    }
    
    // Server-specific commands
    const serverKey = interaction.commandName;
    const config = SERVERS_CONFIG[serverKey];
    
    if (!config) {
        return interaction.reply({
            content: "❌ Server not found. Use `/servers` to see available servers.",
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Channel restriction for server control
    if (interaction.channel && interaction.channel.name && interaction.channel.name !== CONTROL_CHANNEL) {
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

client.login(DISCORD_TOKEN).catch(console.error);