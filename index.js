const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { checkPermission } = require('./commands/moderation/permissionManager/permissionManager');
const CommandHandler = require('./handlers/CommandHandler');
const EventHandler = require('./handlers/EventHandler');
const fs = require("fs");
const dotenv = require('dotenv');
const path = require("path");
<<<<<<< HEAD
const { connect } = require('./config/database/database');
=======
const ffmpeg = require('ffmpeg-static');

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
>>>>>>> 6cdedf7dda329b114f6b38baceebd76b6235c97a

dotenv.config();

// Configuration du préfixe
const prefixConfigPath = path.join(__dirname, 'data/set-prefix/config.json');
let config = { defaultPrefix: '!', currentPrefix: '!' };

// Création du client Discord
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
<<<<<<< HEAD
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.GuildIntegrations
=======
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
>>>>>>> 6cdedf7dda329b114f6b38baceebd76b6235c97a
    ]
});

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

// Rendre la config accessible globalement
client.config = config;
client.loadPrefixConfig = loadPrefixConfig;

// Initialisation des handlers
const commandHandler = new CommandHandler(client);
const eventHandler = new EventHandler(client);

connect();

// Chargement des commandes et des événements
<<<<<<< HEAD
(async () => {
    try {
        await commandHandler.loadCommands();
        eventHandler.loadEvents();
    } catch (error) {
        console.error('Erreur lors du chargement:', error);
=======
loadCommands(path.join(__dirname, 'commands'));
loadEvents(path.join(__dirname, 'events'));

fs.watchFile(prefixConfigPath, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
        console.log('Configuration du préfixe modifiée, rechargement...');
        loadPrefixConfig();
>>>>>>> 6cdedf7dda329b114f6b38baceebd76b6235c97a
    }
})();

client.on('error', (error) => {
    console.error('❌ Erreur Discord.js:', error);
});

<<<<<<< HEAD
// Démarrage du bot
=======
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

const ffmpegPath = ffmpeg.replace(/\//g, '\\');
process.env.FFMPEG_PATH = ffmpegPath;
process.env.PATH = `${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH}`;

>>>>>>> 6cdedf7dda329b114f6b38baceebd76b6235c97a
client.login(process.env.DISCORD_BOT_TOKEN);