const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

class VoteManager {
    constructor() {
        this.activeVotes = new Map();
        this.voteConfigs = new Map();
        this.intervals = new Map();
        this.DATA_PATH = path.join(process.cwd(), 'data', 'vote');
        this.VOTE_PATH = path.join(this.DATA_PATH, 'activeVotes.json');
        this.CONFIG_PATH = path.join(this.DATA_PATH, 'voteConfigs.json');

        if (!fs.existsSync(this.DATA_PATH)) {
            fs.mkdirSync(this.DATA_PATH, { recursive: true });
        }

        this.defaultConfig = {
            linksDays: [],
            voteDays: [],
            showLoading: false,
            maxLinks: null,
            linksChannel: null,
            voteChannel: null,
            messageTemplate: '> ⌛ | Vous avez jusqu\'à {lastHourLink} le {lastDayLink} pour envoyer vos liens _(max {maxLink} liens par personne)_\n> 📅 | Liens : **{dayLink}**\n> 📅 | Votes : **{dayVote}**',
            recurrence: 'disabled', // 'weekly', 'monthly', 'disabled'
            lastExecutionDate: null
        };

        this.weekDays = [
            { id: 'monday', label: 'Lundi' },
            { id: 'tuesday', label: 'Mardi' },
            { id: 'wednesday', label: 'Mercredi' },
            { id: 'thursday', label: 'Jeudi' },
            { id: 'friday', label: 'Vendredi' },
            { id: 'saturday', label: 'Samedi' },
            { id: 'sunday', label: 'Dimanche' }
        ];

        this.recurringVotes = new Map();
        this.checkRecurrenceInterval = null;
    }

    async normalizeUrl(url) {
        try {
            // Créer un objet URL pour parser le lien
            const urlObj = new URL(url);
            // Supprimer les paramètres de tracking courants
            urlObj.searchParams.delete('utm_source');
            urlObj.searchParams.delete('utm_medium');
            urlObj.searchParams.delete('utm_campaign');
            // Supprimer les fragments (#)
            urlObj.hash = '';
            // Retourner l'URL normalisée
            return urlObj.toString().toLowerCase();
        } catch (error) {
            // Si l'URL est invalide, retourner l'original
            return url.toLowerCase();
        }
    }

    async checkDuplicateLinks(message, userLinks, newLinks) {
        const duplicates = [];
        const validLinks = [];
        
        const existingNormalizedLinks = new Set();
        
        if (userLinks instanceof Map) {
            for (const [, links] of userLinks) {
                if (Array.isArray(links)) {
                    for (const link of links) {
                        existingNormalizedLinks.add(await this.normalizeUrl(link)); // Ajout du this.
                    }
                }
            }
        } else if (typeof userLinks === 'object' && userLinks !== null) {
            for (const links of Object.values(userLinks)) {
                if (Array.isArray(links)) {
                    for (const link of links) {
                        existingNormalizedLinks.add(await this.normalizeUrl(link)); // Ajout du this.
                    }
                }
            }
        }
    
        for (const link of newLinks) {
            const normalizedLink = await this.normalizeUrl(link); // Ajout du this.
            
            if (existingNormalizedLinks.has(normalizedLink)) {
                duplicates.push(link);
            } else {
                validLinks.push(link);
                existingNormalizedLinks.add(normalizedLink);
            }
        }
    
        // Si des doublons sont trouvés, supprimer le message et notifier l'utilisateur
        if (duplicates.length > 0) {
            try {
                // Supprimer le message original
                await message.delete();
    
                // Créer le message d'erreur
                let errorMessage = `> ⚠️ | <@${message.author.id}>, ${duplicates.length === 1 ? 'ce lien a' : 'ces liens ont'} déjà été soumis:\n`;
                duplicates.forEach(link => {
                    errorMessage += `> \`${link}\`\n`;
                });
    
                // Si certains liens sont valides, les mentionner
                if (validLinks.length > 0) {
                    errorMessage += `\n> ✅ | ${validLinks.length === 1 ? 'Ce lien est valide' : 'Ces liens sont valides'}:\n`;
                    validLinks.forEach(link => {
                        errorMessage += `> \`${link}\`\n`;
                    });
                }
    
                // Envoyer le message d'erreur et le supprimer après 10 secondes
                const errorMsg = await message.channel.send({
                    content: errorMessage,
                    allowedMentions: { users: [message.author.id] }
                });
                setTimeout(() => errorMsg.delete().catch(console.error), 10000);
    
                return { valid: validLinks, hasDuplicates: true };
            } catch (error) {
                console.error('Erreur lors de la gestion des liens en double:', error);
                return { valid: [], hasDuplicates: true };
            }
        }
    
        return { valid: validLinks, hasDuplicates: false };
    }

    startRecurrenceCheck() {
        // Vérifier toutes les heures si des votes récurrents doivent être lancés
        this.checkRecurrenceInterval = setInterval(() => {
            this.checkAndExecuteRecurringVotes();
        }, 3600000); // 1 heure
    }

    async checkAndExecuteRecurringVotes() {
        const now = new Date();
        const isFirstWeekOfMonth = now.getDate() <= 7;
        
        for (const [guildId, config] of this.voteConfigs.entries()) {
            if (!config.recurrence || config.recurrence === 'disabled') continue;

            const shouldExecute = await this.shouldExecuteRecurringVote(config, isFirstWeekOfMonth);
            if (shouldExecute) {
                try {
                    const guild = await this.client.guilds.fetch(guildId);
                    if (!guild) continue;

                    // Nettoyer les anciens messages si nécessaire
                    await this.cleanupOldMessages(guild, config);

                    // Démarrer un nouveau vote
                    await this.startVoting(guild, config);

                    // Mettre à jour la date d'exécution
                    config.lastExecutionDate = now.toISOString();
                    this.setConfig(guildId, config);
                } catch (error) {
                    console.error(`Erreur lors de l'exécution du vote récurrent pour ${guildId}:`, error);
                }
            }
        }
    }

    async shouldExecuteRecurringVote(config, isFirstWeekOfMonth) {
        if (!config.lastExecutionDate) return true;

        const now = new Date();
        const lastExecution = new Date(config.lastExecutionDate);
        const daysSinceLastExecution = Math.floor((now - lastExecution) / (1000 * 60 * 60 * 24));

        if (config.recurrence === 'weekly') {
            return daysSinceLastExecution >= 7;
        } else if (config.recurrence === 'monthly') {
            if (isFirstWeekOfMonth) {
                const lastExecutionMonth = lastExecution.getMonth();
                const currentMonth = now.getMonth();
                return lastExecutionMonth !== currentMonth;
            }
            return false;
        }

        return false;
    }

    async cleanupOldMessages(guild, config) {
        try {
            const linksChannel = await guild.channels.fetch(config.linksChannel);
            const voteChannel = await guild.channels.fetch(config.voteChannel);

            // Pour le salon des liens, supprimer tous les messages
            if (linksChannel) {
                const messages = await linksChannel.messages.fetch({ limit: 100 });
                await linksChannel.bulkDelete(messages, true);
            }

            // Pour le salon de vote, ne garder que les résultats du dernier vote jusqu'au lundi soir
            if (voteChannel) {
                const now = new Date();
                const isMonday = now.getDay() === 1;

                if (!isMonday) {
                    const messages = await voteChannel.messages.fetch({ limit: 100 });
                    await voteChannel.bulkDelete(messages.filter(msg => {
                        const msgDate = msg.createdAt;
                        const isOldResult = msg.embeds?.some(embed => embed.title === 'Résultats du vote');
                        return !isOldResult || (isOldResult && msgDate < new Date(Date.now() - 24 * 60 * 60 * 1000));
                    }), true);
                }
            }
        } catch (error) {
            console.error('Erreur lors du nettoyage des messages:', error);
        }
    }

    formatTemplate(template, config) {
        // Obtenir le dernier jour de la phase de liens
        const lastDayLink = config.linksDays.map(day => 
            this.weekDays.find(d => d.id === day)?.label
        ).pop() || '';
    
        // Formater tous les jours pour les liens
        const dayLinks = config.linksDays.map(day => 
            this.weekDays.find(d => d.id === day)?.label
        ).join(', ');
    
        // Formater tous les jours pour les votes
        const dayVotes = config.voteDays.map(day => 
            this.weekDays.find(d => d.id === day)?.label
        ).join(', ');
    
        // Remplacer les variables dans le template
        return template
            .replace('{lastDayLink}', lastDayLink)
            .replace('{lastHourLink}', '23:59')
            .replace('{dayLink}', dayLinks)
            .replace('{dayVote}', dayVotes)
            .replace('{maxLink}', config.maxLinks);
    }

