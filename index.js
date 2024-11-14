const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { checkPermission } = require('./commands/moderation/permissionManager/permissionManager');
const fs = require("fs");
const dotenv = require('dotenv');
const path = require("path");

const prefixConfigPath = path.join(__dirname, 'data/set-prefix/config.json');
let config = { defaultPrefix: '!', currentPrefix: '!' };

// Fonction pour charger la configuration du préfixe
const loadPrefixConfig = () => {
    try {
        if (fs.existsSync(prefixConfigPath)) {
            const data = fs.readFileSync(prefixConfigPath, 'utf8');
            config = JSON.parse(data); 
            return config;
        }
        return config;
    } catch (error) {
        console.error('Erreur lors du chargement de la configuration du préfixe:', error);
        return config;
    }
};

// Charge la configuration initiale
loadPrefixConfig();

dotenv.config();

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
    ]
});

client.commands = new Map();

// Chargement des commandes
const loadCommands = (directory) => {
    const commandFiles = fs.readdirSync(directory, { withFileTypes: true });

    for (const file of commandFiles) {
        if (file.isDirectory()) {
            loadCommands(path.join(directory, file.name));
        } else if (file.name.endsWith('.js')) {
            const filePath = path.join(directory, file.name);
            const command = require(filePath);

            if (command.name && command.execute) {
                client.commands.set(command.name, command);
            } else {
                console.error(`Le fichier ${file.name} ne contient pas de 'name' ou 'execute' valide.`);
            }
        }
    }
};

// Chargement des events
const loadEvents = (directory) => {
    const eventFiles = fs.readdirSync(directory, { withFileTypes: true });

    for (const file of eventFiles) {
        if (file.isDirectory()) {
            loadEvents(path.join(directory, file.name));
        } else if (file.name.endsWith('.js')) {
            const filePath = path.join(directory, file.name);
            const event = require(filePath);

            if (event.name) {
                if (event.once) {
                    client.once(event.name, (...args) => event.execute(...args));
                } else {
                    client.on(event.name, (...args) => event.execute(...args));
                }
            } else {
                console.error(`Le fichier ${file.name} ne contient pas de 'name' valide.`);
            }
        }
    }
};

// Chargement des commandes et des événements
loadCommands(path.join(__dirname, 'commands'));
loadEvents(path.join(__dirname, 'events'));

fs.watchFile(prefixConfigPath, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
        console.log('Configuration du préfixe modifiée, rechargement...');
        loadPrefixConfig();
    }
});

client.on('messageCreate', async message => {
    try {
        config = loadPrefixConfig();
        
        if (!message.content.startsWith(config.currentPrefix) || message.author.bot) return;

        const args = message.content.slice(config.currentPrefix.length).split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName);
        if (!command) return;

        if (!checkPermission(message.member, commandName)) {
            return message.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande.');
        }

        await command.execute(message, args, client);
    } catch (error) {
        console.error('Erreur dans messageCreate:', error);
        message.reply('Une erreur est survenue lors de l\'exécution de la commande.').catch(console.error);
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);