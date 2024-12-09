const { checkPermission } = require('../../commands/moderation/permissionManager/permissionManager');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        try {
            // Vérifier que le client et la collection des commandes existent
            if (!client || !client.commands) {
                console.error('❌ Client ou collection des commandes non initialisé');
                return;
            }

            // Charger directement la configuration du préfixe
            const prefixConfigPath = path.join(process.cwd(), 'data/set-prefix/config.json');
            let config = { defaultPrefix: '!', currentPrefix: '!' };

            try {
                if (fs.existsSync(prefixConfigPath)) {
                    const data = fs.readFileSync(prefixConfigPath, 'utf8');
                    config = JSON.parse(data);
                }
            } catch (error) {
                console.error('Erreur lors du chargement de la configuration du préfixe:', error);
            }
            
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
            console.error('❌ Erreur dans messageCreate:', error);
            message.reply('Une erreur est survenue lors de l\'exécution de la commande.').catch(console.error);
        }
    }
};