    isConfigComplete(config) {
        // Vérifier que les jours sont configurés pour les deux phases
        const hasLinkDays = config.linksDays && config.linksDays.length > 0;
        const hasVoteDays = config.voteDays && config.voteDays.length > 0;
        
        // Vérifier les autres paramètres requis
        const hasChannels = config.linksChannel && config.voteChannel;
        const hasMaxLinks = config.maxLinks > 0;
    
        console.log('Vérification de la configuration:');
        console.log(`- Jours des liens: ${hasLinkDays ? 'OK' : 'Manquant'}`);
        console.log(`- Jours de vote: ${hasVoteDays ? 'OK' : 'Manquant'}`);
        console.log(`- Canaux: ${hasChannels ? 'OK' : 'Manquant'}`);
        console.log(`- Nombre max de liens: ${hasMaxLinks ? 'OK' : 'Manquant'}`);
    
        return hasLinkDays && hasVoteDays && hasChannels && hasMaxLinks;
    }
    
    getDefaultConfig() {
        return { ...this.defaultConfig };
    }

    validateVotePhase(voteData) {
        if (voteData.phase === 'vote') {
            return (
                Array.isArray(voteData.linksList) &&
                Array.isArray(voteData.emojis) &&
                voteData.channelId &&
                voteData.messageId &&
                !voteData.userLinks // S'assurer qu'il n'y a pas de userLinks dans la phase de vote
            );
        }
        return true; // Pour les autres phases
    }

    validateVoteData(voteData) {
        return voteData &&
               voteData.phase &&
               voteData.channelId &&
               voteData.guildId &&
               voteData.startTime &&
               voteData.endTime &&
               this.validateVotePhase(voteData); // Ajouter cette validation
    }

    loadData() {
        try {
            if (fs.existsSync(this.VOTE_PATH)) {
                const voteData = JSON.parse(fs.readFileSync(this.VOTE_PATH, 'utf8'));
                for (const [guildId, vote] of Object.entries(voteData)) {
                    if (!vote || !vote.phase || !vote.channelId) {
                        console.log(`Données de vote invalides pour ${guildId}, ignorées`);
                        continue;
                    }
    
                    // Conversion des dates
                    const startTime = new Date(vote.startTime);
                    const endTime = new Date(vote.endTime);
                    const now = Date.now();
    
                    // Calculer le temps restant
                    const remainingTime = endTime.getTime() - now;
                    if (remainingTime <= 0) {
                        console.log(`Vote expiré pour ${guildId}, ignoré`);
                        continue;
                    }
    
                    // Restaurer les données
                    const restoredVote = {
                        ...vote,
                        startTime,
                        endTime: new Date(now + remainingTime),
                        config: {
                            ...(vote.config || {}),
                            showLoading: vote.config?.showLoading ?? false
                        },
                        userLinks: vote.userLinks || {},
                        totalDuration: vote.totalDuration || remainingTime,
                        phase: vote.phase,
                        linksList: vote.linksList || [],
                        emojis: vote.emojis || []
                    };
    
                    console.log(`Restauration des données pour ${guildId}:`, restoredVote);
                    this.activeVotes.set(guildId, restoredVote);
                }
            }
    
            if (fs.existsSync(this.CONFIG_PATH)) {
                const configData = JSON.parse(fs.readFileSync(this.CONFIG_PATH, 'utf8'));
                Object.entries(configData).forEach(([guildId, config]) => {
                    if (config) {
                        this.voteConfigs.set(guildId, config);
                    }
                });
            }
        } catch (error) {
            console.error('Erreur lors du chargement des données:', error);
            this.activeVotes.clear();
            this.voteConfigs.clear();
        }
    }

