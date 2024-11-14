const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const VoteManager = require('./voteManager');
const weekDays = VoteManager.weekDays;

const recurrenceLabels = {
    'disabled': 'Désactivé',
    'weekly': 'Chaque Semaine',
    'monthly': '1 fois par mois'
};

function formatDaysRange(days) {
    if (!days || days.length === 0) return '';

    const orderedDays = days.sort((a, b) => {
        const dayOrder = {
            'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
            'friday': 4, 'saturday': 5, 'sunday': 6
        };
        return dayOrder[a] - dayOrder[b];
    });

    const dayLabels = orderedDays.map(dayId => 
        weekDays.find(d => d.id === dayId)?.label
    );

    if (dayLabels.length === 1) {
        return `le ${dayLabels[0]}`;
    }
    return `du ${dayLabels[0]} au ${dayLabels[dayLabels.length - 1]}`;
}

function createConfigEmbed(config) {
    const embed = new EmbedBuilder()
        .setTitle('⚙️ | Configuration du vote')
        .setDescription('👆 Cliquez sur les boutons pour configurer le vote')
        .setColor('#0099ff');

    const formatDays = (days) => {
        if (!days || days.length === 0) return 'Non configuré';
        return days.map(day => weekDays.find(d => d.id === day)?.label || day).join(', ');
    };

    embed.addFields(
        { 
            name: '⏳ | Temps des liens', 
            value: `**Jours :** ${formatDays(config.linksDays)}\n**Fin :** 23:59`,
            inline: true 
        },
        { 
            name: '⏳ | Temps de vote', 
            value: `**Jours :** ${formatDays(config.voteDays)}\n**Fin :** 23:59`,
            inline: true 
        },
        { 
            name: '⌛ | Barre de chargement', 
            value: config.showLoading ? '**✅ Activée**' : '**❌ Désactivée**',
            inline: true 
        },
        {
            name: '💬 | Message',
            value: (config.messageTemplate || 'Message par défaut'),
            inline: true
        },
        { 
            name: '📋 | Salon de vote', 
            value: config.voteChannel ? `<#${config.voteChannel}>` : 'Non configuré',
            inline: true 
        },
        { 
            name: '📝 | Salon des liens', 
            value: config.linksChannel ? `<#${config.linksChannel}>` : 'Non configuré',
            inline: true 
        },
        { 
            name: '🔢 | Nombre de liens max', 
            value: config.maxLinks ? `${config.maxLinks} liens` : 'Non configuré',
            inline: true 
        },
        {
            name: '🔄 | Récurrence',
            value: recurrenceLabels[config.recurrence || 'disabled'],
            inline: true
        }
    );

    return embed;
}

async function isLinkPhaseAllowed(currentDay, config) {
    // Obtenir l'index du jour actuel (0 = Dimanche, 6 = Samedi)
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDayIndex = days.indexOf(currentDay);

    // Convertir les jours autorisés en indices
    const allowedDayIndices = config.linksDays.map(day => days.indexOf(day));
    
    // Si on est dimanche (0) et que lundi (1) est autorisé, on autorise le vote
    if (currentDay === 'sunday' && config.linksDays.includes('monday')) {
        return true;
    }

    // Vérifier si le jour actuel est dans la liste des jours autorisés
    return config.linksDays.includes(currentDay);
}

