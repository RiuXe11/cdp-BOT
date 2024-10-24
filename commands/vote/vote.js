const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

const CONFIG_PATH = path.join(__dirname, '../../data/vote/voteConfigs.json');

if (!fs.existsSync(path.join(__dirname, '../../data'))) {
    fs.mkdirSync(path.join(__dirname, '../../data'));
}

// Stockage des configurations de vote
const voteConfigs = new Map();

// Configuration par défaut
const defaultConfig = {
    linkTimeLimit: null,
    voteTimeLimit: null,
    showLoading: false,
    maxLinks: null,
    linksChannel: null,
    voteChannel: null
};

function loadConfigs() {
    if (fs.existsSync(CONFIG_PATH)) {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        const configs = JSON.parse(data);
        Object.entries(configs).forEach(([guildId, config]) => {
            voteConfigs.set(guildId, config);
        });
    }
}

// Fonction pour sauvegarder les configurations
function saveConfigs() {
    const configs = Object.fromEntries(voteConfigs);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configs, null, 2));
}

// Appeler loadConfigs au début du fichier
loadConfigs();

function parseTime(timeStr) {
    const parts = timeStr.toLowerCase().split(' ');
    let totalMilliseconds = 0;
    
    for (const part of parts) {
        const value = parseInt(part);
        if (isNaN(value)) continue;
        
        if (part.endsWith('m')) {
            totalMilliseconds += value * 30 * 24 * 60 * 60 * 1000; // mois
        } else if (part.endsWith('j')) {
            totalMilliseconds += value * 24 * 60 * 60 * 1000; // jours
        } else if (part.endsWith('mn')) {
            totalMilliseconds += value * 60 * 1000; // minutes
        } else if (part.endsWith('s')) {
            totalMilliseconds += value * 1000; // secondes
        }
    }
    
    return totalMilliseconds;
}