    saveData() {
        try {
            if (this.activeVotes.size === 0 && this.voteConfigs.size === 0) {
                console.log('Aucune donnée à sauvegarder');
                return;
            }
    
            const voteData = {};
            
            // Préparer les nouvelles données
            for (const [guildId, vote] of this.activeVotes) {
                // Ne pas sauvegarder si les données sont invalides
                if (!this.validateVoteData(vote)) continue;
    
                // Créer une copie profonde
                const voteCopy = JSON.parse(JSON.stringify(vote));
    
                // Traitement spécifique selon la phase
                if (voteCopy.phase === 'vote') {
                    // Structure pour la phase de vote
                    voteData[guildId] = {
                        phase: 'vote',
                        startTime: voteCopy.startTime,
                        endTime: voteCopy.endTime,
                        guildId: voteCopy.guildId,
                        channelId: voteCopy.channelId,
                        messageId: voteCopy.messageId,
                        config: voteCopy.config,
                        totalDuration: voteCopy.totalDuration,
                        linksList: voteCopy.linksList || [],
                        emojis: voteCopy.emojis || [],
                        userLinks: {} // Vider explicitement les userLinks
                    };
                } else {
                    // Structure pour la phase de liens
                    voteData[guildId] = {
                        phase: 'links',
                        startTime: voteCopy.startTime,
                        endTime: voteCopy.endTime,
                        guildId: voteCopy.guildId,
                        channelId: voteCopy.channelId,
                        messageId: voteCopy.messageId,
                        config: voteCopy.config,
                        totalDuration: voteCopy.totalDuration,
                        userLinks: voteCopy.userLinks instanceof Map ? 
                            Object.fromEntries(voteCopy.userLinks) : 
                            voteCopy.userLinks
                    };
                }
    
                // Conversion des dates en ISO string si nécessaire
                voteData[guildId].startTime = new Date(voteData[guildId].startTime).toISOString();
                voteData[guildId].endTime = new Date(voteData[guildId].endTime).toISOString();
            }
    
            // Sauvegarder de manière atomique
            if (!fs.existsSync(this.DATA_PATH)) {
                fs.mkdirSync(this.DATA_PATH, { recursive: true });
            }
    
            const tempPath = `${this.VOTE_PATH}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify(voteData, null, 2));
            fs.renameSync(tempPath, this.VOTE_PATH);
    
            // Sauvegarder les configurations
            if (this.voteConfigs.size > 0) {
                const tempConfigPath = `${this.CONFIG_PATH}.tmp`;
                fs.writeFileSync(tempConfigPath, JSON.stringify(Object.fromEntries(this.voteConfigs), null, 2));
                fs.renameSync(tempConfigPath, this.CONFIG_PATH);
            }
    
            console.log('Données sauvegardées avec succès', {
                numberOfVotes: this.activeVotes.size,
                phases: Object.values(voteData).map(v => v.phase)
            });
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des données:', error);
        }
    }

    async calculatePhaseEndTime(phase, config) {
        const now = new Date();
        const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
        
        // Sélectionner les jours configurés selon la phase
        const configuredDays = phase === 'vote' ? config.voteDays : config.linksDays;
        
        // Trouver le prochain jour valide dans la configuration
        let nextValidDay = null;
        let daysToAdd = 0;
        const today = now.getDay();
        
        for (let i = 0; i < 7; i++) {
            const checkDate = new Date(now);
            checkDate.setDate(checkDate.getDate() + i);
            const dayIndex = checkDate.getDay();
            const checkDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayIndex];
            
            if (configuredDays.includes(checkDay)) {
                // Si nous sommes déjà ce jour-là, vérifier si nous avons dépassé 23:59
                if (i === 0 && (now.getHours() >= 23 && now.getMinutes() >= 59)) {
                    continue; // Chercher le prochain jour
                }
                nextValidDay = checkDay;
                daysToAdd = i;
                // Ne pas break ici - on veut trouver le dernier jour configuré
            }
        }
        
        if (nextValidDay === null) {
            throw new Error('Aucun jour valide trouvé dans la configuration');
        }
        
        // Créer la date de fin (23:59 du prochain jour valide)
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + daysToAdd);
        endDate.setHours(23, 59, 0, 0);
        
        return endDate;
    }

    async startVoting(guild, config) {
        try {
            const existingVotes = {};
            if (fs.existsSync(this.VOTE_PATH)) {
                try {
                    const voteData = JSON.parse(fs.readFileSync(this.VOTE_PATH, 'utf8'));
                    // Copier toutes les données sauf celles de la guild actuelle
                    Object.entries(voteData).forEach(([guildId, vote]) => {
                        if (guildId !== guild.id) {
                            existingVotes[guildId] = vote;
                        }
                    });
                } catch (error) {
                    console.error('Erreur lors de la lecture des votes existants:', error);
                }
            }
            
            // Sauvegarder les votes existants
            if (!fs.existsSync(this.DATA_PATH)) {
                fs.mkdirSync(this.DATA_PATH, { recursive: true });
            }
            
            fs.writeFileSync(this.VOTE_PATH, JSON.stringify(existingVotes, null, 2));
    
            // Nettoyer uniquement le vote pour cette guild
            this.activeVotes.delete(guild.id);
            
            if (!this.isConfigComplete(config)) {
                throw new Error('Configuration incomplète');
            }
    
            // Récupérer les anciens salons
            const oldLinksChannel = await guild.channels.fetch(config.linksChannel);
            const oldVoteChannel = await guild.channels.fetch(config.voteChannel);
    
            if (!oldLinksChannel || !oldVoteChannel) {
                throw new Error('Canal des liens ou de vote invalide');
            }
    
            // Nettoyer le salon de vote en gardant les résultats récents
            if (oldVoteChannel) {
                try {
                    const messages = await oldVoteChannel.messages.fetch({ limit: 100 });
                    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
                    // Filtrer les messages à supprimer:
                    // - Tous les messages normaux
                    // - Les résultats de vote vieux de plus d'un jour
                    const messagesToDelete = messages.filter(msg => {
                        const isResultMessage = msg.embeds?.some(embed => embed.title === 'Résultats du vote');
                        return !isResultMessage || (isResultMessage && msg.createdAt < yesterday);
                    });
    
                    if (messagesToDelete.size > 0) {
                        await oldVoteChannel.bulkDelete(messagesToDelete, true)
                            .catch(error => console.log('Erreur lors de la suppression des anciens messages:', error));
                    }
    
                    console.log(`Nettoyage du salon de vote - ${messagesToDelete.size} messages supprimés`);
                } catch (error) {
                    console.error('Erreur lors du nettoyage du salon de vote:', error);
                }
            }
    
            // Sauvegarder les configurations des anciens salons
            const linksChannelConfig = {
                name: oldLinksChannel.name,
                parent: oldLinksChannel.parent,
                permissionOverwrites: oldLinksChannel.permissionOverwrites.cache,
                position: oldLinksChannel.position,
                topic: oldLinksChannel.topic,
                nsfw: oldLinksChannel.nsfw,
                rateLimitPerUser: oldLinksChannel.rateLimitPerUser
            };
    
            // Supprimer l'ancien salon des liens
            await oldLinksChannel.delete();
    
            // Créer le nouveau salon des liens avec les mêmes configurations
            const newLinksChannel = await guild.channels.create({
                name: linksChannelConfig.name,
                type: 0,
                parent: linksChannelConfig.parent,
                permissionOverwrites: Array.from(linksChannelConfig.permissionOverwrites.values()),
                position: linksChannelConfig.position,
                topic: linksChannelConfig.topic,
                nsfw: linksChannelConfig.nsfw,
                rateLimitPerUser: linksChannelConfig.rateLimitPerUser
            });
    
            // Mettre à jour la configuration avec le nouvel ID
            config.linksChannel = newLinksChannel.id;
            this.setConfig(guild.id, config);
    
            // Calculer le temps jusqu'à la fin de la phase des liens
            const endTime = await this.calculatePhaseEndTime('links', config);
            const timeUntilEnd = endTime.getTime() - new Date().getTime();
    
            // Formater les périodes
            const formatDaysList = (days) => {
                return days.map(day => {
                    const dayObj = this.weekDays.find(d => d.id === day);
                    return dayObj ? dayObj.label : day;
                }).join(', ');
            };
    
            const linksPhase = formatDaysList(config.linksDays);
            const votePhase = formatDaysList(config.voteDays);

            const embed = new EmbedBuilder()
                .setTitle('Phase des liens')
                .setDescription(`Temps restant: ${this.formatTime(timeUntilEnd)}`)
                .setColor('#0099ff')
                .setFields([
                    { 
                        name: '⏳ Période des liens', 
                        value: linksPhase,
                        inline: true 
                    },
                    { 
                        name: '🗳️ Période de vote', 
                        value: votePhase,
                        inline: true 
                    }
                ]);
            // Formater le template de message à partir de la configuration
            const formattedMessage = this.formatTemplate(config.messageTemplate || this.defaultConfig.messageTemplate, config);
    
            const message = await newLinksChannel.send({
                content: formattedMessage,
                embeds: [embed],
                components: [this.createEndButton('Terminer la phase des liens')]
            });
    
            await this.startLinkPhase(guild, config, message, timeUntilEnd, new Map());
    
            return message;
        } catch (error) {
            console.error('Erreur lors du démarrage du vote:', error);
            throw error;
        }
    }

    async deleteVote(guildId) {
        const voteData = this.activeVotes.get(guildId);
        if (voteData) {
            try {
                // 1. Nettoyer d'abord tous les collecteurs et intervalles
                await this.clearIntervals(guildId);
                
                // 2. Notifier dans le canal si possible
                const guild = await this.client.guilds.fetch(guildId);
                const channel = guild && await guild.channels.fetch(voteData.channelId);
                if (channel) {
                    await channel.send("⚠️ Vote terminé.");
                }
            } catch (error) {
                console.warn(`Impossible de nettoyer complètement le vote pour ${guildId}:`, error);
            } finally {
                // 3. Toujours supprimer le vote des données actives
                this.activeVotes.delete(guildId);
                // 4. Sauvegarder l'état
                this.saveData();
                console.log(`Vote supprimé pour guild ${guildId}`);
            }
        }
    }

    async init(client) {
        console.log('Initialisation du VoteManager...');
        this.client = client;
        
        try {
            // Charger les données existantes
            this.loadData();
            console.log(`Données chargées: ${this.activeVotes.size} votes actifs`);
    
            // Vérifier et restaurer les votes en cours
            for (const [guildId, voteData] of this.activeVotes.entries()) {
                try {
                    const guild = await client.guilds.fetch(guildId);
                    if (!guild) {
                        console.log(`Guild ${guildId} non trouvée, suppression du vote`);
                        this.activeVotes.delete(guildId);
                        continue;
                    }
    
                    const channel = await guild.channels.fetch(voteData.channelId);
                    if (!channel) {
                        console.log(`Canal ${voteData.channelId} non trouvé, suppression du vote`);
                        this.activeVotes.delete(guildId);
                        continue;
                    }
    
                    // Calculer le temps restant
                    const now = Date.now();
                    const endTime = new Date(voteData.endTime).getTime();
                    const remainingTime = endTime - now;
    
                    console.log(`Vote trouvé pour ${guild.name}:
                        Phase: ${voteData.phase}
                        Temps restant: ${this.formatTime(remainingTime)}
                        Canal: ${channel.name}`);
    
                    if (remainingTime <= 0) {
                        console.log(`Vote expiré pour guild ${guildId}, nettoyage...`);
                        
                        // Envoyer un message de fin si possible
                        try {
                            await channel.send("⚠️ Un vote a expiré pendant l'arrêt du bot.");
                        } catch (error) {
                            console.error("Impossible d'envoyer le message de fin:", error);
                        }
                        
                        this.activeVotes.delete(guildId);
                        continue;
                    }
    
                    // Mettre à jour les timestamps pour le temps d'arrêt
                    voteData.endTime = new Date(now + remainingTime);
                    if (typeof voteData.totalDuration !== 'number') {
                        voteData.totalDuration = remainingTime;
                    }
    
                    // Restaurer la phase appropriée
                    console.log(`Restauration de la phase ${voteData.phase}...`);
                    let message;
    
                    if (voteData.phase === 'links') {
                        message = await this.restoreLinkPhase(voteData, channel);
                    } else if (voteData.phase === 'vote') {
                        message = await this.restoreVotePhase(voteData, channel);
                    }
    
                    if (message) {
                        voteData.messageId = message.id;
                        this.setVoteData(guildId, voteData);
                        console.log(`Vote restauré avec succès pour ${guild.name}`);
                    }
                } catch (error) {
                    console.error(`Erreur lors de la restauration du vote pour ${guildId}:`, error);
                    this.activeVotes.delete(guildId);
                }
            }
    
            // Démarrer la sauvegarde automatique
            this.startAutoSave();
            this.handleShutdownEvents();
    
            console.log('VoteManager initialisé avec succès');
        } catch (error) {
            console.error('Erreur lors de l\'initialisation du VoteManager:', error);
            throw error;
        }
    }

    handleShutdownEvents() {
        process.on('SIGINT', () => this.handleShutdown());
        process.on('SIGTERM', () => this.handleShutdown());
        process.on('uncaughtException', (error) => {
            console.error('Erreur non gérée:', error);
            this.handleShutdown();
        });
    }

    startAutoSave() {
        // Sauvegarder toutes les minutes
        this.autoSaveInterval = setInterval(() => {
            this.saveData();
        }, 60000);
    }

    async handleShutdown() {
        console.log('Sauvegarde des votes avant arrêt...');
        clearInterval(this.autoSaveInterval);
        
        // Nettoyage des intervalles existants
        for (const interval of this.intervals.values()) {
            clearInterval(interval);
        }
        
        await this.saveData();
        process.exit(0);
    }

    async restoreVotes() {
        console.log('Restauration des votes actifs...');
        
        for (const [guildId, voteData] of this.activeVotes.entries()) {
            try {
                const guild = await this.client.guilds.fetch(guildId);
                if (!guild) {
                    console.log(`Guild ${guildId} non trouvée, suppression du vote`);
                    this.activeVotes.delete(guildId);
                    continue;
                }
    
                const channel = await guild.channels.fetch(voteData.channelId);
                if (!channel) {
                    console.log(`Canal ${voteData.channelId} non trouvé, suppression du vote`);
                    this.activeVotes.delete(guildId);
                    continue;
                }
    
                // Calculer le temps écoulé pendant l'arrêt du bot
                const now = Date.now();
                const endTime = new Date(voteData.endTime).getTime();
                const remainingTime = endTime - now;
    
                if (remainingTime <= 0) {
                    console.log(`Vote expiré pour guild ${guildId}, suppression`);
                    this.activeVotes.delete(guildId);
                    continue;
                }
    
                // Mettre à jour le temps de fin en tenant compte de la durée d'arrêt
                voteData.endTime = new Date(now + remainingTime);
                voteData.totalDuration = remainingTime;
    
                console.log(`Restauration du vote pour guild ${guildId}:
                    Phase: ${voteData.phase}
                    Temps restant: ${this.formatTime(remainingTime)}
                    Canal: ${channel.name}`);
    
                if (voteData.phase === 'links') {
                    const message = await this.restoreLinkPhase(voteData, channel);
                    if (message) {
                        voteData.messageId = message.id;
                        this.setVoteData(guildId, voteData);
                    }
                } else if (voteData.phase === 'vote') {
                    const message = await this.restoreVotePhase(voteData, channel);
                    if (message) {
                        voteData.messageId = message.id;
                        this.setVoteData(guildId, voteData);
                    }
                }
            } catch (error) {
                console.error(`Erreur lors de la restauration pour ${guildId}:`, error);
                this.activeVotes.delete(guildId);
            }
        }
        
        this.saveData();
        console.log('Restauration des votes terminée');
    }

    async startLinkPhase(guild, config, message, remainingTime, userLinks) {
        try {
            const startTime = Date.now();
            const endTime = startTime + remainingTime;
            
            // Convertir correctement les userLinks pour le stockage
            const userLinksObj = {};
            if (userLinks instanceof Map) {
                userLinks.forEach((links, userId) => {
                    userLinksObj[userId] = Array.isArray(links) ? links : [links];
                });
            } else if (typeof userLinks === 'object' && userLinks !== null) {
                Object.entries(userLinks).forEach(([userId, links]) => {
                    userLinksObj[userId] = Array.isArray(links) ? links : [links];
                });
            }
            
            // Créer les données initiales
            const voteData = {
                phase: 'links',
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                userLinks: userLinksObj, // Utiliser l'objet converti
                guildId: guild.id,
                messageId: message.id,
                channelId: message.channel.id,
                config: config,
                totalDuration: remainingTime
            };
    
            // Sauvegarder l'état
            this.setVoteData(guild.id, voteData);
    
            // S'assurer que userLinks est une Map pour les collectors
            const userLinksMap = new Map(Object.entries(userLinksObj));
    
            // Configurer le collecteur de liens et les intervalles avec la Map
            this.setupLinkCollectorsWithDuplicateCheck(message, voteData, userLinksMap, remainingTime);
    
            // Configurer l'intervalle de mise à jour avec la nouvelle Map
            const initialInterval = setInterval(() => {
                this.updateLinkPhase(message, voteData, userLinksMap);
            }, 5000);
    
            // Configurer le timer pour la fin automatique
            const endTimer = setTimeout(() => {
                this.handleLinkPhaseEnd(message, voteData);
            }, remainingTime);
    
            // Sauvegarder les intervalles
            this.intervals.set(guild.id, {
                updateInterval: initialInterval,
                endTimer
            });
    
        } catch (error) {
            console.error('Erreur lors du démarrage de la phase de liens:', error);
        }
    }
    
    saveVoteState(guildId, data) {
        try {
            // S'assurer que les données sont bien formatées
            const voteData = {
                ...data,
                userLinks: data.userLinks instanceof Map ? 
                    Object.fromEntries(data.userLinks) : 
                    data.userLinks,
                startTime: data.startTime instanceof Date ? 
                    data.startTime : 
                    new Date(data.startTime),
                endTime: data.endTime instanceof Date ? 
                    data.endTime : 
                    new Date(data.endTime)
            };
    
            this.activeVotes.set(guildId, voteData);
            this.saveData();
            console.log(`État du vote sauvegardé pour guild ${guildId}:`, voteData);
        } catch (error) {
            console.error('Erreur lors de la sauvegarde de l\'état du vote:', error);
        }
    }

    async restoreLinkPhase(voteData, channel) {
        try {
            const now = Date.now();
            const remainingTime = new Date(voteData.endTime).getTime() - now;
            
            // Conversion et préservation correcte des userLinks
            let userLinks;
            if (voteData.userLinks instanceof Map) {
                userLinks = voteData.userLinks;
            } else if (typeof voteData.userLinks === 'object' && voteData.userLinks !== null) {
                // Conversion des liens stockés sous forme d'objet en Map
                userLinks = new Map();
                Object.entries(voteData.userLinks).forEach(([userId, links]) => {
                    // Assurer que les liens sont toujours un tableau
                    const userLinkArray = Array.isArray(links) ? links : [links];
                    userLinks.set(userId, userLinkArray);
                });
            } else {
                userLinks = new Map();
            }
    
            const totalDuration = voteData.totalDuration || remainingTime;
            const elapsed = totalDuration - remainingTime;
    
            let message;
            try {
                message = await channel.messages.fetch(voteData.messageId);
            } catch (error) {
                console.log('Message original non trouvé, création d\'un nouveau message');
            }
    
            // Préparation des liens pour l'affichage
            const currentLinks = Array.from(userLinks.entries())
                .map(([userId, links]) => {
                    const linkCount = Array.isArray(links) ? links.length : 1;
                    return `<@${userId}>: ${linkCount} lien(s)`;
                })
                .filter(entry => entry) // Filtrer les entrées vides
                .join('\n');
    
            const embed = new EmbedBuilder()
                .setTitle('Phase des liens')
                .setColor('#0099ff')
                .setDescription(
                    voteData.config.showLoading 
                        ? `Temps restant: ${this.formatTime(remainingTime)}\n${this.createProgressBar(elapsed, totalDuration)}`
                        : `Temps restant: ${this.formatTime(remainingTime)}`
                );
    
            if (currentLinks) {
                embed.addFields({ 
                    name: 'Liens soumis', 
                    value: currentLinks 
                });
            }
    
            if (!message) {
                message = await channel.send({
                    content: `⌛ | Phase des liens restaurée\n🔄 | Vote restauré - Un redémarrage du bot a eu lieu`,
                    embeds: [embed],
                    components: [this.createEndButton('Terminer la phase des liens')]
                });
            } else {
                await message.edit({
                    embeds: [embed],
                    components: [this.createEndButton('Terminer la phase des liens')]
                });
            }
    
            // Mettre à jour les données du vote en préservant les liens
            const updatedVoteData = {
                ...voteData,
                messageId: message.id,
                endTime: new Date(now + remainingTime),
                userLinks: Object.fromEntries(userLinks) // Convertir la Map en objet pour le stockage
            };
    
            this.setVoteData(voteData.guildId, updatedVoteData);
            this.saveData(); // Sauvegarder immédiatement les données mises à jour
    
            // Configurer les collectors et l'intervalle avec les liens existants
            this.setupLinkCollectorsWithDuplicateCheck(message, updatedVoteData, userLinks, remainingTime);
    
            return message;
        } catch (error) {
            console.error('Erreur lors de la restauration de la phase des liens:', error);
            throw error;
        }
    }
    
    setupLinkCollectorsWithDuplicateCheck(message, voteData, userLinks, remainingTime) {
        if (!this.activeVotes.has(voteData.guildId)) {
            console.log('Vote déjà terminé, pas de configuration des collecteurs');
            return;
        }
        // Stocker les références aux collectors et intervals
        const updateInterval = setInterval(() => {
            // Vérifier si le vote existe toujours avant la mise à jour
            if (!this.activeVotes.has(voteData.guildId)) {
                clearInterval(updateInterval);
                return;
            }
            this.updateLinkPhase(message, voteData, userLinks);
        }, 5000);
    
        const endTimer = setTimeout(() => {
            this.handleLinkPhaseEnd(message, voteData);
        }, remainingTime);
    
        const linkCollector = message.channel.createMessageCollector({ 
            time: remainingTime 
        });
    
        const buttonCollector = message.createMessageComponentCollector({
            filter: i => i.customId === 'end_phase' && i.member.permissions.has('Administrator'),
            time: remainingTime
        });
    
        // Ajouter une vérification de l'état du vote dans le collector de liens
        linkCollector.on('collect', async collectedMessage => {
            if (!this.activeVotes.has(voteData.guildId)) {
                linkCollector.stop();
                return;
            }
            
            if (collectedMessage.author.bot) return;
            
            const links = collectedMessage.content.match(/https?:\/\/[^\s]+/g) || [];
            
            if (links.length > 0) {
                const userId = collectedMessage.author.id;
                const userLinkCount = userLinks.get(userId)?.length || 0;
                
                // Vérifier d'abord la limite de liens
                if (userLinkCount + links.length > voteData.config.maxLinks) {
                    await collectedMessage.delete();
                    try {
                        await collectedMessage.author.send(`Vous avez dépassé la limite de ${voteData.config.maxLinks} liens autorisés.`);
                    } catch (error) {
                        await collectedMessage.channel.send({
                            content: `<@${userId}>, vous avez dépassé la limite de ${voteData.config.maxLinks} liens autorisés.`,
                            ephemeral: true
                        }).then(msg => setTimeout(() => msg.delete(), 5000));
                    }
                    return;
                }
    
                // Vérifier les doublons
                const { valid, hasDuplicates } = await this.checkDuplicateLinks(collectedMessage, userLinks, links);
    
                // Si pas de doublons et des liens valides, les ajouter
                if (!hasDuplicates && valid.length > 0) {
                    if (!userLinks.has(userId)) {
                        userLinks.set(userId, []);
                    }
                    
                    userLinks.get(userId).push(...valid);
                    
                    // Mettre à jour les données du vote
                    const userLinksObj = {};
                    userLinks.forEach((links, userId) => {
                        userLinksObj[userId] = links;
                    });
                    
                    voteData.userLinks = userLinksObj;
                    this.setVoteData(voteData.guildId, voteData);
                
                // Mettre à jour l'embed pour montrer les liens
                const currentLinks = Array.from(userLinks.entries())
                    .map(([userId, links]) => `<@${userId}> : ${links.length} lien(s)`)
                    .join('\n');
    
                const embed = new EmbedBuilder()
                    .setTitle('Phase des liens')
                    .setColor('#0099ff')
                    .setDescription(
                        voteData.config.showLoading 
                            ? `Temps restant: ${this.formatTime(voteData.endTime.getTime() - Date.now())}\n${this.createProgressBar(Date.now() - voteData.startTime.getTime(), voteData.totalDuration)}`
                            : `Temps restant: ${this.formatTime(voteData.endTime.getTime() - Date.now())}`
                    );
        
                if (currentLinks) {
                    embed.addFields({ 
                        name: 'Liens soumis', 
                        value: currentLinks 
                    });
                }
    
                // Mettre à jour le message du bot
                await message.edit({ // Changé botMessage en message
                    embeds: [embed]
                });
                
                this.saveData();

                }
            }
        });
        
        buttonCollector.on('collect', async i => {
            if (i.member.permissions.has('Administrator')) {
                // Arrêter tous les collectors et intervals immédiatement
                clearInterval(updateInterval);
                clearTimeout(endTimer);
                linkCollector.stop();
                buttonCollector.stop();
                this.intervals.delete(voteData.guildId);
                
                await i.reply('Phase des liens terminée manuellement');
                await this.handleLinkPhaseEnd(message, voteData);
            } else {
                await i.reply({ 
                    content: 'Seuls les administrateurs peuvent terminer la phase', 
                    ephemeral: true 
                });
            }
        });
    
        // Sauvegarder toutes les références pour le nettoyage
        this.intervals.set(voteData.guildId, {
            updateInterval,
            endTimer,
            linkCollector,
            buttonCollector
        });
    }

    async restoreVotePhase(voteData, channel) {
        try {
            const now = Date.now();
            const remainingTime = new Date(voteData.endTime).getTime() - now;
            const totalDuration = voteData.totalDuration || remainingTime;
            const elapsed = totalDuration - remainingTime;
            
            let message;
            try {
                message = await channel.messages.fetch(voteData.messageId);
            } catch (error) {
                console.log('Message original non trouvé, création d\'un nouveau message');
            }
    
            const showLoading = voteData.config?.showLoading ?? false;
            
            const embed = new EmbedBuilder()
                .setTitle('Vote')
                .setColor('#00ff00');
    
            let description = `Temps restant: ${this.formatTime(remainingTime)}\n`;
            if (showLoading) {
                description += `${this.createProgressBar(elapsed, totalDuration)}\n`;
            }
            description += '\nVotez pour votre lien préféré';
            
            embed.setDescription(description);
    
            if (voteData.linksList?.length > 0) {
                embed.addFields({ name: 'Liens', value: voteData.linksList.join('\n') });
            }
    
            // Si le message existe, le mettre à jour
            if (message) {
                await message.edit({
                    embeds: [embed],
                    content: `Phase de vote - Temps restant: ${this.formatTime(remainingTime)}`,
                    components: [this.createEndButton('Terminer la phase de vote')]
                });
            } else {
                // Sinon, créer un nouveau message
                message = await channel.send({
                    embeds: [embed],
                    content: `Phase de vote - Temps restant: ${this.formatTime(remainingTime)}`,
                    components: [this.createEndButton('Terminer la phase de vote')]
                });
            }
    
            // Restaurer les réactions si nécessaire
            if (voteData.emojis && !message.reactions.cache.size) {
                for (const emoji of voteData.emojis) {
                    await message.react(emoji);
                }
            }
    
            // Mettre à jour les données
            const updatedVoteData = {
                ...voteData,
                messageId: message.id,
                startTime: new Date(now),
                endTime: new Date(now + remainingTime),
                totalDuration: totalDuration,
                phase: 'vote'
            };
    
            this.setVoteData(voteData.guildId, updatedVoteData);
    
            // Configurer les intervalles de mise à jour
            const updateInterval = setInterval(() => {
                this.updateVotePhase(message, updatedVoteData);
            }, 5000);
    
            const endTimer = setTimeout(() => {
                this.handleVotePhaseEnd(message, updatedVoteData);
            }, remainingTime);
    
            // Créer un nouveau collector pour le bouton
            const buttonCollector = message.createMessageComponentCollector({
                filter: i => i.customId === 'end_phase' && i.member.permissions.has('Administrator'),
                time: remainingTime
            });
    
            buttonCollector.on('collect', async i => {
                await i.reply('Phase de vote terminée manuellement');
                await this.handleVotePhaseEnd(message, updatedVoteData);
            });
    
            // Sauvegarder tous les collecteurs et intervalles
            this.intervals.set(voteData.guildId, {
                updateInterval,
                endTimer,
                buttonCollector
            });
    
            return message;
        } catch (error) {
            console.error('Erreur lors de la restauration de la phase de vote:', error);
            throw error;
        }
    }

    async setupVoteCollectors(message, voteData, remainingTime) {
        // Configurer l'intervalle de mise à jour
        const updateInterval = setInterval(() => {
            this.updateVotePhase(message, voteData);
        }, 5000);
    
        // Configurer le timer pour la fin automatique
        const endTimer = setTimeout(() => {
            this.handleVotePhaseEnd(message, voteData);
        }, remainingTime);
    
        // Sauvegarder les références pour le nettoyage
        this.intervals.set(voteData.guildId, {  // Changé de VoteManager.intervals à this.intervals
            updateInterval,
            endTimer
        });
    
        // Configurer le collector pour le bouton de fin
        const buttonCollector = message.createMessageComponentCollector({
            filter: i => i.customId === 'end_phase' && i.member.permissions.has('Administrator'),
            time: remainingTime
        });
    
        buttonCollector.on('collect', async i => {
            await i.reply('Phase de vote terminée manuellement');
            this.handleVotePhaseEnd(message, voteData);  // Ajout du this
        });
    }

    

    async updateLinkPhase(message, voteData, userLinks) {
        // Vérification IMMÉDIATE si le vote est toujours actif
        if (!this.activeVotes.has(voteData.guildId)) {
            console.log('Vote inactif, annulation de la mise à jour');
            return;
        }
    
        try {
            // Vérifier si le message existe toujours
            let channel;
            try {
                channel = await message.client.channels.fetch(message.channelId);
                if (!channel) {
                    console.log('Canal non trouvé, annulation de la mise à jour');
                    return;
                }
                
                // Double vérification que le vote est toujours actif
                const currentVote = this.activeVotes.get(voteData.guildId);
                if (!currentVote || currentVote.phase !== 'links') {
                    console.log('Vote terminé ou phase changée, annulation de la mise à jour');
                    return;
                }
                
                // Récupérer une nouvelle référence au message
                message = await channel.messages.fetch(message.id);
            } catch (error) {
                console.log('Impossible de récupérer le message, annulation de la mise à jour');
                return;
            }
    
            const now = Date.now();
            const endTime = new Date(voteData.endTime).getTime();
            const currentTimeLeft = Math.max(0, endTime - now);
    
            // Vérifier encore une fois si le vote est toujours actif
            if (!this.activeVotes.has(voteData.guildId)) {
                console.log('Vote devenu inactif pendant la mise à jour');
                return;
            }
            
            const elapsed = voteData.totalDuration - currentTimeLeft;
            const progress = Math.min(100, Math.floor((elapsed / voteData.totalDuration) * 100));
    
            // Formater les périodes
            const formatDaysList = (days, useLineBreaks = true) => {
                const maxDaysPerLine = 3; // Nombre maximum de jours par ligne
                
                const formattedDays = days.map(day => {
                    const dayObj = this.weekDays.find(d => d.id === day);
                    return dayObj ? dayObj.label : day;
                });
            
                if (!useLineBreaks) {
                    // Pour le message en haut, retourner simplement la liste avec des virgules
                    return formattedDays.join(', ');
                }
            
                // Pour l'embed, séparer en lignes
                const firstLine = formattedDays.slice(0, maxDaysPerLine);
                const secondLine = formattedDays.slice(maxDaysPerLine);
            
                return [
                    firstLine.join(', '),
                    secondLine.length > 0 ? secondLine.join(', ') : ''
                ].filter(line => line).join('\n');
            };
    
            const linksPhaseEmbed = formatDaysList(voteData.config.linksDays, true);
            const votePhaseEmbed = formatDaysList(voteData.config.voteDays, true);
            const linksPhasePlain = formatDaysList(voteData.config.linksDays, false);
            const votePhasePlain = formatDaysList(voteData.config.voteDays, false);
    
            // S'assurer que userLinks est une Map avec la bonne structure
            let linksMap;
            if (userLinks instanceof Map) {
                linksMap = userLinks;
            } else {
                // Conversion des liens comme avant...
                linksMap = new Map();
                if (voteData.userLinks) {
                    Object.entries(voteData.userLinks).forEach(([userId, links]) => {
                        if (Array.isArray(links)) {
                            linksMap.set(userId, links);
                        }
                    });
                }
            }
    
            // Mettre à jour l'embed
            const embed = new EmbedBuilder()
                .setTitle('Phase des liens')
                .setColor('#0099ff')
                .setFields([
                    {
                        name: '⏳ Période des liens',
                        value: linksPhaseEmbed,
                        inline: true
                    },
                    {
                        name: '🗳️ Période de vote',
                        value: votePhaseEmbed,
                        inline: true
                    }
                ])
                .setDescription(
                    voteData.config.showLoading 
                        ? `Temps restant: ${this.formatTime(currentTimeLeft, voteData.config)}\n${this.createProgressBar(elapsed, voteData.totalDuration)}`
                        : `Temps restant: ${this.formatTime(currentTimeLeft, voteData.config)}`
                );
    
            // Ajouter les liens actuels
            const currentLinks = Array.from(linksMap.entries())
                .map(([userId, links]) => {
                    const linkCount = Array.isArray(links) ? links.length : 0;
                    return `<@${userId}>: ${linkCount} lien(s)`;
                })
                .join('\n');
    
            if (currentLinks) {
                embed.addFields({ 
                    name: 'Liens soumis', 
                    value: currentLinks 
                });
            }
    
            // Formater le template de message à partir de la configuration de voteData
            const formattedMessage = this.formatTemplate(voteData.config.messageTemplate || this.defaultConfig.messageTemplate, voteData.config);
    
            // Mettre à jour le message
            await message.edit({ 
                content: formattedMessage,
                embeds: [embed] 
            });
    
            // Mettre à jour les données
            voteData.progress = {
                current: progress,
                lastUpdate: new Date().toISOString(),
                remaining: currentTimeLeft
            };
            
            voteData.userLinks = Object.fromEntries(linksMap);
            this.setVoteData(voteData.guildId, voteData);
    
            if (currentTimeLeft <= 0) {
                await this.handleLinkPhaseEnd(message, voteData);
            }

            if (this.activeVotes.has(voteData.guildId)) {
                this.setVoteData(voteData.guildId, voteData);
            }
    
        } catch (error) {
            console.error('Erreur lors de la mise à jour de la phase des liens:', error);
        }
    }
    
    
    async updateVotePhase(message, voteData) {
        try {
            if (!voteData || !voteData.totalDuration) {
                console.error('Données de vote invalides:', voteData);
                return;
            }
    
            const now = Date.now();
            const endTime = new Date(voteData.endTime).getTime();
            const currentTimeLeft = Math.max(0, endTime - now);
            const elapsed = voteData.totalDuration - currentTimeLeft;
    
            // Utiliser le showLoading de la config
            const showLoading = voteData.config?.showLoading ?? false;
    
            // Construction de la description avec la barre de progression
            let description = `Temps restant: ${this.formatTime(currentTimeLeft, voteData.config)}\n`; // Passer la config ici
            if (showLoading) {
                description += `${this.createProgressBar(elapsed, voteData.totalDuration)}\n`;
            }
            description += '\nVotez pour votre lien préféré';
    
            const embed = new EmbedBuilder()
                .setTitle('Vote')
                .setColor('#00ff00')
                .setDescription(description);
    
            if (voteData.linksList?.length > 0) {
                embed.addFields({ 
                    name: 'Liens', 
                    value: voteData.linksList.join('\n') 
                });
            }
    
            await message.edit({
                embeds: [embed],
                components: [this.createEndButton('Terminer la phase de vote')]
            });
    
            if (currentTimeLeft <= 0) {
                await this.handleVotePhaseEnd(message, voteData);
            }
        } catch (error) {
            console.error('Erreur lors de la mise à jour de la phase de vote:', error);
        }
    }
    
    async updateProgress(guildId, elapsed, total) {
        try {
            const voteData = this.activeVotes.get(guildId);
            if (!voteData) return;
    
            const progress = Math.min(100, Math.floor((elapsed / total) * 100));
            const now = new Date();
    
            voteData.progress = {
                current: progress,
                lastUpdate: now.toISOString(),
                history: [
                    ...(voteData.progress?.history || []),
                    { progress, timestamp: now.toISOString() }
                ]
            };
    
            this.activeVotes.set(guildId, voteData);
            this.saveData();
    
            return progress;
        } catch (error) {
            console.error('Erreur lors de la mise à jour de la progression:', error);
        }
    }
    
    async clearIntervals(guildId) {
        console.log(`Nettoyage complet pour guild ${guildId}`);
        
        const intervals = this.intervals.get(guildId);
        if (intervals) {
            // 1. Nettoyer les intervalles de mise à jour
            if (intervals.updateInterval) {
                console.log('Nettoyage updateInterval');
                clearInterval(intervals.updateInterval);
            }
            
            // 2. Nettoyer les timers de fin
            if (intervals.endTimer) {
                console.log('Nettoyage endTimer');
                clearTimeout(intervals.endTimer);
            }
            
            // 3. Arrêter explicitement les collecteurs
            if (intervals.linkCollector) {
                console.log('Nettoyage linkCollector');
                intervals.linkCollector.stop();
            }
            if (intervals.buttonCollector) {
                console.log('Nettoyage buttonCollector');
                intervals.buttonCollector.stop();
            }
            if (intervals.messageCollector) {
                console.log('Nettoyage messageCollector');
                intervals.messageCollector.stop();
            }
            
            // 4. Supprimer toutes les références
            this.intervals.delete(guildId);
        }
    }

    async handleLinkPhaseEnd(message, voteData, guild) {
        try {
            console.log('Début de la fin de la phase de liens');
            const guildId = voteData.guildId;
    
            // 1. Arrêter TOUS les collecteurs et intervalles IMMÉDIATEMENT
            await this.clearIntervals(guildId);
    
            // 2. Suppression IMMÉDIATE du vote des données actives
            this.activeVotes.delete(guildId);
            await this.saveData();
    
            // 3. Vérifier une dernière fois qu'il n'y a plus de vote actif
            if (this.activeVotes.has(guildId)) {
                console.log('Forcer la suppression du vote');
                this.activeVotes.delete(guildId);
                await this.saveData();
            }
    
            // 4. Créer l'embed final
            const finalEmbed = new EmbedBuilder()
                .setTitle('Phase des liens (Terminée)')
                .setDescription('La phase de liens est terminée')
                .setColor('#ff0000');
    
            // 5. Envoyer un nouveau message plutôt que modifier l'ancien
            await message.delete().catch(() => console.log('Message déjà supprimé'));
            const finalMessage = await message.channel.send({
                content: 'La phase des liens est terminée !',
                embeds: [finalEmbed]
            });
    
            // 6. Verrouiller le salon
            if (!guild) {
                guild = message.guild;
            }
    
            const linksChannel = await guild.channels.fetch(voteData.channelId);
            if (linksChannel) {
                await linksChannel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: false,
                    ViewChannel: true
                });
                
                await linksChannel.send({
                    content: '🔒 Le salon est maintenant verrouillé jusqu\'à la prochaine phase de liens.'
                });
            }
    
            // 7. S'assurer une dernière fois qu'il n'y a plus de vote actif
            this.activeVotes.delete(guildId);
            this.intervals.delete(guildId);
            await this.saveData();
    
            // 8. Attendre avant de démarrer la phase de vote
            await new Promise(resolve => setTimeout(resolve, 5000));
    
            // 9. Démarrer la phase de vote avec des données entièrement nouvelles
            try {
                const voteChannel = await guild.channels.fetch(voteData.config.voteChannel);
                if (!voteChannel) throw new Error('Canal de vote non trouvé');
                
                const now = new Date();
                const endOfDay = new Date(now);
                endOfDay.setHours(23, 59, 0, 0);
                const voteDuration = endOfDay.getTime() - now.getTime();
                
                // Copier les liens de manière sécurisée
                const userLinksData = Object.freeze({...voteData.userLinks});
        
                // Liste d'émojis limitée à 20 (limite Discord)
                const emojis = [
                    '🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯',
                    '🇰', '🇱', '🇲', '🇳', '🇴', '🇵', '🇶', '🇷', '🇸', '🇹'
                ];
            
                const linksList = [];
                let totalLinks = 0;
            
                // Compter le nombre total de liens
                if (userLinksData && typeof userLinksData === 'object') {
                    for (const [, links] of Object.entries(userLinksData)) {
                        if (Array.isArray(links)) {
                            totalLinks += links.length;
                        }
                    }
                }
            
                // Ajouter les liens avec leurs émojis
                let emojiIndex = 0;
                if (userLinksData && typeof userLinksData === 'object') {
                    for (const [, links] of Object.entries(userLinksData)) {
                        if (Array.isArray(links)) {
                            for (const link of links) {
                                if (emojiIndex < emojis.length) {
                                    linksList.push(`${emojis[emojiIndex]} ${link}`);
                                    emojiIndex++;
                                }
                            }
                        }
                    }
                }
        
                // Informer les utilisateurs si certains liens sont omis
                if (totalLinks > emojis.length) {
                    await voteChannel.send({
                        content: `⚠️ Attention : Il y a plus de liens (${totalLinks}) que le maximum autorisé (${emojis.length}). Seuls les ${emojis.length} premiers liens seront inclus dans le vote.`
                    });
                }
            
                // Créer des groupes de 10 liens maximum pour l'affichage
                const maxLinksPerField = 10;
                const chunks = [];
                for (let i = 0; i < linksList.length; i += maxLinksPerField) {
                    chunks.push(linksList.slice(i, i + maxLinksPerField));
                }
            
                const voteEmbed = new EmbedBuilder()
                    .setTitle('Vote')
                    .setColor('#00ff00')
                    .setDescription(`Temps restant: ${this.formatTime(voteDuration)}\n\nVotez pour votre lien préféré`);
        
                chunks.forEach((chunk, index) => {
                    voteEmbed.addFields({ 
                        name: `Liens (Groupe ${index + 1})`, 
                        value: chunk.join('\n')
                    });
                });
            
                const voteMessage = await voteChannel.send({
                    embeds: [voteEmbed],
                    components: [this.createEndButton('Terminer la phase de vote')]
                });
        
                // Ajouter les réactions de manière sécurisée
                try {
                    for (let i = 0; i < linksList.length && i < emojis.length; i++) {
                        await voteMessage.react(emojis[i]);
                    }
                } catch (error) {
                    if (error.code === 30010) {
                        console.log('Limite de réactions atteinte, continuation...');
                    } else {
                        throw error;
                    }
                }
            
                const votePhaseData = Object.freeze({
                    phase: 'vote',
                    startTime: now,
                    endTime: new Date(now.getTime() + voteDuration),
                    guildId: guild.id,
                    channelId: voteChannel.id,
                    messageId: voteMessage.id,
                    config: {...voteData.config},
                    totalDuration: voteDuration,
                    linksList: [...linksList],
                    emojis: emojis.slice(0, linksList.length),
                });
                
                await this.setVoteData(guild.id, votePhaseData);
                this.setupVoteCollectors(voteMessage, votePhaseData, voteDuration);
    
            } catch (error) {
                console.error('Erreur lors du démarrage de la phase de vote:', error);
                // En cas d'erreur, laisser le message de fin tel quel
            }
    
        } catch (error) {
            console.error('Erreur lors de la fin de la phase des liens:', error);
            // Nettoyage final de sécurité
            this.activeVotes.delete(voteData.guildId);
            this.intervals.delete(voteData.guildId);
            await this.saveData();
        }
    }
    
    async displayResults(message, voteData) {
        try {
            console.log('Affichage des résultats du vote');
            const reactions = [...message.reactions.cache.values()];
            const results = reactions
                .map((reaction, index) => ({
                    link: voteData.linksList[index],
                    votes: reaction.count - 1  // Soustraire le vote du bot
                }))
                .sort((a, b) => b.votes - a.votes);
    
            const resultsEmbed = new EmbedBuilder()
                .setTitle('Résultats du vote')
                .setColor('#00ff00');
    
            if (results.length > 0) {
                resultsEmbed.setDescription(
                    results.map((result, index) => 
                        `${index + 1}. ${result.link} - ${result.votes} votes`
                    ).join('\n')
                );
            } else {
                resultsEmbed.setDescription('Aucun vote n\'a été enregistré.');
            }
    
            // Mise à jour du message de vote original
            const finalVoteEmbed = new EmbedBuilder()
                .setTitle('Vote (Terminé)')
                .setDescription('Le vote est terminé')
                .setColor('#ff0000');

            if (voteData.linksList?.length > 0) {
                const maxLinksPerField = 10;
                const chunks = [];
                
                for (let i = 0; i < voteData.linksList.length; i += maxLinksPerField) {
                    chunks.push(voteData.linksList.slice(i, i + maxLinksPerField));
                }
                
                chunks.forEach((chunk, index) => {
                    finalVoteEmbed.addFields({ 
                        name: `Liens (Groupe ${index + 1})`, 
                        value: chunk.join('\n')
                    });
                });
            }
    
            await message.edit({
                embeds: [finalVoteEmbed],
                components: []
            });
    
            // Envoyer les résultats
            await message.channel.send({ embeds: [resultsEmbed] });
        } catch (error) {
            console.error('Erreur lors de l\'affichage des résultats:', error);
        }
    }
    
    async handleVotePhaseEnd(message, voteData) {
        try {
            // Vérifier si le vote est déjà terminé pour éviter les duplications
            if (!this.activeVotes.has(voteData.guildId)) {
                console.log('Vote déjà terminé, annulation du handleVotePhaseEnd');
                return;
            }
    
            // Marquer le vote comme en cours de terminaison en le supprimant immédiatement
            this.activeVotes.delete(voteData.guildId);
    
            // Nettoyer tous les intervalles et timers
            this.clearIntervals(voteData.guildId);
    
            // S'assurer que le message existe toujours avant de continuer
            try {
                await message.fetch();
            } catch (error) {
                console.log('Message de vote non trouvé, abandon de la fin de phase');
                return;
            }
    
            // Attendre un court instant pour s'assurer que toutes les réactions sont chargées
            await new Promise(resolve => setTimeout(resolve, 1000));
    
            // Récupérer les réactions une seule fois
            const reactions = [...message.reactions.cache.values()];
            
            // Préparer les résultats
            const results = reactions
                .map((reaction, index) => ({
                    link: voteData.linksList[index],
                    votes: reaction.count - 1  // Soustraire le vote du bot
                }))
                .filter(result => result.link) // Filtrer les liens undefined
                .sort((a, b) => b.votes - a.votes);
    
            // Créer l'embed des résultats
            const resultsEmbed = new EmbedBuilder()
                .setTitle('Résultats du vote')
                .setColor('#00ff00');
    
            if (results.length > 0) {
                resultsEmbed.setDescription(
                    results.map((result, index) => 
                        `${index + 1}. ${result.link} - ${result.votes} votes`
                    ).join('\n')
                );
            } else {
                resultsEmbed.setDescription('Aucun vote n\'a été enregistré.');
            }
    
            // Mettre à jour le message de vote original une seule fois
            const finalVoteEmbed = new EmbedBuilder()
                .setTitle('Vote (Terminé)')
                .setDescription('Le vote est terminé')
                .setColor('#ff0000');
    
            if (voteData.linksList?.length > 0) {
                finalVoteEmbed.addFields({ 
                    name: 'Liens', 
                    value: voteData.linksList.join('\n') 
                });
            }
    
            // Effectuer les mises à jour finales dans un try-catch séparé
            try {
                await message.edit({
                    embeds: [finalVoteEmbed],
                    components: []
                });
    
                // Envoyer les résultats une seule fois
                await message.channel.send({ embeds: [resultsEmbed] });
            } catch (error) {
                console.error('Erreur lors de la mise à jour finale des messages:', error);
            }
    
            // Sauvegarder l'état final
            this.saveData();
    
        } catch (error) {
            console.error('Erreur lors de la fin de la phase de vote:', error);
            // En cas d'erreur, s'assurer que le vote est bien supprimé
            this.activeVotes.delete(voteData.guildId);
            this.saveData();
        }
    }

    async startVotePhase(userLinks, voteChannel, config, timeLeft = null, existingMessage = null) {
        try {
            const now = Date.now();
            let remainingTime = timeLeft;
            
            if (remainingTime === null) {
                const endTime = await this.calculatePhaseEndTime('vote', config);
                remainingTime = endTime.getTime() - now;
            }
    
            const endTime = now + remainingTime;
            const totalDuration = remainingTime;
    
            // Conversion des liens...
            const emojis = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'];
            let linksList = [];
            let i = 0;
    
            // ... (reste du code de conversion des liens)
    
            const voteEmbed = new EmbedBuilder()
                .setTitle('Vote')
                .setColor('#00ff00')
                .setDescription(/* ... */);
    
            const message = existingMessage || await voteChannel.send({/* ... */});
    
            // Forcer la phase à 'vote' ici
            const voteData = {
                phase: 'vote', // Toujours forcer à 'vote'
                startTime: new Date(now),
                endTime: new Date(endTime),
                userLinks: userLinks instanceof Map ? Object.fromEntries(userLinks) : userLinks,
                guildId: voteChannel.guild.id,
                messageId: message.id,
                channelId: voteChannel.id,
                config: {
                    ...config,
                    showLoading: config.showLoading ?? false
                },
                totalDuration: totalDuration,
                linksList: linksList,
                emojis: emojis.slice(0, i),
                progress: {
                    current: 0,
                    lastUpdate: new Date().toISOString(),
                    remaining: remainingTime
                }
            };
    
            // Sauvegarder immédiatement avec la phase 'vote'
            this.activeVotes.delete(voteChannel.guild.id); // Supprimer l'ancien vote d'abord
            await this.setVoteData(voteChannel.guild.id, voteData);
    
            if (!existingMessage) {
                for (let j = 0; j < i; j++) {
                    await message.react(emojis[j]);
                }
            }
    
            this.setupVoteCollectors(message, voteData, remainingTime);
            return message;
        } catch (error) {
            console.error('Erreur lors du démarrage de la phase de vote:', error);
            throw error;
        }
    }

    // Méthodes utilitaires
    formatTime(milliseconds, config = null) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        // Si nous avons une configuration et que nous sommes dans la phase de liens
        if (config && config.linksDays) {
            const now = new Date();
            const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
            const currentDayIndex = config.linksDays.indexOf(currentDay);
            const remainingDays = config.linksDays.length - (currentDayIndex + 1);
            
            const parts = [];
            if (days > 0) {
                parts.push(`${days}j`);
            }
            parts.push(`${hours % 24}h`);
            parts.push(`${minutes % 60}mn`);
            if (seconds % 60 > 0) {
                parts.push(`${seconds % 60}s`);
            }
            
            return parts.join(' ');
        }
        
        // Pour les autres phases, toujours afficher jours/heures/minutes
        const parts = [];
        if (days > 0) {
            parts.push(`${days}j`);
        }
        parts.push(`${hours % 24}h`);
        parts.push(`${minutes % 60}mn`);
        if (seconds % 60 > 0) {
            parts.push(`${seconds % 60}s`);
        }
        
        return parts.join(' ') || '0s';
    }

    createProgressBar(elapsed, total) {
        const progress = Math.min(100, Math.floor((elapsed / total) * 100));
        const filled = Math.floor(progress / 5);
        return `[${'█'.repeat(filled)}${'-'.repeat(20-filled)}] ${progress}%`;
    }

    createEndButton(label) {
        return {
            type: 1,
            components: [{
                type: 2,
                style: 4,
                label: label,
                custom_id: 'end_phase'
            }]
        };
    }

    // Getters et setters pour les votes et configurations
    getVoteData(guildId) {
        return this.activeVotes.get(guildId);
    }

    getConfig(guildId) {
        return this.voteConfigs.get(guildId);
    }

    setVoteData(guildId, data) {
        try {
            // Vérification stricte de la phase
            if (!['vote', 'links'].includes(data.phase)) {
                throw new Error(`Phase invalide: ${data.phase}`);
            }
    
            // Vérifier si un vote existe déjà
            const existingVote = this.activeVotes.get(guildId);
            
            // Si nous avons déjà une phase de vote, ne pas permettre le retour à la phase de liens
            if (existingVote?.phase === 'vote' && data.phase === 'links') {
                console.log('Tentative de retour à la phase liens ignorée - Vote en cours');
                return;
            }
    
            // Créer une copie profonde et immuable des données
            const formattedData = Object.freeze({
                phase: data.phase,
                startTime: new Date(data.startTime),
                endTime: new Date(data.endTime),
                guildId: data.guildId,
                channelId: data.channelId,
                messageId: data.messageId,
                config: Object.freeze({
                    ...(data.config || {}),
                    showLoading: Boolean(data.config?.showLoading)
                }),
                totalDuration: Number(data.totalDuration),
                ...(data.phase === 'vote' ? {
                    linksList: [...(data.linksList || [])],
                    emojis: [...(data.emojis || [])]
                } : {
                    userLinks: {...(data.userLinks || {})}
                })
            });
    
            // Mettre à jour les données
            this.activeVotes.set(guildId, formattedData);
            this.saveData();
            
            console.log(`Vote data set for guild ${guildId} with phase ${formattedData.phase}`);
        } catch (error) {
            console.error('Error setting vote data:', error);
        }
    }

    setConfig(guildId, config) {
        this.voteConfigs.set(guildId, config);
        this.saveData();
    }
}

module.exports = new VoteManager();