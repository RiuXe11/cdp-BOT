const { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const path = require('path');
const fs = require('fs');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

// Fonction pour charger la configuration du préfixe
function loadPrefixConfig() {
    const configPath = path.join(process.cwd(), 'data/set-prefix/config.json');
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath));
            return config.currentPrefix;
        }
        return '!';
    } catch (error) {
        console.error('Erreur lors du chargement du préfixe:', error);
        return '!';
    }
}

// Organiser les commandes par catégories
function getCommandsByCategory(prefix) {
    return {
        "📝 Configuration du bot": [
            { name: `${prefix}status`, description: 'Permet de modifier le statut du bot.' },
            { name: `${prefix}set-color`, description: 'Permet de modifier la couleur des embeds.' },
            { name: `${prefix}set-prefix`, description: 'Permet de modifier le préfixe.' },
        ],
        "⚙️ Administration": [
            { name: `${prefix}invite`, description: 'Permet d\'inviter le bot.' },
            { name: `${prefix}music`, description: 'Permet de voir les commandes pour gérer la musique.' },
            { name: `${prefix}rolemenu [ID]`, description: 'Permet de créer un rolemenu.\n└ Si vous ajoutez un ID ça modifiera un rolemnu existant.' },
            { name: `${prefix}renew`, description: 'Permet de recréer un salon avec ou sans nouveau nom.' },
            { name: `${prefix}vote`, description: 'Permet de gérer les votes.' },
            { name: `${prefix}embed`, description: 'Permet de créer des embeds.' },
            { name: `${prefix}embed-modify`, description: 'Permet de modifier des embeds existant.' },
            { name: `${prefix}setpermission`, description: '⚠️ **UNIQUEMENT POUR LES ADMINISTRATEURS** : Permet de gérer les permissions des commandes.' },
        ],
    };
}

module.exports = {
    name: 'help',
    description: 'Affiche la liste des commandes disponibles',
    async execute(message) {
        const serverColor = colorManager.getColor(message.guild.id);
        const currentPrefix = loadPrefixConfig();
        const categories = getCommandsByCategory(currentPrefix);
        const categoryNames = Object.keys(categories);
        let currentPage = 0;

        // Création des boutons
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('previous')
                    .setLabel('◀️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Secondary)
            );

        // Fonction pour générer l'embed d'une page
        function generateEmbed(pageIndex) {
            const categoryName = categoryNames[pageIndex];
            const commands = categories[categoryName];
            
            return new EmbedBuilder()
                .setColor(serverColor)
                .setTitle(`${categoryName}`)
                .setDescription(
                    commands.map(cmd => `\`${cmd.name}\`\n└ ${cmd.description}`).join('\n\n')
                )
                .setFooter({ 
                    text: `Page ${pageIndex + 1}/${categoryNames.length} | Préfixe actuel : ${currentPrefix} | ${currentPrefix}help` 
                });
        }

        // Envoyer le message initial
        const helpMessage = await message.channel.send({
            embeds: [generateEmbed(currentPage)],
            components: [buttons]
        });

        // Créer le collecteur pour les interactions avec les boutons
        const collector = helpMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes
        });

        collector.on('collect', async interaction => {
            // Vérifier que c'est l'auteur du message qui clique
            if (interaction.user.id !== message.author.id) {
                await interaction.reply({
                    content: 'Vous ne pouvez pas utiliser ces boutons.',
                    ephemeral: true
                });
                return;
            }

            // Mettre à jour la page selon le bouton cliqué
            if (interaction.customId === 'previous') {
                currentPage = currentPage > 0 ? currentPage - 1 : categoryNames.length - 1;
            } else if (interaction.customId === 'next') {
                currentPage = currentPage < categoryNames.length - 1 ? currentPage + 1 : 0;
            }

            // Mettre à jour le message
            await interaction.update({
                embeds: [generateEmbed(currentPage)],
                components: [buttons]
            });
        });

        // Quand le temps est écoulé, désactiver les boutons
        collector.on('end', () => {
            buttons.components.forEach(button => button.setDisabled(true));
            helpMessage.edit({ components: [buttons] }).catch(console.error);
        });
    },
};