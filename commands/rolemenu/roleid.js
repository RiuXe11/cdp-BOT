const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

async function loadRoleMenu(id) {
    try {
        // Utilisez process.cwd() pour obtenir le chemin absolu du projet
        const filePath = path.join(process.cwd(), 'data', 'rolemenus', `${id}.json`);

        const data = await fs.readFile(filePath, 'utf8');

        const parsedData = JSON.parse(data);
        return {
            id: parsedData.id,
            settings: parsedData.settings
        };
    } catch (error) {
        console.error(`Erreur lors du chargement du menu ${id}:`, error);
        return null;
    }
}

async function getAllRoleMenus() {
    try {
        // Utilisez process.cwd() pour obtenir le chemin absolu du projet
        const savePath = path.join(process.cwd(), 'data', 'rolemenus');
        console.log('Recherche des menus dans:', savePath);

        // Vérifie si le dossier existe
        try {
            await fs.access(savePath);
        } catch (error) {
            console.log('Le dossier rolemenus n\'existe pas encore');
            return [];
        }

        const files = await fs.readdir(savePath);

        if (files.length === 0) {
            console.log('Aucun fichier trouvé dans le dossier');
            return [];
        }
        
        const menus = await Promise.all(
            files
                .filter(f => f.endsWith('.json'))
                .map(async f => {
                    try {
                        const id = parseInt(f.slice(0, -5));
                        const menu = await loadRoleMenu(id);
                        if (menu) {
                            return menu;
                        }
                        return null;
                    } catch (error) {
                        console.error(`Erreur lors du chargement du menu ${f}:`, error);
                        return null;
                    }
                })
        );

        const validMenus = menus.filter(menu => menu !== null);
        return validMenus;
    } catch (error) {
        console.error('Erreur lors du chargement des menus:', error);
        return [];
    }
}

module.exports = {
    name: 'roleid',
    description: 'Affiche la liste des rolemenus existants',
    permissions: [PermissionFlagsBits.ManageRoles],
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('Vous n\'avez pas la permission de gérer les rôles !');
        }

        try {
            // Affiche un message de chargement
            const loadingMessage = await message.channel.send('Chargement des rolemenus...');

            console.log('Chargement des menus...');
            const menus = await getAllRoleMenus();

            // Supprime le message de chargement
            await loadingMessage.delete().catch(() => {});

            if (menus.length === 0) {
                return message.reply('Aucun rolemenu n\'a été créé pour le moment.');
            }

            // Crée des embeds pour chaque groupe de 10 menus (limite Discord)
            const embeds = [];
            const menusPerPage = 10;
            
            for (let i = 0; i < menus.length; i += menusPerPage) {
                const serverColor = colorManager.getColor(message.guild.id);
                const embed = new EmbedBuilder()
                    .setTitle('Liste des RoleMenus')
                    .setColor(serverColor)
                    .setDescription('Voici la liste des rolemenus existants:')
                    .setTimestamp();

                const pageMenus = menus.slice(i, i + menusPerPage);
                
                for (const menu of pageMenus) {
                    if (!menu.settings) continue;

                    const optionsCount = menu.settings.options?.length || 0;
                    const channelMention = menu.settings.channel ? `<#${menu.settings.channel}>` : 'Non défini';
                    
                    const fieldValue = [
                        `📍 Salon: ${channelMention}`,
                        `🎯 Style: ${menu.settings.style || 'Non défini'}`,
                        `⚙️ Type: ${menu.settings.type || 'Non défini'}`,
                        `🔢 Options: ${optionsCount}`,
                        menu.settings.messageType === 'custom' ? 
                            `💬 Message: ${menu.settings.messageContent?.slice(0, 50)}${menu.settings.messageContent?.length > 50 ? '...' : ''}` :
                            `🔗 Message ID: ${menu.settings.messageId || 'Non défini'}`
                    ].join('\n');

                    embed.addFields({
                        name: `ID: ${menu.id}`,
                        value: fieldValue,
                        inline: false
                    });
                }

                if (menus.length > menusPerPage) {
                    embed.setFooter({
                        text: `Page ${embeds.length + 1}/${Math.ceil(menus.length / menusPerPage)}`
                    });
                }

                embeds.push(embed);
            }

            // Si aucun embed n'a été créé (cas où tous les menus sont invalides)
            if (embeds.length === 0) {
                return message.reply('Aucun rolemenu valide n\'a été trouvé.');
            }

            // Envoie le premier embed
            let currentPage = 0;
            const embedMessage = await message.channel.send({
                embeds: [embeds[currentPage]],
                components: embeds.length > 1 ? [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('prev_page')
                                .setLabel('◀️')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true),
                            new ButtonBuilder()
                                .setCustomId('next_page')
                                .setLabel('▶️')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(embeds.length === 1)
                        )
                ] : []
            });

            if (embeds.length > 1) {
                const collector = embedMessage.createMessageComponentCollector({
                    time: 300000
                });

                collector.on('collect', async interaction => {
                    if (interaction.user.id !== message.author.id) {
                        return interaction.reply({
                            content: 'Vous ne pouvez pas utiliser ces boutons.',
                            ephemeral: true
                        });
                    }

                    await interaction.deferUpdate();

                    if (interaction.customId === 'prev_page' && currentPage > 0) {
                        currentPage--;
                    } else if (interaction.customId === 'next_page' && currentPage < embeds.length - 1) {
                        currentPage++;
                    }

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('prev_page')
                                .setLabel('◀️')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(currentPage === 0),
                            new ButtonBuilder()
                                .setCustomId('next_page')
                                .setLabel('▶️')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(currentPage === embeds.length - 1)
                        );

                    await embedMessage.edit({
                        embeds: [embeds[currentPage]],
                        components: [row]
                    });
                });

                collector.on('end', () => {
                    embedMessage.edit({ components: [] }).catch(() => {});
                });
            }

        } catch (error) {
            console.error('Erreur lors de la lecture des rolemenus:', error);
            return message.reply('Une erreur est survenue lors de la lecture des rolemenus.');
        }
    }
};