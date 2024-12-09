const { ActivityType, version: djsversion } = require('discord.js');
const path = require("path");
const fs = require("fs");
const figlet = require('figlet');
const os = require('os');

function loadStatus() {
    const statusConfigPath = path.join(process.cwd(), 'data', 'status-config.json');
    try {
        if (fs.existsSync(statusConfigPath)) {
            return JSON.parse(fs.readFileSync(statusConfigPath, 'utf8'));
        }
    } catch (error) {
        console.error(':x: | Erreur lors du chargement du statut:', error);
    }
    return { type: ActivityType.Custom, text: ":gear: | En cours de développement..." };
}

// Codes de couleur ANSI étendus
const colors = {
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    bright: {
        cyan: '\x1b[96m',
        blue: '\x1b[94m',
        green: '\x1b[92m',
        yellow: '\x1b[93m',
        magenta: '\x1b[95m',
        red: '\x1b[91m',
        white: '\x1b[97m'
    },
    bg: {
        blue: '\x1b[44m',
        magenta: '\x1b[45m'
    },
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m'
};

// Fonction pour formatter les millisecondes en temps lisible
function formatUptime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return `${hours}h ${minutes}m ${seconds}s`;
}

// Fonction pour formater les bytes
function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

module.exports = {
    name: 'ready',
    description: 'Affiche des informations lors du démarrage du bot',
    once: true,
    async execute(client) {
        // Affichage stylé du nom du bot
        figlet(client.user.username, {
            font: 'Elite',
            horizontalLayout: 'default',
            verticalLayout: 'default'
        }, (err, data) => {
            if (err) {
                console.log('Something went wrong...');
                return;
            }
            
            // Logo et bannière
            console.log('\n' + colors.bright.white + '═'.repeat(80) + colors.reset);
            console.log('\n' + colors.bright.cyan + data + colors.reset);
            console.log('\n' + colors.bright.white + '═'.repeat(80) + '\n' + colors.reset);
            
            // Informations du bot
            console.log(colors.bold + colors.bright.magenta + '⭐ INFORMATIONS DU BOT' + colors.reset);
            console.log(colors.bright.green + `┌─ 🤖 Bot Tag: ${colors.white}${client.user.tag}`);
            console.log(colors.bright.green + `├─ 📊 Serveurs: ${colors.white}${client.guilds.cache.size}`);
            console.log(colors.bright.green + `├─ 👥 Utilisateurs: ${colors.white}${client.users.cache.size}`);
            console.log(colors.bright.green + `└─ ⚡ Ping: ${colors.white}${client.ws.ping}ms\n`);
            
            // Statistiques système
            console.log(colors.bold + colors.bright.cyan + '🖥️  STATISTIQUES SYSTÈME' + colors.reset);
            console.log(colors.bright.blue + `┌─ 💻 Plateforme: ${colors.white}${process.platform}`);
            console.log(colors.bright.blue + `├─ 🧮 Mémoire: ${colors.white}${formatBytes(process.memoryUsage().heapUsed)}`);
            console.log(colors.bright.blue + `├─ ⚙️  CPU: ${colors.white}${os.cpus()[0].model}`);
            console.log(colors.bright.blue + `└─ 🕒 Uptime: ${colors.white}${formatUptime(client.uptime)}\n`);
            
            // Versions
            console.log(colors.bold + colors.bright.yellow + '📦 VERSIONS' + colors.reset);
            console.log(colors.bright.yellow + `┌─ Node.js: ${colors.white}${process.version}`);
            console.log(colors.bright.yellow + `├─ Discord.js: ${colors.white}v${djsversion}`);
            console.log(colors.bright.yellow + `├─ Bot: ${colors.white}v1.0.1`);
            console.log(colors.bright.yellow + `└─ Author: ${colors.white}RiuXe | riuxe` + colors.reset + '\n');
            
            // Ligne de séparation finale
            console.log(colors.bright.white + '═'.repeat(80) + colors.reset + '\n');
        });

        // Système de statut rotatif amélioré
        const activities = [
            { name: `${client.guilds.cache.size} serveurs`, type: ActivityType.Watching },
            { name: 'vos commandes | /help', type: ActivityType.Listening },
            { name: `${client.users.cache.size} utilisateurs`, type: ActivityType.Watching },
            { name: 'version 1.0.0 | /info', type: ActivityType.Playing },
            { name: 'développé avec ❤️', type: ActivityType.Playing },
            { name: `Ping : ${client.ws.ping}ms`, type: ActivityType.Competing }
        ];

        let i = 0;
        // Définir le statut initial
        const savedStatus = loadStatus();
        client.user.setActivity(savedStatus.text, { type: savedStatus.type });
    }
};