const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'invite',
    description: 'Génère un lien d\'invitation pour le bot',
    execute(message) {
        const client = message.client;

        // Créer le lien d'invitation
        const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&integration_type=0&scope=bot`;

        message.reply({
            content: `🔗 **Lien d'invitation du bot:**\n${inviteLink}\n\n`
                + `Ce lien inclut les permissions suivantes:\n`
                + `• Voir les salons\n`
                + `• Envoyer des messages\n`
                + `• Voir l'historique des messages\n`
                + `• Gérer les salons\n`
                + `• Gérer les messages`
        });
    }
};