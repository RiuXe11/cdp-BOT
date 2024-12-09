const { Events, PermissionsBitField } = require('discord.js');
const { sendBotInfo } = require('../../utils/registration');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        // Ignorer les réactions des bots
        if (user.bot) return;

        // Vérifier si c'est un message de mise à jour de bot
        if (!reaction.message.content.startsWith('!bot-update')) return;

        // Vérifier si c'est la réaction 🔄
        if (reaction.emoji.name !== '🔄') return;

        try {
            // Vérifier les permissions du bot
            const botPermissions = reaction.message.channel.permissionsFor(reaction.client.user);
            
            // Tenter de supprimer la réaction uniquement si on a la permission
            if (botPermissions.has(PermissionsBitField.Flags.ManageMessages)) {
                try {
                    await reaction.users.remove(user.id);
                } catch (error) {
                    console.warn('⚠️ | Impossible de supprimer la réaction:', error.message);
                }
            }

            // Mettre à jour les informations si on a les permissions nécessaires
            if (botPermissions.has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks
            ])) {
                console.log('🔄 | Rechargement des informations demandé par', user.tag);
                await sendBotInfo(reaction.client, reaction.message.channel.id);
            } else {
                console.error('❌ | Permissions manquantes pour la mise à jour');
                // Optionnel: envoyer un message privé à l'utilisateur
                try {
                    await user.send('❌ Le bot n\'a pas les permissions nécessaires pour mettre à jour les informations.');
                } catch {
                    // Ignorer si on ne peut pas envoyer de MP
                }
            }
        } catch (error) {
            console.error('❌ | Erreur lors du rechargement des informations:', error);
        }
    }
};