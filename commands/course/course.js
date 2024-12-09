const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const Course = require('../../data/schemas/courseSchema');
const FormManager = require('../../utils/database/formManager');
const xlsx = require('xlsx');
const axios = require('axios');
const cheerio = require('cheerio');

module.exports = {
    name: 'course',
    description: 'Gestion des courses MxBikes',

    async execute(message, args, client) {
        const mainEmbed = new EmbedBuilder()
            .setTitle('MxBikes - Système de Course')
            .setDescription('Choisissez le type d\'événement')
            .setColor('#0099ff');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('type_course')
                .setLabel('Course')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('type_competition')
                .setLabel('Compétition')
                .setStyle(ButtonStyle.Success)
        );

        let existingCourse = await Course.findOne({
            createdBy: message.author.id,
            isEnded: false
        });
    
        if (existingCourse) {
            await loadExistingCourse(existingCourse, message);
            return;
        }

        const mainMsg = await message.channel.send({
            embeds: [mainEmbed],
            components: [row]
        });

        const collector = mainMsg.createMessageComponentCollector({
            time: 300000
        });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: 'Vous ne pouvez pas utiliser ces boutons.', ephemeral: true });
            }

            if (i.customId === 'type_course') {
                await handleCourseSetup(i, mainMsg);
            } else if (i.customId === 'type_competition') {
                await i.reply({ content: 'Fonctionnalité à venir!', ephemeral: true });
            }
        });

        async function loadExistingCourse(courseDoc, message) {
            try {
                if (!courseDoc.confirmationChannel || !courseDoc.configChannel) {
                    console.log("Course incomplète trouvée, suppression...");
                    await Course.deleteOne({ _id: courseDoc._id });
                    return;
                }
        
                // Récupérer les salons
                const configChannel = await message.guild.channels.fetch(courseDoc.configChannel);
                const confirmChannel = await message.guild.channels.fetch(courseDoc.confirmationChannel);
        
                // Préparer l'embed de confirmation
                const confirmEmbed = new EmbedBuilder()
                    .setTitle('Confirmation de Présence')
                    .setColor('#0099ff');
        
                if (courseDoc.formData && courseDoc.formData.responses) {
                    confirmEmbed.setDescription(courseDoc.formData.responses.map((resp, index) => {
                        const confirmedUser = courseDoc.confirmedUsers.find(u => u.userId === resp.userId);
                        return `${index + 1}. ${confirmedUser ? '✅' : '❌'} | @${resp.userTag} : ${resp.responses.join(' | ')}`;
                    }).join('\n'));
                }
        
                // Bouton de confirmation
                const confirmButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_presence')
                        .setLabel('Présent')
                        .setStyle(ButtonStyle.Success)
                );
        
                // Envoyer le message de confirmation
                const confirmMsg = await confirmChannel.send({
                    embeds: [confirmEmbed],
                    components: [confirmButton]
                });
        
                // Configurer l'embed de gestion
                const configEmbed = new EmbedBuilder()
                    .setTitle('Gestion de la Course')
                    .setColor('#0099ff')
                    .addFields(
                        { name: 'Nom de la course', value: courseData.courseName || 'Non défini' },
                        { name: 'État', value: courseData.isConfirmationPhase ? 'En cours' : 'Configuration' },
                        { name: 'URL SheetDB', value: courseData.sheetdbUrl || 'Non configurée' },
                        { name: 'Nombre de manches', value: courseData.racesCount ? `${courseData.racesCount} manche(s)` : 'Non défini' },
                        { name: 'Rôle confirmation', value: courseData.confirmRole ? `<@&${courseData.confirmRole}>` : 'Non défini' },
                        { name: 'Salons', value: 
                            `Configuration: ${courseData.configChannel ? `<#${courseData.configChannel}>` : 'Non défini'}\n` +
                            `Annonce: ${courseData.announcementChannel ? `<#${courseData.announcementChannel}>` : 'Non défini'}\n` +
                            `Confirmation: ${courseData.confirmationChannel ? `<#${courseData.confirmationChannel}>` : 'Non défini'}`
                        }
                    );
        
                // Boutons de gestion
                const configButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('set_confirm_role')
                        .setLabel('Définir rôle confirmation')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('end_confirm')
                        .setLabel('Terminer confirmation')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('delete_course')
                        .setLabel('Tout supprimer')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('set_races_count')
                        .setLabel('Nombre de manches')
                        .setStyle(ButtonStyle.Primary)
                );
        
                const raceButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('race1_setup')
                        .setLabel('Manche 1')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(!courseDoc.racesCount),
                    new ButtonBuilder()
                        .setCustomId('race2_setup')
                        .setLabel('Manche 2')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(!courseDoc.racesCount || courseDoc.racesCount !== 2)
                );
        
                const configMsg = await configChannel.send({
                    embeds: [configEmbed],
                    components: [configButtons, raceButtons]
                });
        
                // Collector pour le bouton de confirmation
                const confirmCollector = confirmMsg.createMessageComponentCollector();
                confirmCollector.on('collect', async i => {
                    if (courseDoc.confirmedUsers.some(u => u.userId === i.user.id)) {
                        return i.reply({ content: 'Vous avez déjà confirmé votre présence.', ephemeral: true });
                    }
        
                    courseDoc.confirmedUsers.push({
                        userId: i.user.id,
                        userTag: i.user.tag,
                        timestamp: new Date()
                    });
        
                    await Course.findOneAndUpdate(
                        { _id: courseDoc._id },
                        { confirmedUsers: courseDoc.confirmedUsers }
                    );
        
                    if (courseDoc.formData && courseDoc.formData.responses) {
                        const updatedDesc = courseDoc.formData.responses.map((resp, index) => {
                            const confirmedUser = courseDoc.confirmedUsers.find(u => u.userId === resp.userId);
                            return `${index + 1}. ${confirmedUser ? '✅' : '❌'} | @${resp.userTag} : ${resp.responses.join(' | ')}`;
                        }).join('\n');
                        confirmEmbed.setDescription(updatedDesc);
                        await confirmMsg.edit({ embeds: [confirmEmbed] });
                    }
        
                    await i.reply({ content: 'Présence confirmée!', ephemeral: true });
                });
        
                // Collector pour les boutons de configuration
                const configCollector = configMsg.createMessageComponentCollector();
                configCollector.on('collect', async i => {
                    if (i.user.id !== message.author.id) {
                        return i.reply({ content: 'Vous ne pouvez pas utiliser ces boutons.', ephemeral: true });
                    }
        
                    switch (i.customId) {
                        case 'set_confirm_role':
                            await handleConfirmRole(i, courseDoc, configEmbed);
                            break;
                        case 'end_confirm':
                            await handleEndConfirm(i, courseDoc, configEmbed, confirmMsg, configMsg);
                            break;
                        case 'delete_course':
                            await handleDeleteCourse(i, courseDoc, confirmMsg, configMsg);
                            break;
                        case 'set_races_count':
                            await handleRacesCount(i, courseDoc, configEmbed, raceButtons);
                            break;
                        case 'race1_setup':
                        case 'race2_setup':
                            await handleRaceSetup(i, courseDoc, i.customId === 'race1_setup' ? 1 : 2);
                            break;
                    }
                });
            } catch (error) {
                console.error('Erreur lors du chargement de la course:', error);
                await message.reply("Une erreur s'est produite. Veuillez créer une nouvelle course.");
            }
        }

        async function handleCourseSetup(i, msg) {
            const configEmbed = new EmbedBuilder()
                .setTitle('Configuration de la Course')
                .setDescription('Configuration des salons')
                .setColor('#0099ff')
                .addFields(
                    { name: 'Nom de la course', value: 'Non configuré', inline: true },
                    { name: 'Salon de Configuration', value: 'Non configuré', inline: true },
                    { name: 'Salon d\'Annonce', value: 'Non configuré', inline: true },
                    { name: 'Salon de Confirmation', value: 'Non configuré', inline: true }
                );

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('set_course_name')
                    .setLabel('Nom de la course')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('set_config_channel')
                    .setLabel('Salon Configuration')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('set_announce_channel')
                    .setLabel('Salon Annonce')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('set_confirm_channel')
                    .setLabel('Salon Confirmation')
                    .setStyle(ButtonStyle.Primary)
            );

            const controlButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('start_confirmation')
                    .setLabel('Lancer Confirmation')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('end_confirmation')
                    .setLabel('Terminer Confirmation')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );

            await i.update({
                embeds: [configEmbed],
                components: [buttons, controlButtons]
            });

            const courseData = {
                type: 'course',
                configChannel: '',
                announcementChannel: '',
                confirmationChannel: '',
                confirmedUsers: []
            };

            const setupCollector = msg.createMessageComponentCollector({
                time: 600000
            });

            setupCollector.on('collect', async interaction => {
                if (interaction.user.id !== message.author.id) {
                    return interaction.reply({ content: 'Vous ne pouvez pas utiliser ces boutons.', ephemeral: true });
                }

                switch (interaction.customId) {
                    case 'set_course_name':
                        await handleCourseName(interaction, courseData, configEmbed);
                        break;
                    case 'set_config_channel':
                    case 'set_announce_channel':
                    case 'set_confirm_channel':
                        await handleChannelSelection(interaction, courseData, configEmbed);
                        break;
                    case 'start_confirmation':
                        await startConfirmationPhase(interaction, courseData);
                        break;
                    case 'end_confirmation':
                        await endConfirmationPhase(interaction, courseData);
                        break;
                }

                // Activer/désactiver les boutons selon la configuration
                controlButtons.components[0].setDisabled(!areChannelsConfigured(courseData));
                controlButtons.components[1].setDisabled(!courseData.isConfirmationPhase);

                await msg.edit({
                    embeds: [configEmbed],
                    components: [buttons, controlButtons]
                });
            });
        }

        async function handleCourseName(interaction, courseData, embed) {
            await interaction.reply({ content: 'Entrez le nom de la course:', ephemeral: true });
            const filter = m => m.author.id === interaction.user.id;
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 });
            
            if (collected.size > 0) {
                const name = collected.first().content;
                courseData.courseName = name;
                embed.data.fields[0].value = name;
                
                // Sauvegarder dans MongoDB
                let course = await Course.findOneAndUpdate(
                    { createdBy: interaction.user.id, isEnded: false },
                    { courseName: name },
                    { upsert: true, new: true }
                );
                
                await collected.first().delete();
                await interaction.editReply({ content: 'Nom de la course configuré!', components: [] });
            }
        }

        async function handleChannelSelection(interaction, courseData, embed) {
            await interaction.reply({ content: 'Mentionnez le salon:', ephemeral: true });
        
            const filter = m => m.author.id === interaction.user.id && m.mentions.channels.size > 0;
            const collected = await interaction.channel.awaitMessages({
                filter,
                max: 1,
                time: 30000
            });
        
            if (collected.size > 0) {
                const channel = collected.first().mentions.channels.first();
                const fieldIndex = interaction.customId === 'set_config_channel' ? 1 :
                                  interaction.customId === 'set_announce_channel' ? 2 : 3;
        
                switch (interaction.customId) {
                    case 'set_config_channel':
                        courseData.configChannel = channel.id;
                        break;
                    case 'set_announce_channel':
                        courseData.announcementChannel = channel.id;
                        break;
                    case 'set_confirm_channel':
                        courseData.confirmationChannel = channel.id;
                        // Demander l'ID du formulaire après avoir configuré le salon
                        await interaction.followUp({ 
                            content: 'Entrez l\'ID du formulaire à récupérer (ou "aucun" pour ignorer):',
                            ephemeral: true 
                        });
        
                        const formFilter = m => m.author.id === interaction.user.id;
                        const formCollected = await interaction.channel.awaitMessages({
                            filter: formFilter,
                            max: 1,
                            time: 30000
                        });

                        if (formCollected.size > 0) {
                            const formId = formCollected.first().content;
                            if (formId.toLowerCase() !== 'aucun') {
                                try {
                                    const form = await FormManager.getFormById(formId);
                                    if (form) {
                                        console.log("Formulaire trouvé:", form);
                                        courseData.formId = formId;
                                        courseData.formData = form;
                                        await interaction.followUp({ 
                                            content: 'Formulaire récupéré avec succès!',
                                            ephemeral: true 
                                        });
                                    } else {
                                        console.log("Aucun formulaire trouvé pour l'ID:", formId);
                                        await interaction.followUp({ 
                                            content: 'Formulaire non trouvé, configuration sans formulaire.',
                                            ephemeral: true 
                                        });
                                    }
                                } catch (error) {
                                    console.error('Erreur lors de la récupération du formulaire:', error);
                                }
                            }
                            await formCollected.first().delete().catch(() => {});
                        }
                        break;
                }

                await Course.findOneAndUpdate(
                    { createdBy: interaction.user.id, isEnded: false },
                    { 
                        [`${interaction.customId.replace('set_', '')}`]: channel.id 
                    },
                    { upsert: true }
                );
        
                embed.data.fields[fieldIndex].value = `<#${channel.id}>`;
                await collected.first().delete().catch(() => {});
                await interaction.editReply({ content: 'Salon configuré!', components: [] });
            }
        }

        async function startConfirmationPhase(interaction, courseData) {
            const confirmChannel = await interaction.guild.channels.fetch(courseData.confirmationChannel);
        
            // Construction de l'embed en fonction de la présence d'un formulaire
            const confirmEmbed = new EmbedBuilder()
                .setTitle('Confirmation de Présence')
                .setColor('#0099ff');
        
            if (courseData.formData) {
                // Utiliser les réponses du formulaire au lieu des options
                if (courseData.formData.responses && courseData.formData.responses.length > 0) {
                    confirmEmbed.setDescription(
                        courseData.formData.responses.map((resp, index) => 
                            `${index + 1}. ❌ | @${resp.userTag} : ${resp.responses.join(' | ')}`
                        ).join('\n')
                    );
                } else {
                    confirmEmbed.setDescription('Aucune réponse disponible');
                }
            }
        
            const confirmButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_presence')
                    .setLabel('Présent')
                    .setStyle(ButtonStyle.Success)
            );
        
            const confirmMsg = await confirmChannel.send({
                embeds: [confirmEmbed],
                components: [confirmButton]
            });
        
            courseData.confirmationMessageId = confirmMsg.id;
            courseData.isConfirmationPhase = true;
        
            const confirmCollector = confirmMsg.createMessageComponentCollector();
        
            confirmCollector.on('collect', async i => {
                if (courseData.confirmedUsers.some(u => u.userId === i.user.id)) {
                    return i.reply({ content: 'Vous avez déjà confirmé votre présence.', ephemeral: true });
                }
            
                courseData.confirmedUsers.push({
                    userId: i.user.id,
                    userTag: i.user.tag,
                    timestamp: new Date()
                });
            
                if (courseData.formData && courseData.formData.responses) {
                    const updatedDesc = courseData.formData.responses.map((resp, index) => {
                        const confirmedUser = courseData.confirmedUsers.find(u => u.userId === resp.userId);
                        return `${index + 1}. ${confirmedUser ? '✅' : '❌'} | @${resp.userTag} : ${resp.responses.join(' | ')}`;
                    }).join('\n');
                    confirmEmbed.setDescription(updatedDesc);
                    await confirmMsg.edit({ embeds: [confirmEmbed] });
                }
            
                await i.reply({ content: 'Présence confirmée!', ephemeral: true });
            });
        
            await interaction.reply({ content: 'Phase de confirmation lancée!', ephemeral: true });

            const configChannel = await interaction.guild.channels.fetch(courseData.configChannel);
            const configEmbed = new EmbedBuilder()
                .setTitle('Gestion de la Course')
                .setColor('#0099ff')
                .addFields(
                    { name: 'Nom de la course', value: courseData.courseName || 'Non défini' },
                    { name: 'État', value: courseData.isConfirmationPhase ? 'En cours' : 'Configuration' },
                    { name: 'URL SheetDB', value: courseData.sheetdbUrl || 'Non configurée' },
                    { name: 'Nombre de manches', value: courseData.racesCount ? `${courseData.racesCount} manche(s)` : 'Non défini' },
                    { name: 'Rôle confirmation', value: courseData.confirmRole ? `<@&${courseData.confirmRole}>` : 'Non défini' },
                    { name: 'Salons', value: 
                        `Configuration: ${courseData.configChannel ? `<#${courseData.configChannel}>` : 'Non défini'}\n` +
                        `Annonce: ${courseData.announcementChannel ? `<#${courseData.announcementChannel}>` : 'Non défini'}\n` +
                        `Confirmation: ${courseData.confirmationChannel ? `<#${courseData.confirmationChannel}>` : 'Non défini'}`
                    }
                );
        
            const configButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('set_confirm_role')
                    .setLabel('Définir rôle confirmation')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('end_confirm')
                    .setLabel('Terminer confirmation')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('delete_course')
                    .setLabel('Tout supprimer')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('set_races_count')
                    .setLabel('Nombre de manches')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()  // Nouveau bouton
                    .setCustomId('set_sheetdb_url')
                    .setLabel('URL SheetDB')
                    .setStyle(ButtonStyle.Secondary)
            );

            const raceButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('race1_setup')
                    .setLabel('Manche 1')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('race2_setup')
                    .setLabel('Manche 2')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
        
            const configMsg = await configChannel.send({
                embeds: [configEmbed],
                components: [configButtons, raceButtons]
            });

            await Course.create({
                type: 'course',
                createdBy: interaction.user.id,
                courseName: courseData.courseName,
                configChannel: courseData.configChannel,
                announcementChannel: courseData.announcementChannel,
                confirmationChannel: courseData.confirmationChannel,
                configMessageId: configMsg.id,
                confirmationMessageId: confirmMsg.id,
                isConfirmationPhase: true,
                formId: courseData.formId,
                formData: courseData.formData
            });
        
            const configCollector = configMsg.createMessageComponentCollector();
            configCollector.on('collect', async i => {
                switch (i.customId) {
                    case 'set_confirm_role':
                        await handleConfirmRole(i, courseData, configEmbed);
                        break;
                    case 'end_confirm':
                        await handleEndConfirm(i, courseData, configEmbed, confirmMsg, configMsg);
                        break;
                    case 'delete_course':
                        await handleDeleteCourse(i, courseData, confirmMsg, configMsg);
                        break;
                    case 'set_races_count':
                        await handleRacesCount(i, courseData, configEmbed, raceButtons);
                        break;
                    case 'set_sheetdb_url':
                        await handleSheetDBUrl(i, courseData);
                        break;
                    case 'race1_setup':
                    case 'race2_setup':
                        await handleRaceSetup(i, courseData, i.customId === 'race1_setup' ? 1 : 2);
                        break;
                }
            });
        }

        async function handleSheetDBUrl(interaction, courseData) {
            await interaction.reply({ 
                content: 'Entrez l\'URL SheetDB:', 
                ephemeral: true 
            });
        
            const filter = m => m.author.id === interaction.user.id;
            const collected = await interaction.channel.awaitMessages({ 
                filter, 
                max: 1, 
                time: 30000 
            });
        
            if (collected.size > 0) {
                const url = collected.first().content;
                courseData.sheetdbUrl = url;
        
                // Sauvegarder dans MongoDB
                await Course.findOneAndUpdate(
                    { createdBy: interaction.user.id, isEnded: false },
                    { sheetdbUrl: url },
                    { upsert: true }
                );
        
                await collected.first().delete();
                await interaction.editReply({ 
                    content: 'URL SheetDB configurée !',
                    ephemeral: true
                });
            }
        }

        async function handleRacesCount(interaction, courseData, embed, raceButtons) {
            await interaction.reply({ 
                content: 'Combien de manches ? (1 ou 2)', 
                ephemeral: true 
            });
            
            const filter = m => m.author.id === interaction.user.id && ['1', '2'].includes(m.content);
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 });
        
            if (collected.size > 0) {
                const count = parseInt(collected.first().content);
                courseData.racesCount = count;
                
                // Mettre à jour l'état des boutons
                raceButtons.components[0].setDisabled(false);
                raceButtons.components[1].setDisabled(count !== 2);
                
                await collected.first().delete();
                
                // Récupérer le message de configuration actuel
                const configMsg = await interaction.message;
                
                // Mettre à jour le message avec les nouveaux boutons
                await configMsg.edit({
                    embeds: [embed],
                    components: [interaction.message.components[0], raceButtons] // Garde les boutons originaux et met à jour les boutons de course
                });
                
                await interaction.editReply({ content: `${count} manche(s) configurée(s)` });
            }
        }

        async function parseRaceFiles(attachments, raceNumber) {
            const data = {
                classification: [],
                fastestLap: [],
                analysis: [],
                penalties: [],
                entries: []
            };
        
            for (const [_, attachment] of attachments) {
                const response = await axios.get(attachment.url);
                const $ = cheerio.load(response.data);
                
                if (attachment.name.includes('classification')) {
                    $('tbody tr').each((_, row) => {
                        const $tds = $(row).find('td');
                        data.classification.push({
                            manche: raceNumber,
                            position: $($tds[0]).text().trim(),
                            numero: $($tds[1]).text().trim(),
                            pilote: $($tds[2]).text().replace(/\\|\^|\||=\)/g, '').trim(),
                            moto: $($tds[3]).text().replace(/'23/g, '2023').trim(),
                            tours: $($tds[4]).text().trim(),
                            temps_total: $($tds[5]).text().trim(),
                            ecart: $($tds[6]).text().trim(),
                        });
                    });
                } else if (attachment.name.includes('fastestlap')) {
                    $('tbody tr').each((_, row) => {
                        const $tds = $(row).find('td');
                        data.fastestLap.push({
                            manche: raceNumber,
                            position: $($tds[0]).text().trim(),
                            numero: $($tds[1]).text().trim(),
                            pilote: $($tds[2]).text().replace(/\\|\^|\||=\)/g, '').trim(),
                            moto: $($tds[3]).text().replace(/'23/g, '2023').trim(),
                            temps: $($tds[4]).text().trim(),
                            tour: $($tds[5]).text().trim(),
                            ecart: $($tds[6]).text().trim(),
                            vitesse: $($tds[7]).text().replace('km/h', '').trim()
                        });
                    });
                } else if (attachment.name.includes('penalties')) {
                    $('tbody tr').each((_, row) => {
                        const $tds = $(row).find('td');
                        data.penalties.push({
                            manche: raceNumber,
                            numero: $($tds[0]).text().trim(),
                            pilote: $($tds[1]).text().replace(/\\|\^|\||=\)/g, '').trim(),
                            tour: $($tds[2]).text().trim(),
                            penalite: $($tds[3]).text().trim(),
                            raison: $($tds[4]).text().trim()
                        });
                    });
                } else if (attachment.name.includes('entries')) {
                    $('tbody tr').each((_, row) => {
                        const $tds = $(row).find('td');
                        data.entries.push({
                            manche: raceNumber,
                            numero: $($tds[0]).text().trim(),
                            pilote: $($tds[1]).text().replace(/\\|\^|\||=\)/g, '').trim(),
                            moto: $($tds[2]).text().replace(/'23/g, '2023').trim()
                        });
                    });
                } else if (attachment.name.includes('analysis')) {
                    // Ajout de logs pour debug
                    console.log("Traitement du fichier analysis");
                    const text = $.text().trim();
                    
                    // Extrait uniquement la partie après "Race1 Chronological Analysis"
                    const analysisStart = text.indexOf("Race1 Chronological Analysis");
                    const analysisContent = text.slice(analysisStart);
                    
                    // Split sur les pilotes (cherche les numéros au début des lignes)
                    const pilotesSections = analysisContent.split(/\d{2,3}\s+[^\n]+\s+-\s+/);
                    
                    for (let section of pilotesSections) {
                        if (!section.trim()) continue;
                        
                        // Récupère le numéro et les infos du pilote
                        const piloteMatch = analysisContent.match(/(\d{2,3})\s+([^\n]+)\s+-\s+([^\n]+)/);
                        if (!piloteMatch) continue;
                        
                        const [_, numero, pilote, moto] = piloteMatch;
                        
                        // Parse les lignes contenant les temps
                        const lines = section.split('\n')
                            .map(line => line.trim())
                            .filter(line => /^\d+\s+\d/.test(line)); // Lignes commençant par un numéro
                        
                        console.log("Pilote trouvé:", pilote);
                        console.log("Nombre de tours trouvés:", lines.length);
                        
                        lines.forEach(line => {
                            const parts = line.split(/\s+/).filter(Boolean);
                            if (parts.length >= 6) {
                                const [tour, temps, t1, t2, t3, vitesse] = parts;
                                data.analysis.push({
                                    manche: raceNumber,
                                    numero: numero,
                                    pilote: pilote.replace(/\\|\^|\||=\)/g, '').trim(),
                                    moto: moto.replace(/'23/g, '2023').trim(),
                                    tour: tour,
                                    temps_tour: temps.replace(/[*']/g, ''),
                                    secteur1: t1.replace(/[*']/g, ''),
                                    secteur2: t2.replace(/[*']/g, ''),
                                    secteur3: t3.replace(/[*']/g, ''),
                                    vitesse: vitesse.replace('km/h', '').trim()
                                });
                            }
                        });
                    }
                    
                    console.log("Nombre total d'entrées d'analyse:", data.analysis.length);
                }
            }
        
            return data;
        }
        
        async function createExcelFile(data, raceNumber, courseName = 'sans_nom') {
            const workbook = xlsx.utils.book_new();
            const headerStyle = {
                fill: { fgColor: { rgb: "4F81BD" } },
                font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
                alignment: { horizontal: "center", vertical: "center" }
            };
        
            const sheets = [
                { name: `Manche${raceNumber}`, data: data.classification },
                { name: 'Tour rapide', data: data.fastestLap },
                { name: 'Details', data: data.analysis },
                { name: 'Penalites', data: data.penalties },
                { name: 'Participants', data: data.entries }
            ];
        
            sheets.forEach(({ name, data }) => {
                if (data.length > 0) {
                    const ws = xlsx.utils.json_to_sheet(data);
                    applyStyle(ws, headerStyle);
                    adjustColumnWidths(ws);
                    
                    if (name === 'Details') {
                        applyGroupStyle(ws, 'pilote');
                    }
                    
                    xlsx.utils.book_append_sheet(workbook, ws, name);
                }
            });
        
            return workbook;
        }

        function applyGroupStyle(worksheet, groupBy) {
            // Cette fonction va appliquer des styles pour regrouper les lignes par pilote
            const range = xlsx.utils.decode_range(worksheet['!ref']);
            let currentGroup = '';
            let startRow = 1; // On commence après l'en-tête
            
            // Parcourir toutes les lignes
            for (let row = range.s.r + 1; row <= range.e.r; row++) {
                // Trouver la cellule du pilote
                const piloteCell = xlsx.utils.encode_cell({ r: row, c: 1 }); // Colonne du pilote
                const pilote = worksheet[piloteCell]?.v;
                
                // Si on change de pilote ou c'est la dernière ligne
                if (pilote !== currentGroup || row === range.e.r) {
                    if (currentGroup && startRow < row) {
                        // Appliquer un style de groupe pour les lignes précédentes
                        for (let groupRow = startRow; groupRow < row; groupRow++) {
                            for (let col = range.s.c; col <= range.e.c; col++) {
                                const cellRef = xlsx.utils.encode_cell({ r: groupRow, c: col });
                                if (!worksheet[cellRef].s) worksheet[cellRef].s = {};
                                
                                // Ajouter une légère couleur de fond pour le groupe
                                worksheet[cellRef].s.fill = {
                                    fgColor: { rgb: "F0F0F0" }
                                };
                            }
                        }
                        
                        // Ajouter une bordure plus épaisse entre les groupes
                        if (row < range.e.r) {
                            for (let col = range.s.c; col <= range.e.c; col++) {
                                const cellRef = xlsx.utils.encode_cell({ r: row - 1, c: col });
                                if (!worksheet[cellRef].s) worksheet[cellRef].s = {};
                                worksheet[cellRef].s.border = {
                                    ...worksheet[cellRef].s.border,
                                    bottom: { style: "medium", color: { rgb: "000000" } }
                                };
                            }
                        }
                    }
                    
                    // Démarrer un nouveau groupe
                    currentGroup = pilote;
                    startRow = row;
                }
            }
        }
        
        // Mettre à jour handleRaceSetup
        async function handleRaceSetup(interaction, courseData, raceNumber) {
            try {
                await interaction.reply({ content: `Envoyez les fichiers HTML de la manche ${raceNumber}`, ephemeral: true });
                
                const collected = await interaction.channel.awaitMessages({
                    filter: m => m.author.id === interaction.user.id && m.attachments.size > 0,
                    max: 1,
                    time: 60000
                });
        
                if (collected.size > 0) {
                    const data = await parseRaceFiles(collected.first().attachments, raceNumber);
                    const workbook = await createExcelFile(data, raceNumber, courseData.courseName);
                    
                    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                    const attachment = new AttachmentBuilder(buffer, { 
                        name: `course_${courseData.courseName || 'sans_nom'}_manche${raceNumber}.xlsx` 
                    });
        
                    await interaction.followUp({
                        content: 'Fichier Excel généré !',
                        files: [attachment],
                        ephemeral: true
                    });
                }
            } catch (error) {
                console.error('Erreur:', error);
                await interaction.followUp({ content: `Erreur: ${error.message}`, ephemeral: true });
            }
        }
        
        // Fonctions utilitaires pour le style
        async function applyStyle(worksheet, headerStyle) {
            const range = xlsx.utils.decode_range(worksheet['!ref']);
            
            // Style d'en-tête
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellRef = xlsx.utils.encode_cell({ r: 0, c: col });
                if (!worksheet[cellRef].s) worksheet[cellRef].s = {};
                worksheet[cellRef].s = {
                    fill: { fgColor: { rgb: "4F81BD" } },
                    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
                    alignment: { horizontal: "center", vertical: "center" },
                    border: {
                        top: { style: "thick", color: { rgb: "000000" } },
                        bottom: { style: "thick", color: { rgb: "000000" } },
                        left: { style: "thin", color: { rgb: "000000" } },
                        right: { style: "thin", color: { rgb: "000000" } }
                    }
                };
            }
        
            // Style des cellules
            for (let row = range.s.r + 1; row <= range.e.r; row++) {
                for (let col = range.s.c; col <= range.e.c; col++) {
                    const cellRef = xlsx.utils.encode_cell({ r: row, c: col });
                    if (!worksheet[cellRef].s) worksheet[cellRef].s = {};
                    worksheet[cellRef].s = {
                        font: { sz: 11 },
                        alignment: { horizontal: "center", vertical: "center" },
                        border: {
                            top: { style: "thin", color: { rgb: "000000" } },
                            bottom: { style: "thin", color: { rgb: "000000" } },
                            left: { style: "thin", color: { rgb: "000000" } },
                            right: { style: "thin", color: { rgb: "000000" } }
                        }
                    };
        
                    // Style alterné pour les lignes
                    if (row % 2 === 0) {
                        worksheet[cellRef].s.fill = { fgColor: { rgb: "F2F2F2" } };
                    }
                }
            }
        }
        
        function adjustColumnWidths(worksheet) {
            const columnWidths = [];
            const range = xlsx.utils.decode_range(worksheet['!ref']);
        
            // Calculer la largeur maximale pour chaque colonne
            for (let col = range.s.c; col <= range.e.c; col++) {
                let maxLength = 10; // Largeur minimum
                for (let row = range.s.r; row <= range.e.r; row++) {
                    const cellRef = xlsx.utils.encode_cell({ r: row, c: col });
                    if (worksheet[cellRef]) {
                        const length = worksheet[cellRef].v.toString().length;
                        maxLength = Math.max(maxLength, length);
                    }
                }
                columnWidths.push({ wch: maxLength + 2 }); // +2 pour la marge
            }
        
            worksheet['!cols'] = columnWidths;
        }

        async function endConfirmationPhase(interaction, courseData) {
            const announceChannel = await interaction.guild.channels.fetch(courseData.announcementChannel);

            const finalEmbed = new EmbedBuilder()
                .setTitle('Liste des Participants')
                .setDescription(courseData.confirmedUsers.map((user, index) => 
                    `${index + 1}. ${user.userTag}`
                ).join('\n'))
                .setColor('#00ff00')
                .setFooter({ text: `Total: ${courseData.confirmedUsers.length} participant(s)` });

            await announceChannel.send({ embeds: [finalEmbed] });
            courseData.isEnded = true;

            await interaction.reply({ content: 'Phase de confirmation terminée!', ephemeral: true });
        }

        function areChannelsConfigured(courseData) {
            return courseData.configChannel && courseData.announcementChannel && courseData.confirmationChannel;
        }

        async function handleConfirmRole(i, courseData, embed) {
            await i.reply({ content: 'Mentionnez le rôle à donner:', ephemeral: true });
            const filter = m => m.author.id === i.user.id && m.mentions.roles.size > 0;
            const collected = await i.channel.awaitMessages({ filter, max: 1, time: 30000 });
            
            if (collected.size > 0) {
                courseData.confirmRole = collected.first().mentions.roles.first().id;
                
                // Ajouter ici
                await Course.findOneAndUpdate(
                    { createdBy: i.user.id, isEnded: false },
                    { confirmRole: courseData.confirmRole }
                );
                
                await collected.first().delete();
                await i.editReply({ content: 'Rôle configuré!', components: [] });
            }
        }

        async function handleEndConfirm(i, courseData, embed, confirmMsg, configMsg) {
            if (courseData.confirmRole) {
                const role = await i.guild.roles.fetch(courseData.confirmRole);
                for (const user of courseData.confirmedUsers) {
                    const member = await i.guild.members.fetch(user.userId);
                    await member.roles.add(role);
                }
            }
        
            embed.data.fields[1].value = 'Terminé';
            await confirmMsg.edit({ components: [] });
            await configMsg.edit({ embeds: [embed] });
            await i.reply({ content: 'Phase de confirmation terminée!', ephemeral: true });
        }
        
        async function handleDeleteCourse(i, courseData, confirmMsg, configMsg) {
            try {
                // Suppression complète de la base de données
                await Course.findOneAndDelete({ 
                    createdBy: i.user.id, 
                    isEnded: false 
                });
        
                await confirmMsg.delete().catch(() => {});
                await configMsg.delete().catch(() => {});
                
                await i.reply({ 
                    content: 'Course supprimée de la base de données !', 
                    ephemeral: true 
                });
            } catch(error) {
                console.error('Erreur suppression:', error);
                await i.reply({ 
                    content: 'Erreur lors de la suppression de la course', 
                    ephemeral: true 
                });
            }
        }
    }
};