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

function getCommandsByCategory(prefix) {
    return {
        "🎵 Commande musique" : [
            { name: `${prefix}play <Lien Youtube>`, description: 'Vous permet de lancer une musique.'},
            { name: `${prefix}search <Nom de musique>`, description: 'Vous permet de lancer une musique via un nom.'},
            { name: `${prefix}pause` , description: `Vous permet de mettre en pause une musique, vous pouvez refaire ${prefix}pause pour remettre play.`},
            { name: `${prefix}stop`, description: 'Vous permet de stoper la session d\'écoute.'},
            { name: `${prefix}skip`, description: 'Vous permet de lancer la musique suivante.'},
            { name: `${prefix}nomplaying`, description: 'Vous permet de voir la musique qui est jouée.'},
            { name: `${prefix}queue <Lien musique>`, description: 'Vous permet voir la queue, et si vous rajoutez un lien, la musique sera rajoutée à la queue.'},
            { name: `${prefix}volume 0-100`, description: 'Vous permet d\'augmenter ou diminuer le volume du bot.'},
        ],
    };
}

module.exports = {
    name: 'music',
    description: 'Affiche la liste des commandes pour gérer la musique.',
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
        const musicMessage = await message.channel.send({
            embeds: [generateEmbed(currentPage)],
            components: [buttons]
        });

        // Créer le collecteur pour les interactions avec les boutons
        const collector = musicMessage.createMessageComponentCollector({
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
            musicMessage.edit({ components: [buttons] }).catch(console.error);
        });
    },
};