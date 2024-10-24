module.exports = {
    name: 'messageReactionAdd',
    async execute(reaction, user) {
        // Ignore les réactions du bot
        if (user.bot) return;

        try {
            // Si la réaction n'est pas complètement chargée, on la récupère
            if (reaction.partial) {
                await reaction.fetch();
            }

            // Charge le fichier du menu pour vérifier si c'est un rolemenu
            const fs = require('fs').promises;
            const path = require('path');
            const dataPath = path.join(process.cwd(), 'data', 'rolemenus');
            
            // Lit tous les fichiers de rolemenu
            const files = await fs.readdir(dataPath);
            let roleMenu = null;
            
            for (const file of files) {
                const menuData = JSON.parse(
                    await fs.readFile(path.join(dataPath, file), 'utf8')
                );
                
                // Vérifie si ce menu correspond au message
                if (menuData.settings.messageId === reaction.message.id ||
                    (menuData.settings.style === 'Réaction' && 
                     menuData.settings.channel === reaction.message.channel.id)) {
                    roleMenu = menuData;
                    break;
                }
            }

            if (!roleMenu) return; // Pas un message de rolemenu

            // Trouve l'option correspondant à l'emoji
            const option = roleMenu.settings.options.find(opt => {
                const emoji = opt.emoji;
                // Compare les emojis customs
                if (emoji.includes(':')) {
                    return emoji === reaction.emoji.toString();
                }
                // Compare les emojis standards
                return emoji === reaction.emoji.name;
            });

            if (!option) return; // Emoji non trouvé dans les options

            const member = await reaction.message.guild.members.fetch(user.id);
            const role = await reaction.message.guild.roles.fetch(option.roleId);

            if (!role) {
                return await user.send('Ce rôle n\'existe plus.').catch(() => {});
            }

            // Vérifie si le bot peut gérer le rôle
            if (!role.editable) {
                await user.send('Je n\'ai pas la permission de gérer ce rôle.').catch(() => {});
                await reaction.users.remove(user);
                return;
            }

            // Gère l'ajout/retrait du rôle
            const hasRole = member.roles.cache.has(role.id);
            if (hasRole) {
                if (roleMenu.settings.type !== 'Donner') {
                    await member.roles.remove(role);
                    await user.send(`Le rôle ${role.name} vous a été retiré.`).catch(() => {});
                }
            } else {
                if (roleMenu.settings.type !== 'Retirer') {
                    await member.roles.add(role);
                    await user.send(`Le rôle ${role.name} vous a été ajouté.`).catch(() => {});
                }
            }

            // Retire la réaction de l'utilisateur si ce n'est pas un menu multiple
            if (!roleMenu.settings.isMultiple) {
                await reaction.users.remove(user);
            }

        } catch (error) {
            console.error('Erreur lors de la gestion de la réaction:', error);
            await user.send('Une erreur est survenue lors de la gestion du rôle.').catch(() => {});
        }
    }
};