async function handleButtonInteraction(interaction, config, configMessage) {
    await interaction.deferUpdate();
    
    switch (interaction.customId) {
        case 'link_time_limit':
        case 'vote_time_limit':
            await handleTimeConfig(interaction, config, configMessage, interaction.customId === 'link_time_limit' ? 'links' : 'vote');
            break;
        
        case 'loading':
            config.showLoading = !config.showLoading;
            VoteManager.setConfig(interaction.guild.id, config);
            await interaction.followUp({ 
                content: `Barre de chargement ${config.showLoading ? '**activée**' : '**désactivée**'}`,
                ephemeral: true
            });
            await configMessage.edit({ embeds: [createConfigEmbed(config)] });
            break;

        case 'message_template':
            await handleMessageConfig(interaction, config, configMessage);
            break;
        
        case 'max_links':
            await handleMaxLinksConfig(interaction, config, configMessage);
            break;

        case 'recurrence':
            await handleRecurrenceConfig(interaction, config, configMessage);
            break;
        
        case 'links_channel':
        case 'vote_channel':
            await handleChannelConfig(interaction, config, configMessage, interaction.customId);
            break;
        //        
        case 'start_vote':
            try {
                if (!VoteManager.isConfigComplete(config)) {
                    await interaction.followUp({
                        content: 'Configuration incomplète. Veuillez configurer tous les paramètres avant de commencer.',
                        ephemeral: true
                    });
                    return;
                }
    
                // Obtenir le jour actuel
                const today = new Date();
                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const currentDay = days[today.getDay()];
    
                // Vérifier si le jour actuel est autorisé
                const isAllowed = await isLinkPhaseAllowed(currentDay, config);
                if (!isAllowed) {
                    const dayTranslations = {
                        'sunday': 'Dimanche',
                        'monday': 'Lundi',
                        'tuesday': 'Mardi',
                        'wednesday': 'Mercredi',
                        'thursday': 'Jeudi',
                        'friday': 'Vendredi',
                        'saturday': 'Samedi'
                    };
    
                    const allowedDays = config.linksDays
                        .map(day => dayTranslations[day])
                        .join(', ');
                    
                    await interaction.followUp({
                        content: `> - ⚠️ La phase de liens n'est pas autorisée aujourd'hui (**${dayTranslations[currentDay]}**).\n> - ✅ Jour utilisé : \`${allowedDays}\`\n> - ℹ️ Les liens seront disponibles à partir de **Lundi**`,
                        ephemeral: true
                    });
                    return;
                }
    
                await interaction.followUp('Démarrage du vote...');
                await VoteManager.startVoting(interaction.guild, config);
            } catch (error) {
                console.error('Erreur lors du démarrage du vote:', error);
                
                // Envoyer un message d'erreur approprié en fonction de l'erreur
                let errorMessage = '> - ❌ **Une erreur est survenue lors du démarrage du vote. Veuillez contacter l\'*Administrateur*.**';
                
                if (error.message.includes("Canal des liens invalide")) {
                    errorMessage = '> - ❌ Le salon des liens configuré n\'est pas valide. Veuillez reconfigurer le salon.';
                } else if (error.message.includes("Configuration incomplète")) {
                    errorMessage = '> - ❌ La configuration est incomplète. Veuillez vérifier tous les paramètres.';
                } else if (error.message.includes("La phase de liens n'est pas autorisée")) {
                    const allowedDays = config.linksDays
                        .map(day => day.charAt(0).toUpperCase() + day.slice(1))
                        .join(', ');
                    errorMessage = `> - ⚠️ La phase de liens n'est pas autorisée aujourd'hui.\n> - ✅ Jours autorisés : \`${allowedDays}\``;
                }
                
                await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true
                });
            }
            break;
            
        case 'end_phase':
            if (i.member.permissions.has('Administrator')) {
                // 1. Arrêter tous les collecteurs et intervals immédiatement
                const guildId = interaction.guild.id;
                const voteData = VoteManager.getVoteData(guildId);
                
                if (!voteData) return;

                // 2. Nettoyer explicitement tous les collecteurs et intervalles
                await VoteManager.clearIntervals(guildId);
                
                // 3. Supprimer le vote actif avant de passer à la phase suivante
                VoteManager.deleteVote(guildId);

                // 4. Notifier l'utilisateur
                await i.reply('Phase terminée manuellement');
                
                // 5. Passer à la phase suivante
                if (voteData.phase === 'links') {
                    await VoteManager.handleLinkPhaseEnd(message, voteData);
                } else if (voteData.phase === 'vote') {
                    await VoteManager.handleVotePhaseEnd(message, voteData);
                }
            } else {
                await i.reply({ 
                    content: 'Seuls les administrateurs peuvent terminer la phase', 
                    ephemeral: true 
                });
            }
            break;

        case 'cancel_vote':
            await configMessage.delete();
            const cancelMsg = await interaction.followUp('Configuration annulée');
            setTimeout(() => cancelMsg.delete(), 3000);
            break;
    }
}

async function handleMessageConfig(interaction, config, configMessage) {
    const helpText = '**Variables disponibles:**\n' +
        '`{lastDayLink}` - Dernier jour de la phase de liens\n' +
        '`{lastHourLink}` - Dernière heure pour envoyer les liens (23:59)\n' +
        '`{dayLink}` - Tous les jours de la phase de liens\n' +
        '`{dayVote}` - Tous les jours de la phase de vote\n' +
        '`{maxLink}` - Nombre maximum de liens par personne\n\n' +
        '**Message actuel :**\n\n' + (config.messageTemplate || '__Message par défaut :__ \n> ⌛ | Vous avez jusqu\'à {lastHourLink} le {lastDayLink} pour envoyer vos liens _(max {maxLink} liens par personne)_\n> 📅 | Liens : **{dayLink}**\n> 📅 | Votes : **{dayVote}**');

    await interaction.followUp({
        content: helpText + '\n\nEntrez votre nouveau message :',
        ephemeral: true
    });

    const collector = interaction.channel.createMessageCollector({
        filter: m => m.author.id === interaction.user.id,
        time: 300000,
        max: 1
    });

    collector.on('collect', async m => {
        config.messageTemplate = m.content;
        VoteManager.setConfig(interaction.guild.id, config);
        await m.delete();
        
        // Montrer un aperçu du message formaté
        const preview = VoteManager.formatTemplate(m.content, config);
        const confirmMsg = await interaction.followUp({
            content: '✅ Message configuré !\n\n**Aperçu :**\n' + preview,
            ephemeral: true
        });
    });
}

