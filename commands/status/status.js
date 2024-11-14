const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

// Chemin vers le fichier de configuration du statut
const statusConfigPath = path.join(process.cwd(), 'data', 'status-config.json');

// Fonction pour sauvegarder le statut
function saveStatus(type, text) {
    try {
        // Créer le dossier data s'il n'existe pas
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }
        
        fs.writeFileSync(statusConfigPath, JSON.stringify({ type, text }));
    } catch (error) {
        console.error('Erreur lors de la sauvegarde du statut:', error);
    }
}

module.exports = {
    name: 'status',
    description: 'Modifier le statut du bot via un menu interactif',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Vous devez être administrateur pour utiliser cette commande.');
        }

        const serverColor = colorManager.getColor(message.guild.id);

        const currentActivity = client.user.presence?.activities[0] || null;
        const currentType = currentActivity ? getActivityTypeName(currentActivity.type) : 'Aucun';
        const currentName = currentActivity?.name || 'Aucun';

        const embed = new EmbedBuilder()
            .setColor(serverColor)
            .setTitle('📊 Modification du statut du bot')
            .setDescription('Sélectionnez le type de statut que vous souhaitez définir.')
            .addFields(
                { name: 'Statut actuel', value: `Type: ${currentType}\nTexte: ${currentName}` }
            )
            .setFooter({ text: 'Cliquez sur un bouton pour modifier le statut' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('status_playing')
                    .setLabel('Joue à')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('status_watching')
                    .setLabel('Regarde')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('status_listening')
                    .setLabel('Écoute')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('status_competing')
                    .setLabel('Participe à')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('status_custom')
                    .setLabel('Personnalisé')
                    .setStyle(ButtonStyle.Success)
            );

        const msg = await message.reply({ embeds: [embed], components: [row] });

        const filter = i => i.user.id === message.author.id;
        const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async interaction => {
            const type = interaction.customId.split('_')[1];
            
            await interaction.reply({ 
                content: 'Veuillez entrer le texte du statut (vous avez 30 secondes pour répondre):', 
                ephemeral: true 
            });

            const messageFilter = m => m.author.id === interaction.user.id;
            try {
                const collected = await message.channel.awaitMessages({
                    filter: messageFilter,
                    max: 1,
                    time: 30000,
                    errors: ['time']
                });

                const statusText = collected.first().content;
                const activityType = type === 'custom' ? ActivityType.Custom : {
                    'playing': ActivityType.Playing,
                    'watching': ActivityType.Watching,
                    'listening': ActivityType.Listening,
                    'competing': ActivityType.Competing
                }[type];

                await client.user.setActivity(statusText, { type: activityType });
                saveStatus(activityType, statusText);

                const updatedEmbed = EmbedBuilder.from(embed)
                    .setFields(
                        { name: 'Statut actuel', value: `Type: ${type}\nTexte: ${statusText}` }
                    )
                    .setColor('#00ff00');

                await msg.edit({ embeds: [updatedEmbed], components: [row] });
                await collected.first().delete().catch(() => {});
                await interaction.followUp({ 
                    content: '✅ Statut mis à jour avec succès !', 
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Erreur lors de la mise à jour du statut:', error);
                await interaction.followUp({ 
                    content: '❌ Temps écoulé ou une erreur est survenue.', 
                    ephemeral: true 
                });
            }
        });

        collector.on('end', () => {
            if (msg.editable) {
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        ...row.components.map(button => ButtonBuilder.from(button).setDisabled(true))
                    );
                msg.edit({ components: [disabledRow] }).catch(() => {});
            }
        });
    },
};

function getActivityTypeName(type) {
    const types = {
        [ActivityType.Playing]: 'Joue à',
        [ActivityType.Watching]: 'Regarde',
        [ActivityType.Listening]: 'Écoute',
        [ActivityType.Competing]: 'Participe à',
        [ActivityType.Custom]: 'Personnalisé',
        [ActivityType.Streaming]: 'Streame'
    };
    return types[type] || 'Inconnu';
}