function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);

    const parts = [];
    if (months > 0) parts.push(`${months}m`);
    if (days % 30 > 0) parts.push(`${days % 30}j`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}mn`);
    if (seconds % 60 > 0) parts.push(`${seconds % 60}s`);

    return parts.join(' ') || '0s';
}

// Fonction pour créer l'embed avec l'état actuel
function createConfigEmbed(config) {
    const embed = new EmbedBuilder()
        .setTitle('⚙️ | Configuration du vote')
        .setDescription('👆 Cliquez sur les boutons pour configurer le vote')
        .setColor('#0099ff')
        .addFields(
            { 
                name: '⏳ | Temps des liens', 
                value: config.linkTimeLimit ? formatTime(config.linkTimeLimit) : 'Non configuré',
                inline: true 
            },
            { 
                name: '⏳ | Temps de vote', 
                value: config.voteTimeLimit ? formatTime(config.voteTimeLimit) : 'Non configuré',
                inline: true 
            },
            { 
                name: '⌛ | Barre de chargement', 
                value: config.showLoading ? 'Activée' : 'Désactivée',
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
            }
        );

    return embed;
}

module.exports = {
    name: 'vote',
    description: 'Crée un système de vote avec gestion de liens',
    async execute(message, args, client) {
        // Récupérer la configuration existante ou en créer une nouvelle
        const existingConfig = voteConfigs.get(message.guild.id);
        voteConfigs.set(message.guild.id, existingConfig || { ...defaultConfig });
        const config = voteConfigs.get(message.guild.id);
        
        // Créer les boutons
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
                .setCustomId('vote_channel')
                .setLabel('Salon vote')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('links_channel')
                .setLabel('Salon liens')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('max_links')
                .setLabel('Nombre de liens')
                .setStyle(ButtonStyle.Secondary)
        );

        const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder() // Ajout du nouveau bouton
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
            components: [row1, row2, row3] 
        });
        
        // Configurer le gestionnaire d'interactions pour ce guild
        client.on('interactionCreate', async interaction => {
            if (!interaction.isButton()) return;
            if (interaction.message.id !== configMessage.id) return;

            const config = voteConfigs.get(interaction.guild.id);
            if (!config) return;

            await handleButtonInteraction(interaction, config, configMessage);
        });
    }
};

// Fonction de gestion des interactions avec les boutons
async function handleButtonInteraction(interaction, config, configMessage) {
    const replyMessage = await interaction.deferReply({ fetchReply: true });
    
    switch (interaction.customId) {
        case 'link_time_limit':
            await interaction.editReply('Combien de temps pour les liens ? (ex: 1j 30mn)');
            const linkTimeCollector = interaction.channel.createMessageCollector({
                filter: m => m.author.id === interaction.user.id,
                time: 30000,
                max: 1
            });

            linkTimeCollector.on('collect', async m => {
                const timeInMs = parseTime(m.content);
                if (timeInMs === 0) {
                    const errorMsg = await interaction.followUp('Format de temps invalide');
                    await m.delete();
                    setTimeout(() => {
                        errorMsg.delete();
                        replyMessage.delete();
                    }, 3000);
                    return;
                }
                config.linkTimeLimit = timeInMs;
                saveConfigs();
                const confirmMsg = await interaction.followUp(`Temps des liens configuré à ${formatTime(timeInMs)}`);
                await configMessage.edit({ embeds: [createConfigEmbed(config)] });
                await m.delete();
                setTimeout(() => {
                    confirmMsg.delete();
                    replyMessage.delete();
                }, 3000);
            });
            break;

        case 'vote_time_limit':
            await interaction.editReply('Combien de temps pour les votes ? (ex: 1j 30mn)');
            const voteTimeCollector = interaction.channel.createMessageCollector({
                filter: m => m.author.id === interaction.user.id,
                time: 30000,
                max: 1
            });

            voteTimeCollector.on('collect', async m => {
                const timeInMs = parseTime(m.content);
                if (timeInMs === 0) {
                    const errorMsg = await interaction.followUp('Format de temps invalide');
                    await m.delete();
                    setTimeout(() => {
                        errorMsg.delete();
                        replyMessage.delete();
                    }, 3000);
                    return;
                }
                config.voteTimeLimit = timeInMs;
                saveConfigs();
                const confirmMsg = await interaction.followUp(`Temps de vote configuré à ${formatTime(timeInMs)}`);
                await configMessage.edit({ embeds: [createConfigEmbed(config)] });
                await m.delete();
                setTimeout(() => {
                    confirmMsg.delete();
                    replyMessage.delete();
                }, 3000);
            });
            break;
        
        case 'loading':
            config.showLoading = !config.showLoading; // Inverse l'état actuel
            await configMessage.edit({ embeds: [createConfigEmbed(config)] });
            await interaction.editReply({ 
                content: `Barre de chargement ${config.showLoading ? 'activée' : 'désactivée'}`
            });
            saveConfigs();
            setTimeout(() => {
                replyMessage.delete();
            }, 3000);
            break;

        case 'max_links':
            await interaction.editReply('Combien de liens maximum par utilisateur ?');
            const linksCollector = interaction.channel.createMessageCollector({
                filter: m => m.author.id === interaction.user.id,
                time: 30000,
                max: 1
            });

            linksCollector.on('collect', async m => {
                const max = parseInt(m.content);
                if (isNaN(max)) {
                    const errorMsg = await interaction.followUp('Nombre invalide');
                    await m.delete();
                    setTimeout(() => {
                        errorMsg.delete();
                        replyMessage.delete();
                    }, 3000);
                    return;
                }
                config.maxLinks = max;
                saveConfigs();
                const confirmMsg = await interaction.followUp(`Limite configurée à ${max} liens`);
                await configMessage.edit({ embeds: [createConfigEmbed(config)] });
                await m.delete();
                setTimeout(() => {
                    confirmMsg.delete();
                    replyMessage.delete();
                }, 3000);
            });
            break;

        case 'links_channel':
            await interaction.editReply('Mentionnez le salon pour les liens');
            const linksChanCollector = interaction.channel.createMessageCollector({
                filter: m => m.author.id === interaction.user.id,
                time: 30000,
                max: 1
            });

            linksChanCollector.on('collect', async m => {
                const channel = m.mentions.channels.first();
                if (!channel) {
                    const errorMsg = await interaction.followUp('Salon invalide');
                    await m.delete();
                    setTimeout(() => {
                        errorMsg.delete();
                        replyMessage.delete();
                    }, 3000);
                    return;
                }
                config.linksChannel = channel.id;
                saveConfigs();
                const confirmMsg = await interaction.followUp(`Salon des liens configuré à ${channel}`);
                await configMessage.edit({ embeds: [createConfigEmbed(config)] });
                await m.delete();
                setTimeout(() => {
                    confirmMsg.delete();
                    replyMessage.delete();
                }, 3000);
            });
            break;
        
        case 'vote_channel':
            await interaction.editReply('Mentionnez le salon pour les votes');
            const voteChanCollector = interaction.channel.createMessageCollector({
                filter: m => m.author.id === interaction.user.id,
                time: 30000,
                max: 1
            });
        
            voteChanCollector.on('collect', async m => {
                const channel = m.mentions.channels.first();
                if (!channel) {
                    const errorMsg = await interaction.followUp('Salon invalide');
                    await m.delete();
                    setTimeout(() => {
                        errorMsg.delete();
                        replyMessage.delete();
                    }, 3000);
                    return;
                }
                config.voteChannel = channel.id;
                saveConfigs();
                const confirmMsg = await interaction.followUp(`Salon des votes configuré à ${channel}`);
                await configMessage.edit({ embeds: [createConfigEmbed(config)] });
                await m.delete();
                setTimeout(() => {
                    confirmMsg.delete();
                    replyMessage.delete();
                }, 3000);
            });
            break;
        
        case 'start_vote':
            if (!isConfigComplete(config)) {
                await interaction.editReply({
                    content: 'Configuration incomplète. Veuillez configurer tous les paramètres avant de commencer.',
                    ephemeral: true
                });
                setTimeout(() => replyMessage.delete(), 3000);
                return;
            }
            await interaction.editReply('Démarrage du vote...');
            await startVoting(interaction.guild, config);
            setTimeout(() => replyMessage.delete(), 3000);
            break;

        case 'cancel_vote':
            await configMessage.delete();
            const cancelMsg = await interaction.editReply('Configuration annulée');
            setTimeout(() => {
                cancelMsg.delete();
                replyMessage.delete();
            }, 3000);
            break;
    }
}

function createEndButton(label) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('end_phase')
                .setLabel(label)
                .setStyle(ButtonStyle.Danger)
        );
}

// Vérifier si la configuration est complète
function isConfigComplete(config) {
    return config.linkTimeLimit && config.voteTimeLimit && config.maxLinks && config.linksChannel && config.voteChannel;
}

function createProgressBar(elapsed, total) {
    const progress = Math.min(100, Math.floor((elapsed / total) * 100));
    const bars = Math.floor(progress / 5); // 20 barres au total
    return `[${'█'.repeat(bars)}${'-'.repeat(20-bars)}] ${progress}%`;
}

function getTimeLeft(endTime) {
    const remaining = endTime - Date.now();
    return remaining > 0 ? formatTime(remaining) : '0s';
}

// Démarrer le processus de vote
async function startVoting(guild, config) {
    const linksChannel = guild.channels.cache.get(config.linksChannel);
    const voteChannel = guild.channels.cache.get(config.voteChannel);
    const userLinks = new Map();
    let votePhaseStarted = false;
    
    const endTime = Date.now() + config.linkTimeLimit;
    const embed = new EmbedBuilder()
        .setTitle('Phase des liens')
        .setDescription(
            config.showLoading 
                ? `Temps restant: ${formatTime(config.linkTimeLimit)}\n${createProgressBar(0, config.linkTimeLimit)}`
                : `Temps restant: ${formatTime(config.linkTimeLimit)}`
        )
        .setColor('#0099ff');

    const message = await linksChannel.send({
        embeds: [embed],
        content: `Vous avez ${formatTime(config.linkTimeLimit)} pour envoyer vos liens (max ${config.maxLinks} liens par personne)`,
        components: [createEndButton('Terminer la phase des liens')]
    });

    // Mettre à jour la barre de progression
    const updateInterval = setInterval(async () => {
        const elapsed = Date.now() - message.createdTimestamp;
        const timeLeft = getTimeLeft(endTime);
        embed.setDescription(
            config.showLoading 
                ? `Temps restant: ${timeLeft}\n${createProgressBar(elapsed, config.linkTimeLimit)}`
                : `Temps restant: ${timeLeft}`
        );
        await message.edit({ embeds: [embed] });

        if (elapsed >= config.linkTimeLimit) {
            clearInterval(updateInterval);
        }
    }, 5000);
    
    // Collector pour les liens
    const linkCollector = linksChannel.createMessageCollector({
        time: config.linkTimeLimit
    });

    // Collector pour le bouton admin
    const buttonCollector = message.createMessageComponentCollector({ // Correction ici
        filter: i => i.customId === 'end_phase' && i.member.permissions.has('ADMINISTRATOR'),
    });

    // Fonction pour terminer la phase des liens
    const endLinkPhase = async () => {
        if (votePhaseStarted) return; // Ne pas démarrer si déjà démarré
        votePhaseStarted = true;
        linkCollector.stop();
        await startVotePhase(userLinks, voteChannel, config);
    };

    buttonCollector.on('collect', async i => {
        if (i.member.permissions.has('ADMINISTRATOR')) {
            await i.reply('Phase des liens terminée');
            endLinkPhase();
            buttonCollector.stop();
        } else {
            await i.reply({ content: 'Seuls les administrateurs peuvent terminer la phase', ephemeral: true });
        }
    });

    linkCollector.on('collect', async message => {
        // Trouver tous les liens dans le message
        const links = message.content.match(/https?:\/\/[^\s]+/g) || [];
        
        if (links.length > 0) {
            const userLinkCount = userLinks.get(message.author.id)?.length || 0;
            
            // Vérifier si l'ajout de ces liens dépasserait la limite
            if (userLinkCount + links.length > config.maxLinks) {
                await message.delete();
                await message.author.send(`Vous avez dépassé la limite de ${config.maxLinks} liens autorisés.`);
                return;
            }
            
            // Initialiser le tableau de liens pour l'utilisateur si nécessaire
            if (!userLinks.has(message.author.id)) {
                userLinks.set(message.author.id, []);
            }
            
            // Ajouter tous les liens trouvés
            userLinks.get(message.author.id).push(...links);
        }
    });
        
    linkCollector.on('end', () => {
        if (!votePhaseStarted) { // Vérifier si la phase n'a pas déjà démarré
            endLinkPhase();
        }
    });
}

async function displayResults(voteMessage, linksList) {
    const reactions = [...voteMessage.reactions.cache.values()];
    const results = reactions.map((reaction, index) => ({
        link: linksList[index],
        votes: reaction.count - 1 // -1 pour ne pas compter le vote du bot
    })).sort((a, b) => b.votes - a.votes);

    const resultsEmbed = new EmbedBuilder()
        .setTitle('Résultats du vote')
        .setColor('#00ff00');

    // Vérifier s'il y a des résultats
    if (results.length > 0) {
        resultsEmbed.setDescription(
            results.map((result, index) => 
                `${index + 1}. ${result.link} - ${result.votes} votes`
            ).join('\n')
        );
    } else {
        resultsEmbed.setDescription('Aucun vote n\'a été enregistré.');
    }

    await voteMessage.channel.send({ embeds: [resultsEmbed] });
}

async function startVotePhase(userLinks, voteChannel, config) {
    const endTime = Date.now() + config.voteTimeLimit;
    const voteEmbed = new EmbedBuilder()
        .setTitle('Vote')
        .setDescription(
            config.showLoading 
                ? `Temps restant: ${formatTime(config.voteTimeLimit)}\n${createProgressBar(0, config.voteTimeLimit)}\n\nVotez pour votre lien préféré`
                : `Temps restant: ${formatTime(config.voteTimeLimit)}\n\nVotez pour votre lien préféré`
        )
        .setColor('#00ff00');
    
    const emojis = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'];
    let linksList = [];
    let i = 0;
    
    userLinks.forEach((links, userId) => {
        links.forEach(link => {
            if (i < emojis.length) {
                linksList.push(`${emojis[i]} ${link}`);
                i++;
            }
        });
    });
    
    if (linksList.length > 0) {
        voteEmbed.addFields({ name: 'Liens', value: linksList.join('\n') });
    }
    
    const voteMessage = await voteChannel.send({
        embeds: [voteEmbed],
        components: [createEndButton('Terminer la phase de vote')]
    });

    // Ajouter les réactions
    for (let j = 0; j < i; j++) {
        await voteMessage.react(emojis[j]);
    }

    // Collector pour le bouton admin de fin de vote
    const voteButtonCollector = voteMessage.createMessageComponentCollector({
        filter: i => i.customId === 'end_phase' && i.member.permissions.has('ADMINISTRATOR'),
    });
    
    const updateInterval = setInterval(async () => {
        const elapsed = Date.now() - voteMessage.createdTimestamp;
        const timeLeft = getTimeLeft(endTime);
        voteEmbed.setDescription(
            config.showLoading 
                ? `Temps restant: ${timeLeft}\n${createProgressBar(elapsed, config.voteTimeLimit)}\n\nVotez pour votre lien préféré`
                : `Temps restant: ${timeLeft}\n\nVotez pour votre lien préféré`
        );
        
        if (linksList.length > 0) {
            voteEmbed.data.fields = [{ name: 'Liens', value: linksList.join('\n') }];
        }
        
        await voteMessage.edit({ embeds: [voteEmbed] });

        if (elapsed >= config.voteTimeLimit) {
            clearInterval(updateInterval);
        }
    }, 5000);

    voteButtonCollector.on('collect', async i => {
        if (i.member.permissions.has('ADMINISTRATOR')) {
            await i.reply('Phase de vote terminée');
            await displayResults(voteMessage, linksList);
            voteButtonCollector.stop();
        } else {
            await i.reply({ content: 'Seuls les administrateurs peuvent terminer la phase', ephemeral: true });
        }
    });

    // Timer pour la fin automatique du vote
    setTimeout(async () => {
        if (!voteButtonCollector.ended) {
            voteButtonCollector.stop();
            await voteChannel.send('Temps de vote écoulé !');
            await displayResults(voteMessage, linksList);
        }
    }, config.voteTimeLimit);

    voteButtonCollector.on('end', () => {
        clearInterval(updateInterval);
    });
}