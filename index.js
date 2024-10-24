const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { checkPermission } = require('./commands/moderation/permissionManager/permissionManager');
const fs = require("fs");
const dotenv = require('dotenv');
const path = require("path");

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

client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const args = message.content.slice(1).split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    // Vérification des permissions
    if (!checkPermission(message.member, commandName)) {
        return message.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande.');
    }

    try {
        // Modifié ici : on passe le client en tant que deuxième argument
        await command.execute(message, client, args);
    } catch (error) {
        console.error(error);
        message.reply('Une erreur est survenue lors de l\'exécution de la commande.');
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);