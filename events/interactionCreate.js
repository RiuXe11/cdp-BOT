module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

        // Vérifie si l'interaction concerne un rolemenu
        if (!interaction.customId.startsWith('role_')) return;

        // Extrait l'ID du rôle du customId
        const roleId = interaction.customId.split('_')[1];
        const role = interaction.guild.roles.cache.get(roleId);

        if (!role) {
            return await interaction.reply({
                content: 'Ce rôle n\'existe plus.',
                ephemeral: true
            });
        }

        try {
            const member = interaction.member;
            const hasRole = member.roles.cache.has(roleId);

            // Vérifie si le bot a la permission de gérer ce rôle
            if (!role.editable) {
                return await interaction.reply({
                    content: 'Je n\'ai pas la permission de gérer ce rôle.',
                    ephemeral: true
                });
            }

            // Par sécurité, vérifie si l'utilisateur a déjà le rôle maximum autorisé
            // si le mode multiple n'est pas activé
            const memberRoleCount = member.roles.cache.size;
            if (memberRoleCount >= 250) {
                return await interaction.reply({
                    content: 'Vous avez atteint la limite maximum de rôles.',
                    ephemeral: true
                });
            }

            let action;
            
            // Pour un sélecteur
            if (interaction.isStringSelectMenu()) {
                if (hasRole) {
                    await member.roles.remove(role);
                    action = 'retiré';
                } else {
                    await member.roles.add(role);
                    action = 'ajouté';
                }
            }
            // Pour un bouton
            else {
                if (hasRole) {
                    await member.roles.remove(role);
                    action = 'retiré';
                } else {
                    await member.roles.add(role);
                    action = 'ajouté';
                }
            }

            await interaction.reply({
                content: `Le rôle ${role.name} a été ${action} avec succès.`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Erreur lors de la gestion du rolemenu:', error);
            await interaction.reply({
                content: 'Une erreur est survenue lors de la gestion du rôle.',
                ephemeral: true
            });
        }
    }
};