async function handleMaxLinksConfig(interaction, config, configMessage) {
    await interaction.followUp('Combien de liens maximum par utilisateur ?');
    const collector = interaction.channel.createMessageCollector({
        filter: m => m.author.id === interaction.user.id,
        time: 30000,
        max: 1
    });

    collector.on('collect', async m => {
        const max = parseInt(m.content);
        if (isNaN(max)) {
            const errorMsg = await interaction.followUp('Nombre invalide');
            await m.delete();
            setTimeout(() => errorMsg.delete(), 3000);
            return;
        }
        config.maxLinks = max;
        VoteManager.setConfig(interaction.guild.id, config);
        const confirmMsg = await interaction.followUp(`Limite configurée à ${max} liens`);
        await configMessage.edit({ embeds: [createConfigEmbed(config)] });
        await m.delete();
        setTimeout(() => confirmMsg.delete(), 3000);
    });
}

async function handleChannelConfig(interaction, config, configMessage, type) {
    const isVoteChannel = type === 'vote_channel';
    await interaction.followUp(`Mentionnez le salon pour les ${isVoteChannel ? 'votes' : 'liens'}`);
    const collector = interaction.channel.createMessageCollector({
        filter: m => m.author.id === interaction.user.id,
        time: 30000,
        max: 1
    });

    collector.on('collect', async m => {
        const channel = m.mentions.channels.first();
        if (!channel) {
            const errorMsg = await interaction.followUp('Salon invalide');
            await m.delete();
            setTimeout(() => errorMsg.delete(), 3000);
            return;
        }
        config[isVoteChannel ? 'voteChannel' : 'linksChannel'] = channel.id;
        VoteManager.setConfig(interaction.guild.id, config);
        const confirmMsg = await interaction.followUp(`Salon ${isVoteChannel ? 'des votes' : 'des liens'} configuré à ${channel}`);
        await configMessage.edit({ embeds: [createConfigEmbed(config)] });
        await m.delete();
        setTimeout(() => confirmMsg.delete(), 3000);
    });
}

async function handleTimeConfig(interaction, config, configMessage, type) {
    const embed = new EmbedBuilder()
        .setTitle(`⏰ Configuration du temps - ${type === 'links' ? 'Liens' : 'Vote'}`)
        .setDescription('Sélectionnez les jours')
        .setColor('#0099ff');

    if (config[`${type}Days`]) {
        embed.addFields({
            name: 'Jours actuellement configurés',
            value: config[`${type}Days`].length > 0 
                ? config[`${type}Days`].map(day => weekDays.find(d => d.id === day)?.label || day).join(', ')
                : 'Aucun jour sélectionné'
        });
    }

    const rows = createDaySelectionButtons(config, type);
    const timeConfigMessage = await interaction.channel.send({
        embeds: [embed],
        components: rows
    });

    const collector = timeConfigMessage.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id,
        time: 300000
    });

    collector.on('collect', async i => {
        const [configType, action] = i.customId.split('_');
        await handleTimeConfigButton(i, action, config, type, configMessage, timeConfigMessage, rows, embed);
    });
}

function createDaySelectionButtons(config, type) {
    const rows = [];
    const createButtonRow = (days) => {
        return new ActionRowBuilder()
            .addComponents(
                days.map(day => 
                    new ButtonBuilder()
                        .setCustomId(`${type}_${day.id}`)
                        .setLabel(day.label)
                        .setStyle(config[`${type}Days`]?.includes(day.id) ? ButtonStyle.Primary : ButtonStyle.Secondary)
                )
            );
    };

    rows.push(createButtonRow(weekDays.slice(0, 3)));
    rows.push(createButtonRow(weekDays.slice(3, 6)));
    rows.push(createButtonRow([weekDays[6]]));

    const controlRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`${type}_save`)
                .setLabel('Sauvegarder')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`${type}_back`)
                .setLabel('Retour')
                .setStyle(ButtonStyle.Danger)
        );

    rows.push(controlRow);
    return rows;
}

async function handleTimeConfigButton(interaction, action, config, type, configMessage, timeConfigMessage, rows, embed) {
    if (action === 'save') {
        VoteManager.setConfig(interaction.guild.id, config);
        await timeConfigMessage.delete();
        await interaction.reply({ content: '✅ Configuration sauvegardée !', ephemeral: true });
        await configMessage.edit({ embeds: [createConfigEmbed(config)] });
    }
    else if (action === 'back') {
        await timeConfigMessage.delete();
        await interaction.reply({ content: '❌ Configuration annulée', ephemeral: true });
    }
    else {
        if (!config[`${type}Days`]) {
            config[`${type}Days`] = [];
        }

        const dayIndex = config[`${type}Days`].indexOf(action);
        if (dayIndex > -1) {
            config[`${type}Days`].splice(dayIndex, 1);
        } else {
            config[`${type}Days`].push(action);
        }

        await updateTimeConfigMessage(interaction, config, type, rows, embed);
    }
}

async function updateTimeConfigMessage(interaction, config, type, rows, embed) {
    const updatedRows = rows.map(row => {
        if (!row.components[0].data.custom_id?.includes('save') && 
            !row.components[0].data.custom_id?.includes('back')) {
            return new ActionRowBuilder()
                .addComponents(
                    row.components.map(button => {
                        const [, buttonDay] = button.data.custom_id.split('_');
                        return new ButtonBuilder()
                            .setCustomId(button.data.custom_id)
                            .setLabel(button.data.label)
                            .setStyle(
                                config[`${type}Days`].includes(buttonDay) 
                                    ? ButtonStyle.Primary 
                                    : ButtonStyle.Secondary
                            );
                    })
                );
        }
        return row;
    });

    embed.data.fields = [{
        name: 'Jours actuellement configurés',
        value: config[`${type}Days`].length > 0 
            ? config[`${type}Days`].map(day => weekDays.find(d => d.id === day)?.label || day).join(', ')
            : 'Aucun jour sélectionné'
    }];

    await interaction.update({
        embeds: [embed],
        components: updatedRows
    });
}

async function handleRecurrenceConfig(interaction, config, configMessage) {
    const currentRecurrence = config.recurrence || 'disabled';
    let newRecurrence;

    switch (currentRecurrence) {
        case 'disabled':
            newRecurrence = 'weekly';
            break;
        case 'weekly':
            newRecurrence = 'monthly';
            break;
        case 'monthly':
            newRecurrence = 'disabled';
            break;
        default:
            newRecurrence = 'disabled';
    }

    config.recurrence = newRecurrence;
    VoteManager.setConfig(interaction.guild.id, config);

    await interaction.followUp({
        content: `Récurrence configurée sur: ${recurrenceLabels[newRecurrence]}`,
        ephemeral: true
    });

    await configMessage.edit({ embeds: [createConfigEmbed(config)] });
}

module.exports = {
    name: 'vote',
    description: 'Crée un système de vote avec gestion de liens',
    
    async init(client) {
        await VoteManager.init(client);
    },

    async execute(message, client, args) {
        const guildId = message.guild.id;
        let config = VoteManager.getConfig(guildId) || VoteManager.getDefaultConfig();
        //
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('link_time_limit')
                    .setLabel('Temps liens')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('vote_time_limit')
                    .setLabel('Temps vote')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('loading')
                    .setLabel('Loading')
                    .setStyle(ButtonStyle.Primary),

            );
    
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('message_template')
                    .setLabel('Message')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('vote_channel')
                    .setLabel('Salon vote')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('links_channel')
                    .setLabel('Salon liens')
                    .setStyle(ButtonStyle.Secondary),
            );
        
        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('max_links')
                    .setLabel('Nombre de liens')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('recurrence')
                    .setLabel('Récurrence')
                    .setStyle(ButtonStyle.Secondary)
            )

        const row4 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('start_vote')
                    .setLabel('Envoyer')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel_vote')
                    .setLabel('Annuler')
                    .setStyle(ButtonStyle.Danger)
            );

        const configMessage = await message.channel.send({ 
            embeds: [createConfigEmbed(config)], 
            components: [row1, row2, row3, row4] 
        });

        const collector = configMessage.createMessageComponentCollector({
            filter: (i) => i.user.id === message.author.id,
            time: 300000
        });

        collector.on('collect', async (interaction) => {
            const config = VoteManager.getConfig(interaction.guild.id);
            if (!config) return;
            await handleButtonInteraction(interaction, config, configMessage);
        });
        
        collector.on('end', async () => {
            const rows = [row1, row2, row3, row4].map(row => {
                return new ActionRowBuilder()
                    .addComponents(
                        row.components.map(button => 
                            ButtonBuilder.from(button).setDisabled(true)
                        )
                    );
            });

            try {
                await configMessage.edit({ components: rows });
            } catch (error) {
                console.log("Impossible de désactiver les boutons:", error);
            }
        });
    }
};