const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const FormManager = require('../../utils/database/formManager');

module.exports = {
    name: 'formulaire',
    description: 'Créer ou modifier un formulaire',

    buttonHandler: async (interaction) => {
        if (!interaction.customId.startsWith('answer_form_')) return;
        
        const formId = interaction.customId.replace('answer_form_', '');
        console.log('ID recherché:', formId);
        
        try {            
            const form = await FormManager.getFormById(formId);
            
            if (!form) {
                return await interaction.reply({
                    content: 'Ce formulaire n\'existe plus.',
                    ephemeral: true
                });
            }

            // Créer le modal
            const modal = new ModalBuilder()
                .setCustomId(`form_submit_${formId}`)
                .setTitle(form.title);

            // Ajouter chaque champ du formulaire au modal
            form.options.forEach((option, index) => {
                const textInput = new TextInputBuilder()
                    .setCustomId(`field_${index}`)
                    .setLabel(option.title)
                    .setStyle(option.style === 'court' ? TextInputStyle.Short : TextInputStyle.Paragraph)
                    .setMinLength(option.minLength)
                    .setMaxLength(option.maxLength)
                    .setRequired(option.required)
                    .setPlaceholder(option.placeholder || '');

                // Ajouter le champ dans une nouvelle ligne
                modal.addComponents(
                    new ActionRowBuilder().addComponents(textInput)
                );
            });

            // Afficher le modal
            await interaction.showModal(modal);

        } catch (error) {
            console.error('Erreur lors de la création du modal:', error);
            await interaction.reply({
                content: 'Une erreur est survenue lors de l\'ouverture du formulaire.',
                ephemeral: true
            });
        }
    },

    modalHandler: async (interaction) => {
        if (!interaction.customId.startsWith('form_submit_')) return;

        try {
            const formId = interaction.customId.replace('form_submit_', '');
            const form = await FormManager.getFormById(formId);

            if (!form) {
                return await interaction.reply({
                    content: 'Ce formulaire n\'existe plus.',
                    ephemeral: true
                });
            }

            // Récupérer les réponses
            const responses = form.options.map((opt, index) => 
                interaction.fields.getTextInputValue(`field_${index}`)
            );

            // Sauvegarder la réponse
            await FormManager.addResponse(formId, interaction.user.id, interaction.user.tag, responses);

            // Mettre à jour les logs si nécessaire
            if (form.logsChannel) {
                await updateFormLogs(interaction, form, responses);
            }

            await interaction.reply({
                content: 'Votre réponse a été enregistrée avec succès!',
                ephemeral: true
            });

        } catch (error) {
            console.error('Erreur lors du traitement des réponses:', error);
            await interaction.reply({
                content: 'Une erreur est survenue lors de l\'enregistrement de votre réponse.',
                ephemeral: true
            });
        }
    },

    async execute(message, args, client) {
        const dirPath = path.join(process.cwd(), 'data', 'formulaire');
        const filePath = path.join(dirPath, 'file.json');

        // Commande list
        if (args[0] === 'list') {
            try {
                const forms = await FormManager.getAllForms();
                
                if (forms.length === 0) {
                    return message.reply('Aucun formulaire n\'existe encore.');
                }
        
                const embed = new EmbedBuilder()
                    .setTitle('Liste des Formulaires')
                    .setColor('#0099ff')
                    .setDescription(
                        forms.map((form) => 
                            `${form.number}. ${form.title || 'Sans titre'} (ID: ${form.id})`
                        ).join('\n')
                    )
                    .setFooter({ text: `Total: ${forms.length} formulaire(s)` });
        
                return message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('❌ Erreur lors de la lecture des formulaires:', error);
                return message.reply('Une erreur est survenue lors de la lecture des formulaires.');
            }
        }

        if (args[0] === 'delete') {
            try {
                // Vérifier si un numéro est fourni
                if (!args[1]) {
                    return message.reply('Veuillez spécifier un numéro de formulaire à supprimer.');
                }
        
                // Récupérer tous les formulaires triés par numéro
                const forms = await FormManager.getAllForms();
                const formIndex = parseInt(args[1]) - 1;
        
                // Vérifier si le formulaire existe
                if (formIndex < 0 || formIndex >= forms.length) {
                    return message.reply('Ce numéro de formulaire n\'existe pas.');
                }
        
                const formToDelete = forms[formIndex];
        
                // Demander confirmation
                const confirmEmbed = new EmbedBuilder()
                    .setTitle('Confirmation de suppression')
                    .setColor('#ff0000')
                    .setDescription(`Êtes-vous sûr de vouloir supprimer le formulaire "${formToDelete.title || 'Sans titre'}" ?`)
                    .addFields({ name: 'Numéro', value: args[1] });
        
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_delete')
                        .setLabel('Confirmer')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_delete')
                        .setLabel('Annuler')
                        .setStyle(ButtonStyle.Secondary)
                );
        
                const confirmMsg = await message.reply({
                    embeds: [confirmEmbed],
                    components: [row]
                });
        
                const collector = confirmMsg.createMessageComponentCollector({
                    filter: i => i.user.id === message.author.id,
                    time: 30000,
                    max: 1
                });
        
                collector.on('collect', async i => {
                    if (i.customId === 'confirm_delete') {
                        try {
                            // Supprimer le message du formulaire dans Discord
                            if (formToDelete.channel && formToDelete.messageId) {
                                try {
                                    const channel = await message.guild.channels.fetch(formToDelete.channel);
                                    await channel.messages.delete(formToDelete.messageId).catch(error => {
                                        console.log('Message déjà supprimé ou introuvable:', error);
                                    });
                                } catch (error) {
                                    console.log('Erreur de suppression du message:', error);
                                }
                            }
                    
                            // Supprimer le message de logs si présent
                            if (formToDelete.logsChannel && formToDelete.logsMessage) {
                                try {
                                    const logsChannel = await message.guild.channels.fetch(formToDelete.logsChannel);
                                    await logsChannel.messages.delete(formToDelete.logsMessage).catch(error => {
                                        console.log('Message de logs déjà supprimé ou introuvable:', error);
                                    });
                                } catch (error) {
                                    console.log('Erreur de suppression des logs:', error);
                                }
                            }
                    
                            // Supprimer le formulaire de la base de données
                            await FormManager.deleteForm(formToDelete.id);
        
                            // Mettre à jour les numéros des formulaires restants
                            const remainingForms = await FormManager.getAllForms();
                            for (let i = 0; i < remainingForms.length; i++) {
                                const form = remainingForms[i];
                                if (form.number !== i + 1) {
                                    await FormManager.updateForm(form.id, { number: i + 1 });
                                }
                            }
        
                            await i.update({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('Formulaire supprimé')
                                        .setColor('#00ff00')
                                        .setDescription('Le formulaire a été supprimé avec succès.')
                                ],
                                components: []
                            });
        
                        } catch (error) {
                            console.error('❌ Erreur lors de la suppression complète du formulaire:', error);
                            await i.reply({
                                content: 'Une erreur est survenue lors de la suppression du formulaire.',
                                ephemeral: true
                            });
                        }
                    } else {
                        await i.update({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('Suppression annulée')
                                    .setColor('#0099ff')
                                    .setDescription('La suppression du formulaire a été annulée.')
                            ],
                            components: []
                        });
                    }
                });
        
                collector.on('end', async collected => {
                    if (collected.size === 0) {
                        await confirmMsg.edit({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('Délai expiré')
                                    .setColor('#ff0000')
                                    .setDescription('La demande de suppression a expiré.')
                            ],
                            components: []
                        });
                    }
                });
        
                return;
            } catch (error) {
                console.error('❌ Erreur lors de la suppression du formulaire:', error);
                return message.reply('Une erreur est survenue lors de la suppression du formulaire.');
            }
        }

        if (args[0] === 'gestion') {
            try {
                if (!args[1]) {
                    return message.reply('Veuillez spécifier le numéro du formulaire.');
                }
        
                const forms = await FormManager.getAllForms();
                const form = forms.find(f => f.number === parseInt(args[1]));
        
                if (!form) {
                    return message.reply('Ce formulaire n\'existe pas.');
                }
        
                if (!form.logsChannel || !form.logsMessage) {
                    return message.reply('Ce formulaire n\'a pas de logs configurés.');
                }
        
                const embed = new EmbedBuilder()
                    .setTitle('Gestion des Réponses')
                    .setDescription('Choisissez l\'action à effectuer')
                    .setColor('#0099ff');
        
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('add_response')
                        .setLabel('Ajouter une ligne')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('remove_response')
                        .setLabel('Supprimer une ligne')
                        .setStyle(ButtonStyle.Danger)
                );
        
                const msg = await message.reply({
                    embeds: [embed],
                    components: [row]
                });
        
                const collector = msg.createMessageComponentCollector({
                    time: 60000
                });
        
                collector.on('collect', async i => {
                    if (i.user.id !== message.author.id) {
                        return i.reply({ content: 'Vous ne pouvez pas utiliser ces boutons.', ephemeral: true });
                    }
        
                    if (i.customId === 'add_response') {
                        try {
                            // Créer le modal
                            const modal = new ModalBuilder()
                                .setCustomId('add_line_modal')
                                .setTitle('Ajouter une ligne');
                    
                            // Ajouter le champ pour la position
                            modal.addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('line_position')
                                        .setLabel('Position (vide pour ajouter à la fin)')
                                        .setStyle(TextInputStyle.Short)
                                        .setRequired(false)
                                        .setPlaceholder('Exemple: 2')
                                )
                            );
                    
                            // Ajouter un champ pour chaque option du formulaire
                            form.options.forEach((option, index) => {
                                modal.addComponents(
                                    new ActionRowBuilder().addComponents(
                                        new TextInputBuilder()
                                            .setCustomId(`field_${index}`)
                                            .setLabel(option.title)
                                            .setStyle(option.style === 'court' ? TextInputStyle.Short : TextInputStyle.Paragraph)
                                            .setRequired(option.required)
                                            .setPlaceholder(option.placeholder || '')
                                    )
                                );
                            });
                    
                            // Afficher le modal
                            await i.showModal(modal);
                    
                            // Collecter la réponse du modal
                            const modalSubmit = await i.awaitModalSubmit({
                                filter: (interaction) => interaction.customId === 'add_line_modal',
                                time: 300000
                            }).catch(() => null);
                    
                            if (!modalSubmit) return;
                    
                            // Traiter la réponse
                            const position = modalSubmit.fields.getTextInputValue('line_position');
                            const responses = form.options.map((_, index) => 
                                modalSubmit.fields.getTextInputValue(`field_${index}`)
                            );
                    
                            // Mettre à jour l'embed des logs
                            const logsChannel = await message.guild.channels.fetch(form.logsChannel);
                            const logsMessage = await logsChannel.messages.fetch(form.logsMessage);
                            let description = logsMessage.embeds[0].description;
                    
                            if (description === 'En attente de réponses...') {
                                description = '';
                            }
                    
                            const lines = description ? description.split('\n') : [];
                            const targetPosition = position ? parseInt(position) : lines.length + 1;
                            const newLine = `${targetPosition}. | ${responses.join(' | ')}`;
                    
                            if (position) {
                                // Insérer à la position spécifique et mettre à jour les numéros
                                lines.splice(targetPosition - 1, 0, newLine);
                                for (let i = targetPosition; i < lines.length; i++) {
                                    lines[i] = lines[i].replace(/^\d+\./, `${i + 1}.`);
                                }
                            } else {
                                // Ajouter à la fin
                                lines.push(newLine);
                            }
                    
                            const updatedEmbed = new EmbedBuilder(logsMessage.embeds[0])
                                .setDescription(lines.join('\n'));
                    
                            await logsMessage.edit({ embeds: [updatedEmbed] });
                            await modalSubmit.reply({ content: 'Ligne ajoutée avec succès!', ephemeral: true });
                    
                        } catch (error) {
                            console.error('Erreur lors de l\'ajout de la ligne:', error);
                            await i.reply({ 
                                content: 'Une erreur est survenue lors de l\'ajout de la ligne.', 
                                ephemeral: true 
                            });
                        }
                    }
        
                    if (i.customId === 'remove_response') {
                        await i.reply({
                            content: 'Quel numéro de ligne voulez-vous supprimer ?',
                            ephemeral: true
                        });
        
                        const lineCollector = i.channel.createMessageCollector({
                            filter: m => m.author.id === message.author.id,
                            time: 30000,
                            max: 1
                        });
        
                        lineCollector.on('collect', async lineMsg => {
                            const lineNumber = parseInt(lineMsg.content);
                            await lineMsg.delete().catch(() => {});
        
                            const logsChannel = await message.guild.channels.fetch(form.logsChannel);
                            const logsMessage = await logsChannel.messages.fetch(form.logsMessage);
                            let description = logsMessage.embeds[0].description;
        
                            if (!description || description === 'En attente de réponses...') {
                                return i.followUp({ content: 'Aucune réponse à supprimer.', ephemeral: true });
                            }
        
                            let lines = description.split('\n');
        
                            if (lineNumber < 1 || lineNumber > lines.length) {
                                return i.followUp({ content: 'Numéro de ligne invalide.', ephemeral: true });
                            }
        
                            // Supprimer la ligne et mettre à jour les numéros
                            lines.splice(lineNumber - 1, 1);
                            lines = lines.map((line, idx) => line.replace(/^\d+\./, `${idx + 1}.`));
        
                            const updatedEmbed = new EmbedBuilder(logsMessage.embeds[0])
                                .setDescription(lines.join('\n') || 'En attente de réponses...');
        
                            await logsMessage.edit({ embeds: [updatedEmbed] });
                            await i.followUp({ content: 'Ligne supprimée avec succès!', ephemeral: true });
                        });
                    }
                });
        
                collector.on('end', async () => {
                    await msg.edit({ components: [] }).catch(() => {});
                });
        
            } catch (error) {
                console.error('Erreur lors de la gestion du formulaire:', error);
                return message.reply('Une erreur est survenue lors de la gestion du formulaire.');
            }
        }

        // Vérifier si un numéro de formulaire est fourni
        if (args[0]) {
            try {
                const dirPath = path.join(process.cwd(), 'data', 'formulaire');
                const filePath = path.join(dirPath, 'file.json');

                // Vérifier si le fichier existe
                if (!fs.existsSync(filePath)) {
                    return message.reply('Aucun formulaire n\'existe encore.');
                }

                // Lire les formulaires
                const forms = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const formIndex = parseInt(args[0]) - 1;

                // Vérifier si le formulaire existe
                if (formIndex < 0 || formIndex >= forms.length) {
                    return message.reply('Ce numéro de formulaire n\'existe pas.');
                }

                const formData = forms[formIndex];

                // Créer l'embed avec les données existantes
                const embed = new EmbedBuilder()
                    .setTitle('Modification du Formulaire')
                    .setDescription(`Modification du formulaire #${args[0]}`)
                    .setColor('#0099ff')
                    .addFields(
                        { name: 'Titre du formulaire', value: formData.title || 'Aucun', inline: true },
                        { name: 'Salon', value: formData.channel ? `<#${formData.channel}>` : 'Aucun', inline: true },
                        { name: 'Message du formulaire', value: formData.messageContent?.substring(0, 100) || 'Aucun', inline: true },
                        { name: 'Salon de logs', value: formData.logsChannel ? `<#${formData.logsChannel}> (${formData.logsType})` : 'Aucun', inline: true },
                        { name: 'Texte du bouton', value: formData.buttonText || 'Aucun', inline: true },
                        { name: 'Emoji du bouton', value: formData.buttonEmoji || 'Aucun', inline: true },
                        { name: 'Couleur du bouton', value: Object.entries(ButtonStyle).find(([key, value]) => value === formData.buttonColor)?.[0] || 'Bleu', inline: true },
                        { name: '--- Options du formulaire ---', value: formData.options?.map(opt => opt.title).join('\n') || 'Aucune', inline: false }
                    );
                
                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('form_title')
                        .setLabel('Titre du formulaire')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('form_channel')
                        .setLabel('Salon')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('form_message')
                        .setLabel('Message')
                        .setStyle(ButtonStyle.Primary)
                );

                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('form_logs')
                        .setLabel('Salon de logs')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('form_button_text')
                        .setLabel('Texte du bouton')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('form_button_emoji')
                        .setLabel('Emoji du bouton')
                        .setStyle(ButtonStyle.Primary)
                );

                const row3 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('form_button_color')
                        .setLabel('Couleur du bouton')
                        .setStyle(ButtonStyle.Primary)
                );

                // Menu déroulant pour les options
                const row4 = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('form_options')
                        .setPlaceholder('Options du formulaire')
                        .addOptions([
                            {
                                label: 'Ajouter une option',
                                description: 'Ajouter une nouvelle option au formulaire',
                                value: 'add_option'
                            },
                            // Ajouter dynamiquement les options existantes
                            ...formData.options.map((opt, index) => ({
                                label: opt.title,
                                description: `${opt.style} - ${opt.required ? 'Requis' : 'Optionnel'}`,
                                value: `edit_option_${index}`
                            }))
                        ])
                );

                const row5 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('form_save')
                        .setLabel('Sauvegarder')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('form_cancel')
                        .setLabel('Annuler')
                        .setStyle(ButtonStyle.Danger)
                );

                const formMessage = await message.channel.send({
                    embeds: [embed],
                    components: [row1, row2, row3, row4, row5]
                });

                const collector = formMessage.createMessageComponentCollector({
                    time: 600000 // 10 minutes
                });

                collector.on('collect', async i => {
                    if (i.user.id !== message.author.id) {
                        return i.reply({ content: "Vous n'avez pas la permission d'utiliser ces boutons.", ephemeral: true });
                    }

                    // Gestion des interactions
                    switch (i.customId) {
                        case 'form_title':
                            await handleFormTitle(i, embed, formData);
                            break;
                        case 'form_channel':
                            await handleFormChannel(i, embed, formData);
                            break;
                        case 'form_message':
                            await handleFormMessage(i, embed, formData);
                            break;
                        case 'form_logs':
                            await handleFormLogs(i, embed, formData);
                            break;
                        case 'form_button_text':
                            await handleButtonText(i, embed, formData);
                            break;
                        case 'form_button_emoji':
                            await handleButtonEmoji(i, embed, formData);
                            break;
                        case 'form_button_color':
                            await handleButtonColor(i, embed, formData);
                            break;
                        case 'form_options':
                            if (i.values[0] === 'add_option') {
                                await handleAddOption(i, embed, formData);
                            } else if (i.values[0].startsWith('edit_option_')) {
                                const optionIndex = parseInt(i.values[0].split('_')[2]);
                                await handleEditOption(i, embed, formData, optionIndex);
                            }
                            break;
                        case 'form_save':
                            await handleFormSave(i, formData);
                            collector.stop();
                            break;
                        case 'form_cancel':
                            await i.update({ content: 'Configuration annulée', components: [] });
                            collector.stop();
                            break;
                    }

                    // Mise à jour du message
                    try {
                        await formMessage.edit({ embeds: [embed], components: [row1, row2, row3, row4, row5] });
                    } catch (error) {
                        console.error('Erreur lors de la mise à jour du message:', error);
                    }
                });

                async function handleFormSave(i, updatedFormData) {
                    try {
                        forms[formIndex] = {
                            ...formData,
                            ...updatedFormData,
                            updatedAt: new Date().toISOString(),
                            updatedBy: i.user.id
                        };

                        fs.writeFileSync(filePath, JSON.stringify(forms, null, 2));

                        await i.reply({
                            content: `Le formulaire #${args[0]} a été mis à jour avec succès!`,
                            ephemeral: true
                        });
                    } catch (error) {
                        console.error('Erreur lors de la mise à jour du formulaire:', error);
                        await i.reply({
                            content: 'Une erreur est survenue lors de la mise à jour du formulaire.',
                            ephemeral: true
                        });
                    }
                }
            } catch (error) {
                console.error('Erreur lors du chargement du formulaire:', error);
                return message.reply('Une erreur est survenue lors du chargement du formulaire.');
            }
        } else {
            try {
                // Récupérer le prochain numéro de formulaire depuis MongoDB
                const forms = await FormManager.getAllForms();
                const formNumber = forms.length + 1;
        
                // Structure de base du nouveau formulaire
                const formData = {
                    number: formNumber,
                    title: '',
                    channel: null,
                    messageContent: '',
                    messageId: null,
                    logsChannel: null,
                    logsType: null,
                    logsMessage: null,
                    buttonText: '',
                    buttonEmoji: '',
                    buttonColor: ButtonStyle.Primary,
                    options: [],
                    responses: []
                };
        
                const embed = new EmbedBuilder()
                    .setTitle('Configuration du Formulaire')
                    .setDescription(`Configuration du formulaire #${formNumber}`)
                    .setColor('#0099ff')
                    .addFields(
                        { name: 'Titre du formulaire', value: 'Aucun', inline: true },
                        { name: 'Salon', value: 'Aucun', inline: true },
                        { name: 'Message du formulaire', value: 'Aucun', inline: true },
                        { name: 'Salon de logs', value: 'Aucun', inline: true },
                        { name: 'Texte du bouton', value: 'Aucun', inline: true },
                        { name: 'Emoji du bouton', value: 'Aucun', inline: true },
                        { name: 'Couleur du bouton', value: 'Bleu', inline: true },
                        { name: '--- Options du formulaire ---', value: 'Aucune', inline: false }
                    );

                // Création des boutons
                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('form_title')
                        .setLabel('Titre du formulaire')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('form_channel')
                        .setLabel('Salon')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('form_message')
                        .setLabel('Message')
                        .setStyle(ButtonStyle.Primary)
                );

                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('form_logs')
                        .setLabel('Salon de logs')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('form_button_text')
                        .setLabel('Texte du bouton')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('form_button_emoji')
                        .setLabel('Emoji du bouton')
                        .setStyle(ButtonStyle.Primary)
                );

                const row3 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('form_button_color')
                        .setLabel('Couleur du bouton')
                        .setStyle(ButtonStyle.Primary)
                );

                // Menu déroulant pour les options
                const row4 = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('form_options')
                        .setPlaceholder('Options du formulaire')
                        .addOptions([
                            {
                                label: 'Ajouter une option',
                                description: 'Ajouter une nouvelle option au formulaire',
                                value: 'add_option'
                            }
                        ])
                );

                const row5 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('form_save')
                        .setLabel('Sauvegarder')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('form_cancel')
                        .setLabel('Annuler')
                        .setStyle(ButtonStyle.Danger)
                );

                // Envoi du message initial
                const formMessage = await message.channel.send({
                    embeds: [embed],
                    components: [row1, row2, row3, row4, row5]
                });

                // Création du collecteur
                const collector = formMessage.createMessageComponentCollector({
                    time: 600000 // 10 minutes
                });

                collector.on('collect', async i => {
                    if (i.user.id !== message.author.id) {
                        return i.reply({ content: "Vous n'avez pas la permission d'utiliser ces boutons.", ephemeral: true });
                    }

                    // Gestion des interactions
                    switch (i.customId) {
                        case 'form_title':
                            await handleFormTitle(i, embed, formData);
                            break;
                        case 'form_channel':
                            await handleFormChannel(i, embed, formData);
                            break;
                        case 'form_message':
                            await handleFormMessage(i, embed, formData);
                            break;
                        case 'form_logs':
                            await handleFormLogs(i, embed, formData);
                            break;
                        case 'form_button_text':
                            await handleButtonText(i, embed, formData);
                            break;
                        case 'form_button_emoji':
                            await handleButtonEmoji(i, embed, formData);
                            break;
                        case 'form_button_color':
                            await handleButtonColor(i, embed, formData);
                            break;
                        case 'form_options':
                            if (i.values[0] === 'add_option') {
                                await handleAddOption(i, embed, formData);
                            } else if (i.values[0].startsWith('edit_option_')) {
                                const optionIndex = parseInt(i.values[0].split('_')[2]);
                                await handleEditOption(i, embed, formData, optionIndex);
                            }
                            break;
                        case 'form_save':
                            await handleFormSave(i, formData);
                            collector.stop();
                            break;
                        case 'form_cancel':
                            await i.update({ content: 'Configuration annulée', components: [] });
                            collector.stop();
                            break;
                    }

                    // Mise à jour du message
                    try {
                        await formMessage.edit({ embeds: [embed], components: [row1, row2, row3, row4, row5] });
                    } catch (error) {
                        console.error('Erreur lors de la mise à jour du message:', error);
                    }
                });

                async function handleFormSave(i, formData) {
                    if (!formData.title || !formData.channel || !formData.buttonText || formData.options.length === 0) {
                        return i.reply({ 
                            content: 'Veuillez remplir tous les champs obligatoires (titre, salon, texte du bouton) et ajouter au moins une option.', 
                            ephemeral: true 
                        });
                    }
                
                    try {
                        const timestamp = Date.now();
                        const formId = `form_${timestamp}`;
                        console.log('ID créé:', formId);
                        formData.id = formId;
                
                        // Récupérer les channels
                        const targetChannel = await i.guild.channels.fetch(formData.channel);
                        if (!targetChannel) {
                            throw new Error('Le salon cible est introuvable');
                        }
                
                        // Créer le bouton pour répondre au formulaire
                        const formButton = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`answer_form_${formId}`)
                                .setLabel(formData.buttonText)
                                .setStyle(formData.buttonColor)
                        );
                        
                        if (formData.buttonEmoji) {
                            formButton.components[0].setEmoji(formData.buttonEmoji);
                        }
                
                        // Préparer le message du formulaire
                        let messageOptions = {};
                        if (formData.messageContent.startsWith('embed:')) {
                            const embedData = JSON.parse(formData.messageContent.slice(6));
                            messageOptions = {
                                embeds: [embedData],
                                components: [formButton]
                            };
                        } else {
                            messageOptions = {
                                content: formData.messageContent,
                                components: [formButton]
                            };
                        }
                
                        // Envoyer le formulaire et sauvegarder le messageId
                        const formMessage = await targetChannel.send(messageOptions);
                        formData.messageId = formMessage.id;
                
                        // Sauvegarder dans MongoDB
                        const savedForm = await FormManager.createForm({
                            ...formData,
                            id: formId,
                            createdBy: i.user.id,
                        });
                        console.log('ID sauvegardé:', savedForm.id);
                
                        await i.reply({ 
                            content: `Le formulaire a été sauvegardé et envoyé avec succès!`, 
                            ephemeral: true 
                        });
                
                    } catch (error) {
                        console.error('❌ Erreur:', error);
                        await i.reply({ 
                            content: 'Une erreur est survenue lors de la sauvegarde du formulaire.', 
                            ephemeral: true 
                        });
                    }
                }

                // Fonctions de gestion des interactions
                async function handleFormTitle(i, embed, formData) {
                    await i.reply({ content: 'Veuillez entrer le titre du formulaire:', ephemeral: true });
                    const filter = m => m.author.id === i.user.id;
                    const collected = await i.channel.awaitMessages({ filter, max: 1, time: 30000 });
                    
                    if (collected.size > 0) {
                        const title = collected.first().content;
                        formData.title = title;
                        embed.data.fields[0].value = title;
                        await i.followUp({ content: 'Titre mis à jour!', ephemeral: true });
                        try {
                            await collected.first().delete();
                        } catch (error) {
                            console.error('Impossible de supprimer le message:', error);
                        }
                    }
                }

                async function handleFormChannel(i, embed, formData) {
                    await i.reply({ content: 'Veuillez mentionner le salon pour le formulaire:', ephemeral: true });
                    const filter = m => m.author.id === i.user.id && m.mentions.channels.size > 0;
                    const collected = await i.channel.awaitMessages({ filter, max: 1, time: 30000 });
                    
                    if (collected.size > 0) {
                        const channel = collected.first().mentions.channels.first();
                        formData.channel = channel.id;
                        embed.data.fields[1].value = `<#${channel.id}>`;
                        await i.followUp({ content: 'Salon mis à jour!', ephemeral: true });
                        try {
                            await collected.first().delete();
                        } catch (error) {
                            console.error('Impossible de supprimer le message:', error);
                        }
                    }
                }

                async function handleFormMessage(i, embed, formData) {
                    const messageEmbed = new EmbedBuilder()
                        .setTitle('Configuration du Message')
                        .setDescription('Choisissez le type de message pour votre formulaire')
                        .setColor('#0099ff');
                
                    const messageRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('message_simple')
                            .setLabel('Message')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('message_embed')
                            .setLabel('Embed')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('message_cancel')
                            .setLabel('Annuler')
                            .setStyle(ButtonStyle.Danger)
                    );
                
                    // Répondre avec l'embed initial
                    await i.reply({
                        embeds: [messageEmbed],
                        components: [messageRow],
                        ephemeral: true
                    });
                
                    // Créer un collecteur sur l'interaction initiale
                    const messageFilter = int => int.user.id === i.user.id;
                    try {
                        const messageInteraction = await i.channel.awaitMessageComponent({
                            filter: messageFilter,
                            time: 300000
                        });
                
                        switch (messageInteraction.customId) {
                            case 'message_simple':
                                await messageInteraction.reply({ 
                                    content: 'Entrez votre message:',
                                    ephemeral: true 
                                });
                
                                const msgCollected = await messageInteraction.channel.awaitMessages({
                                    filter: m => m.author.id === i.user.id,
                                    max: 1,
                                    time: 30000
                                });
                
                                if (msgCollected.size > 0) {
                                    formData.messageContent = msgCollected.first().content;
                                    embed.data.fields[2].value = formData.messageContent.substring(0, 100) + 
                                        (formData.messageContent.length > 100 ? '...' : '');
                                    await msgCollected.first().delete();
                                    
                                    // Mettre à jour le message original
                                    await messageInteraction.editReply({
                                        content: 'Message enregistré !',
                                        embeds: [],
                                        components: []
                                    });
                                }
                                break;
                
                            case 'message_embed':
                                // Configuration de base de l'embed
                                const embedBuilder = new EmbedBuilder()
                                    .setTitle('Titre par défaut')
                                    .setDescription('Description par défaut')
                                    .setColor('#0099ff');
                            
                                // Création des boutons de configuration
                                const embedRow1 = new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('modify_title')
                                        .setLabel('Modifier le titre')
                                        .setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder()
                                        .setCustomId('modify_description')
                                        .setLabel('Modifier la description')
                                        .setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder()
                                        .setCustomId('modify_color')
                                        .setLabel('Modifier la couleur')
                                        .setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder()
                                        .setCustomId('modify_author')
                                        .setLabel('Ajouter/Modifier un auteur')
                                        .setStyle(ButtonStyle.Primary)
                                );
                            
                                const embedRow2 = new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('add_field')
                                        .setLabel('Ajouter un field')
                                        .setStyle(ButtonStyle.Secondary),
                                    new ButtonBuilder()
                                        .setCustomId('toggle_timestamp')
                                        .setLabel('Ajouter/Supprimer un timestamp')
                                        .setStyle(ButtonStyle.Secondary),
                                    new ButtonBuilder()
                                        .setCustomId('modify_footer')
                                        .setLabel('Ajouter/Modifier un footer')
                                        .setStyle(ButtonStyle.Secondary)
                                );
                            
                                const embedRow3 = new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('embed_save')
                                        .setLabel('Créer')
                                        .setStyle(ButtonStyle.Success),
                                    new ButtonBuilder()
                                        .setCustomId('embed_cancel')
                                        .setLabel('Annuler')
                                        .setStyle(ButtonStyle.Danger)
                                );
                            
                                // Mettre à jour le message avec l'interface de configuration de l'embed
                                await messageInteraction.update({
                                    embeds: [embedBuilder],
                                    components: [embedRow1, embedRow2, embedRow3]
                                });
                            
                                // Créer un collecteur pour les boutons de l'embed
                                const embedFilter = int => int.user.id === i.user.id;
                                
                                while (true) {
                                    try {
                                        const embedInteraction = await messageInteraction.channel.awaitMessageComponent({
                                            filter: embedFilter,
                                            time: 300000
                                        });
                            
                                        switch (embedInteraction.customId) {
                                            case 'modify_title':
                                                await embedInteraction.reply({ 
                                                    content: 'Entrez le nouveau titre pour l\'embed:',
                                                    ephemeral: true 
                                                });
                                                const titleCollected = await embedInteraction.channel.awaitMessages({
                                                    filter: m => m.author.id === i.user.id,
                                                    max: 1,
                                                    time: 30000
                                                });
                                                if (titleCollected.size > 0) {
                                                    embedBuilder.setTitle(titleCollected.first().content);
                                                    await titleCollected.first().delete();
                                                    await embedInteraction.editReply({ content: 'Le titre de l\'embed a été modifié.' });
                                                }
                                                break;
                            
                                            case 'modify_description':
                                                await embedInteraction.reply({ 
                                                    content: 'Entrez la nouvelle description pour l\'embed:',
                                                    ephemeral: true 
                                                });
                                                const descCollected = await embedInteraction.channel.awaitMessages({
                                                    filter: m => m.author.id === i.user.id,
                                                    max: 1,
                                                    time: 30000
                                                });
                                                if (descCollected.size > 0) {
                                                    embedBuilder.setDescription(descCollected.first().content);
                                                    await descCollected.first().delete();
                                                    await embedInteraction.editReply({ content: 'La description de l\'embed a été modifiée.' });
                                                }
                                                break;
                            
                                            case 'modify_color':
                                                await embedInteraction.reply({ 
                                                    content: 'Entrez un code couleur en hexadécimal (par exemple : #FF5733):',
                                                    ephemeral: true 
                                                });
                                                const colorCollected = await embedInteraction.channel.awaitMessages({
                                                    filter: m => m.author.id === i.user.id,
                                                    max: 1,
                                                    time: 30000
                                                });
                                                if (colorCollected.size > 0) {
                                                    const newColor = colorCollected.first().content;
                                                    if (/^#[0-9A-F]{6}$/i.test(newColor)) {
                                                        embedBuilder.setColor(newColor);
                                                        await embedInteraction.editReply({ content: 'La couleur de l\'embed a été modifiée.' });
                                                    } else {
                                                        await embedInteraction.editReply({ content: 'Le code couleur est invalide.' });
                                                    }
                                                    await colorCollected.first().delete();
                                                }
                                                break;
                            
                                            case 'modify_author':
                                                await embedInteraction.reply({ content: 'Entrez le nom de l\'auteur:', ephemeral: true });
                                                const authorNameCollected = await embedInteraction.channel.awaitMessages({
                                                    filter: m => m.author.id === i.user.id,
                                                    max: 1,
                                                    time: 30000
                                                });
                            
                                                if (authorNameCollected.size > 0) {
                                                    const authorName = authorNameCollected.first().content;
                                                    await authorNameCollected.first().delete();
                            
                                                    await embedInteraction.followUp({ 
                                                        content: 'Veuillez entrer l\'URL de l\'image de l\'auteur (ou ignorez pour ne pas mettre d\'image)',
                                                        ephemeral: true 
                                                    });
                            
                                                    const authorImageCollected = await embedInteraction.channel.awaitMessages({
                                                        filter: m => m.author.id === i.user.id,
                                                        max: 1,
                                                        time: 30000
                                                    });
                            
                                                    if (authorImageCollected.size > 0) {
                                                        const imageResponse = authorImageCollected.first();
                                                        let authorIconURL = null;
                            
                                                        if (imageResponse.attachments.size > 0) {
                                                            const attachment = imageResponse.attachments.first();
                                                            if (attachment.contentType?.startsWith('image/')) {
                                                                authorIconURL = attachment.url;
                                                            }
                                                        } else {
                                                            const potentialURL = imageResponse.content;
                                                            if (/^https?:\/\/.*\.(jpg|jpeg|png|gif|webp)$/i.test(potentialURL)) {
                                                                authorIconURL = potentialURL;
                                                            }
                                                        }
                            
                                                        if (authorIconURL) {
                                                            embedBuilder.setAuthor({ name: authorName, iconURL: authorIconURL });
                                                            await embedInteraction.followUp({ content: 'L\'auteur a été ajouté avec l\'image.', ephemeral: true });
                                                        } else {
                                                            embedBuilder.setAuthor({ name: authorName });
                                                            await embedInteraction.followUp({ content: 'L\'auteur a été ajouté sans image.', ephemeral: true });
                                                        }
                            
                                                        await authorImageCollected.first().delete();
                                                    } else {
                                                        embedBuilder.setAuthor({ name: authorName });
                                                        await embedInteraction.followUp({ content: 'L\'auteur a été ajouté sans image.', ephemeral: true });
                                                    }
                                                }
                                                break;
                            
                                            case 'add_field':
                                                await embedInteraction.reply({ content: 'Entrez le titre du field:', ephemeral: true });
                                                const fieldTitleCollected = await embedInteraction.channel.awaitMessages({
                                                    filter: m => m.author.id === i.user.id,
                                                    max: 1,
                                                    time: 30000
                                                });
                            
                                                if (fieldTitleCollected.size > 0) {
                                                    const fieldTitle = fieldTitleCollected.first().content;
                                                    await fieldTitleCollected.first().delete();
                            
                                                    await embedInteraction.followUp({ content: 'Entrez la description du field:', ephemeral: true });
                                                    const fieldDescCollected = await embedInteraction.channel.awaitMessages({
                                                        filter: m => m.author.id === i.user.id,
                                                        max: 1,
                                                        time: 30000
                                                    });
                            
                                                    if (fieldDescCollected.size > 0) {
                                                        const fieldValue = fieldDescCollected.first().content;
                                                        await fieldDescCollected.first().delete();
                            
                                                        await embedInteraction.followUp({ 
                                                            content: 'Le field doit-il être en ligne ? (oui/non)', 
                                                            ephemeral: true 
                                                        });
                            
                                                        const inlineCollected = await embedInteraction.channel.awaitMessages({
                                                            filter: m => m.author.id === i.user.id && ['oui', 'non'].includes(m.content.toLowerCase()),
                                                            max: 1,
                                                            time: 30000
                                                        });
                            
                                                        const isInline = inlineCollected.size > 0 ? inlineCollected.first().content.toLowerCase() === 'oui' : true;
                                                        if (inlineCollected.size > 0) await inlineCollected.first().delete();
                            
                                                        embedBuilder.addFields({ name: fieldTitle, value: fieldValue, inline: isInline });
                                                        await embedInteraction.followUp({ 
                                                            content: `Le field a été ajouté ${isInline ? 'en ligne' : 'non aligné'}.`,
                                                            ephemeral: true 
                                                        });
                                                    }
                                                }
                                                break;
                            
                                            case 'toggle_timestamp':
                                                if (embedBuilder.data.timestamp) {
                                                    embedBuilder.setTimestamp(null);
                                                } else {
                                                    embedBuilder.setTimestamp();
                                                }
                                                await embedInteraction.reply({ 
                                                    content: embedBuilder.data.timestamp ? 'Timestamp ajouté.' : 'Timestamp retiré.',
                                                    ephemeral: true 
                                                });
                                                break;
                            
                                            case 'modify_footer':
                                                await embedInteraction.reply({ content: 'Entrez le texte du footer:', ephemeral: true });
                                                const footerCollected = await embedInteraction.channel.awaitMessages({
                                                    filter: m => m.author.id === i.user.id,
                                                    max: 1,
                                                    time: 30000
                                                });
                            
                                                if (footerCollected.size > 0) {
                                                    embedBuilder.setFooter({ text: footerCollected.first().content });
                                                    await footerCollected.first().delete();
                                                    await embedInteraction.editReply({ content: 'Le footer a été modifié.' });
                                                }
                                                break;
                            
                                            case 'embed_save':
                                                formData.messageContent = `embed:${JSON.stringify(embedBuilder.toJSON())}`;
                                                embed.data.fields[2].value = 'Message: Embed personnalisé';
                                                await embedInteraction.update({ content: 'Embed sauvegardé!', components: [] });
                                                return;
                            
                                            case 'embed_cancel':
                                                await embedInteraction.update({ content: 'Configuration annulée', components: [] });
                                                return;
                                        }
                            
                                        // Mise à jour de l'embed après chaque modification
                                        await messageInteraction.editReply({
                                            embeds: [embedBuilder],
                                            components: [embedRow1, embedRow2, embedRow3]
                                        });
                            
                                    } catch (error) {
                                        console.error('Erreur dans le collecteur d\'embed:', error);
                                        break;
                                    }
                                }
                                break;
                
                            case 'message_cancel':
                                await messageInteraction.update({
                                    content: 'Configuration annulée',
                                    embeds: [],
                                    components: []
                                });
                                break;
                        }
                    } catch (error) {
                        console.error('Erreur dans le collecteur de message:', error);
                        await i.editReply({
                            content: 'La configuration a expiré ou une erreur est survenue.',
                            embeds: [],
                            components: []
                        }).catch(console.error);
                    }
                }

                async function handleFormLogs(i, embed, formData) {
                    await i.reply({ 
                        content: 'Veuillez mentionner le salon de logs:', 
                        ephemeral: true 
                    });
                    const filter = m => m.author.id === i.user.id && m.mentions.channels.size > 0;
                    const collected = await i.channel.awaitMessages({ filter, max: 1, time: 30000 });
                    
                    if (collected.size > 0) {
                        const logsChannel = collected.first().mentions.channels.first();
                        formData.logsChannel = logsChannel.id;
                        
                        await i.followUp({ 
                            content: 'Comment souhaitez-vous gérer les logs?\n1️⃣ Nouvel embed pour chaque réponse\n2️⃣ Mise à jour d\'un embed existant', 
                            ephemeral: true 
                        });
                        
                        const typeFilter = m => m.author.id === i.user.id && ['1', '2'].includes(m.content);
                        const typeCollected = await i.channel.awaitMessages({ filter: typeFilter, max: 1, time: 30000 });
                        
                        if (typeCollected.size > 0) {
                            const type = typeCollected.first().content;
                            formData.logsType = type === '1' ? 'embed' : 'update';
                            
                            if (type === '2') {
                                // Création de l'embed initial pour les logs
                                const logsEmbed = new EmbedBuilder()
                                    .setTitle('Réponses au formulaire')
                                    .setDescription('En attente de réponses...')
                                    .setColor('#0099ff')
                                    .setTimestamp();
                                
                                const msg = await logsChannel.send({ embeds: [logsEmbed] });
                                formData.logsMessage = msg.id;
                                
                                await i.followUp({ 
                                    content: `Embed de logs créé! Il sera mis à jour automatiquement avec les réponses.`, 
                                    ephemeral: true 
                                });
                            }
                            
                            embed.data.fields[3].value = `<#${logsChannel.id}> (${formData.logsType === 'embed' ? 'Nouvel embed' : 'Mise à jour embed'})`;
                            await typeCollected.first().delete();
                        }
                        await collected.first().delete();
                    }
                }

                async function handleButtonText(i, embed, formData) {
                    await i.reply({ content: 'Veuillez entrer le texte du bouton:', ephemeral: true });
                    const filter = m => m.author.id === i.user.id;
                    const collected = await i.channel.awaitMessages({ filter, max: 1, time: 30000 });
                    
                    if (collected.size > 0) {
                        formData.buttonText = collected.first().content;
                        embed.data.fields[4].value = collected.first().content;
                        await i.followUp({ content: 'Texte du bouton mis à jour!', ephemeral: true });
                        await collected.first().delete();
                    }
                }

                async function handleButtonEmoji(i, embed, formData) {
                    await i.reply({ content: 'Veuillez envoyer l\'emoji pour le bouton:', ephemeral: true });
                    const filter = m => m.author.id === i.user.id;
                    const collected = await i.channel.awaitMessages({ filter, max: 1, time: 30000 });
                    
                    if (collected.size > 0) {
                        formData.buttonEmoji = collected.first().content;
                        embed.data.fields[5].value = collected.first().content;
                        await i.followUp({ content: 'Emoji du bouton mis à jour!', ephemeral: true });
                        await collected.first().delete();
                    }
                }

                async function handleButtonColor(i, embed, formData) {
                    const colors = {
                        '1': { name: 'Bleu', style: ButtonStyle.Primary }, 
                        '2': { name: 'Vert', style: ButtonStyle.Success }, 
                        '3': { name: 'Rouge', style: ButtonStyle.Danger }, 
                        '4': { name: 'Gris', style: ButtonStyle.Secondary } 
                    };
                    
                    await i.reply({ 
                        content: 'Choisissez la couleur du bouton:\n1️⃣ Bleu\n2️⃣ Vert\n3️⃣ Rouge\n4️⃣ Gris', 
                        ephemeral: true 
                    });
                    
                    const filter = m => m.author.id === i.user.id && ['1', '2', '3', '4'].includes(m.content);
                    const collected = await i.channel.awaitMessages({ filter, max: 1, time: 30000 });
                    
                    if (collected.size > 0) {
                        const choice = collected.first().content;
                        formData.buttonColor = colors[choice].style;
                        embed.data.fields[6].value = colors[choice].name;
                        await i.followUp({ content: `Couleur du bouton mise à jour: ${colors[choice].name}!`, ephemeral: true });
                        await collected.first().delete();
                    }
                }

                async function handleOptionInput(interaction, optionData, optionEmbed, rows, response) {
                    try {
                        const messageContent = getPromptForOption(interaction.customId);
                        
                        // Mettre à jour le message d'origine avec la question
                        await interaction.update({ 
                            content: messageContent,
                            embeds: [optionEmbed],
                            components: rows
                        });
                
                        const collected = await interaction.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000
                        });
                
                        if (collected.size > 0) {
                            const message = collected.first();
                            
                            // Mettre à jour les données et l'embed
                            updateOptionData(interaction.customId, message.content, optionData, optionEmbed);
                            
                            // Supprimer le message de l'utilisateur
                            await message.delete().catch(err => console.warn('Impossible de supprimer le message:', err));
                            
                            // Mettre à jour immédiatement l'embed avec les nouvelles données
                            await interaction.editReply({
                                content: null,
                                embeds: [optionEmbed],
                                components: rows
                            }).catch(async error => {
                                if (error.code === 10008) {
                                    // Si l'interaction originale n'est plus valide, mettre à jour le message de réponse
                                    await response.edit({
                                        content: null,
                                        embeds: [optionEmbed],
                                        components: rows
                                    }).catch(console.error);
                                }
                            });
                        }
                    } catch (error) {
                        console.error('Erreur dans handleOptionInput:', error);
                        try {
                            await response.edit({
                                content: 'Une erreur est survenue. Veuillez réessayer.',
                                embeds: [optionEmbed],
                                components: rows
                            });
                        } catch {
                            await interaction.followUp({
                                content: 'Une erreur est survenue. Veuillez réessayer.',
                                ephemeral: true
                            });
                        }
                    }
                }
                
                // Fonctions helpers
                function getPromptForOption(customId) {
                    const prompts = {
                        'option_title': 'Veuillez entrer le titre de l\'option:',
                        'option_style': 'Choisissez le style:\n1️⃣ Court\n2️⃣ Long',
                        'option_minlength': 'Veuillez entrer la longueur minimum:',
                        'option_maxlength': 'Veuillez entrer la longueur maximum:',
                        'option_placeholder': 'Veuillez entrer le placeholder:'
                    };
                    return prompts[customId];
                }
                
                function updateOptionData(customId, value, optionData, optionEmbed) {
                    switch (customId) {
                        case 'option_title':
                            optionData.title = value;
                            optionEmbed.data.fields[0].value = value;
                            break;
                
                        case 'option_style':
                            const style = value === '1' ? 'court' : 'long';
                            optionData.style = style;
                            optionData.maxLength = style === 'court' ? 500 : 4000;
                            optionEmbed.data.fields[1].value = style;
                            optionEmbed.data.fields[3].value = optionData.maxLength.toString();
                            break;
                
                        case 'option_minlength':
                            const minLength = parseInt(value);
                            if (!isNaN(minLength)) {
                                optionData.minLength = minLength;
                                optionEmbed.data.fields[2].value = value;
                            }
                            break;
                
                        case 'option_maxlength':
                            const maxLength = parseInt(value);
                            const maxLimit = optionData.style === 'court' ? 500 : 4000;
                            if (!isNaN(maxLength) && maxLength <= maxLimit) {
                                optionData.maxLength = maxLength;
                                optionEmbed.data.fields[3].value = value;
                            }
                            break;
                
                        case 'option_required':
                            optionData.required = !optionData.required;
                            optionEmbed.data.fields[4].value = optionData.required ? '✅' : '❌';
                            break;
                
                        case 'option_placeholder':
                            optionData.placeholder = value;
                            optionEmbed.data.fields[5].value = value;
                            break;
                
                        default:
                            console.warn(`Option non gérée: ${customId}`);
                            break;
                    }
                
                    // S'assurer que les valeurs par défaut sont correctes
                    if (optionData.style === 'court' && optionData.maxLength > 500) {
                        optionData.maxLength = 500;
                        optionEmbed.data.fields[3].value = '500';
                    }
                    if (optionData.style === 'long' && optionData.maxLength > 4000) {
                        optionData.maxLength = 4000;
                        optionEmbed.data.fields[3].value = '4000';
                    }
                    if (optionData.minLength > optionData.maxLength) {
                        optionData.minLength = optionData.maxLength;
                        optionEmbed.data.fields[2].value = optionData.maxLength.toString();
                    }
                }

                async function handleAddOption(i, embed, formData) {
                    const optionData = {
                        title: '',
                        style: '',
                        minLength: 0,
                        maxLength: 0,
                        required: false,
                        placeholder: ''
                    };
                
                    // Création de l'embed de configuration d'option
                    const optionEmbed = new EmbedBuilder()
                        .setTitle('Configuration de l\'option')
                        .setColor('#0099ff')
                        .addFields(
                            { name: 'Titre', value: 'À configurer', inline: true },
                            { name: 'Style', value: 'À configurer', inline: true },
                            { name: 'Longueur minimum', value: 'À configurer', inline: true },
                            { name: 'Longueur maximum', value: 'À configurer', inline: true },
                            { name: 'Requis', value: '❌', inline: true },
                            { name: 'Placeholder', value: 'À configurer', inline: true }
                        );
                
                    const rows = [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('option_title')
                                .setLabel('Titre')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('option_style')
                                .setLabel('Style')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('option_minlength')
                                .setLabel('Longueur min')
                                .setStyle(ButtonStyle.Primary)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('option_maxlength')
                                .setLabel('Longueur max')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('option_required')
                                .setLabel('Requis')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('option_placeholder')
                                .setLabel('Placeholder')
                                .setStyle(ButtonStyle.Primary)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('option_save')
                                .setLabel('Sauvegarder')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId('option_cancel')
                                .setLabel('Annuler')
                                .setStyle(ButtonStyle.Danger)
                        )
                    ];
                
                    // Créer un message éphémère pour la configuration
                    const response = await i.reply({
                        embeds: [optionEmbed],
                        components: rows,
                        ephemeral: true,
                        fetchReply: true
                    });
                
                    const filter = int => int.user.id === i.user.id;
                    const collector = response.createMessageComponentCollector({ 
                        filter, 
                        time: 300000 
                    });
                
                    collector.on('collect', async (interaction) => {
                        try {
                            switch (interaction.customId) {
                                case 'option_title':
                                case 'option_style':
                                case 'option_minlength':
                                case 'option_maxlength':
                                case 'option_placeholder':
                                    // Pour ces cas, utiliser une fonction commune
                                    await handleOptionInput(interaction, optionData, optionEmbed, rows, response);
                                    break;
                                
                                case 'option_required':
                                    optionData.required = !optionData.required;
                                    optionEmbed.data.fields[4].value = optionData.required ? '✅' : '❌';
                                    
                                    // Mettre à jour directement l'embed sans créer de nouvelle réponse
                                    await response.edit({
                                        embeds: [optionEmbed],
                                        components: rows
                                    });
                                    break;

                                case 'option_save':
                                    if (!optionData.title || !optionData.style) {
                                        await interaction.reply({
                                            content: 'Veuillez configurer au moins le titre et le style de l\'option.',
                                            ephemeral: true
                                        });
                                        return;
                                    }
                
                                    formData.options.push(optionData);
                                    embed.data.fields[7].value = formData.options.map(opt => opt.title).join('\n') || 'Aucune';
                
                                    // Mettre à jour le menu déroulant avec les nouvelles options
                                    const updatedOptionsMenu = new StringSelectMenuBuilder()
                                        .setCustomId('form_options')
                                        .setPlaceholder('Options du formulaire')
                                        .addOptions([
                                            {
                                                label: 'Ajouter une option',
                                                description: 'Ajouter une nouvelle option au formulaire',
                                                value: 'add_option'
                                            },
                                            ...formData.options.map((opt, index) => ({
                                                label: opt.title,
                                                description: `${opt.style} - ${opt.required ? 'Requis' : 'Optionnel'}`,
                                                value: `edit_option_${index}`
                                            }))
                                        ]);
                
                                    const row4 = new ActionRowBuilder().addComponents(updatedOptionsMenu);
                
                                    await i.message.edit({
                                        embeds: [embed],
                                        components: [row1, row2, row3, row4, row5]
                                    });
                
                                    await interaction.update({
                                        content: 'Option sauvegardée !',
                                        embeds: [],
                                        components: []
                                    });
                
                                    collector.stop();
                                    break;
                
                                case 'option_cancel':
                                    await interaction.update({
                                        content: 'Configuration annulée',
                                        embeds: [],
                                        components: []
                                    });
                                    collector.stop();
                                    break;

                                default:
                                    // Pour tous les autres boutons, mettre à jour l'embed après chaque action
                                    await interaction.update({
                                        embeds: [optionEmbed],
                                        components: rows
                                    });
                    
                                    // Attendre un peu pour que l'interaction soit traitée
                                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                                    // Rafraîchir l'affichage de l'embed
                                    await response.edit({
                                        embeds: [optionEmbed],
                                        components: rows
                                    });
                                    break;
                        }
                    } catch (error) {
                        console.error('Erreur lors de l\'interaction:', error);
                        await interaction.reply({
                            content: 'Une erreur est survenue. Veuillez réessayer.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                });
                }
                async function handleEditOption(i, embed, formData, optionIndex) {
                    const optionToEdit = formData.options[optionIndex];
                    const optionData = { ...optionToEdit }; // Copie de l'option existante
                
                    // Création de l'embed de configuration d'option
                    const optionEmbed = new EmbedBuilder()
                        .setTitle('Modification de l\'option')
                        .setColor('#0099ff')
                        .addFields(
                            { name: 'Titre', value: optionData.title || 'À configurer', inline: true },
                            { name: 'Style', value: optionData.style || 'À configurer', inline: true },
                            { name: 'Longueur minimum', value: optionData.minLength.toString() || 'À configurer', inline: true },
                            { name: 'Longueur maximum', value: optionData.maxLength.toString() || 'À configurer', inline: true },
                            { name: 'Requis', value: optionData.required ? '✅' : '❌', inline: true },
                            { name: 'Placeholder', value: optionData.placeholder || 'À configurer', inline: true }
                        );
                
                    // Même configuration de boutons que handleAddOption
                    const rows = [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('option_title')
                                .setLabel('Titre')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('option_style')
                                .setLabel('Style')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('option_minlength')
                                .setLabel('Longueur min')
                                .setStyle(ButtonStyle.Primary)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('option_maxlength')
                                .setLabel('Longueur max')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('option_required')
                                .setLabel('Requis')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('option_placeholder')
                                .setLabel('Placeholder')
                                .setStyle(ButtonStyle.Primary)
                        ),
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('option_save')
                                .setLabel('Sauvegarder')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId('option_cancel')
                                .setLabel('Annuler')
                                .setStyle(ButtonStyle.Danger)
                        )
                    ];
                
                    const response = await i.reply({
                        embeds: [optionEmbed],
                        components: rows,
                        ephemeral: true,
                        fetchReply: true
                    });
                
                    const filter = int => int.user.id === i.user.id;
                    const collector = response.createMessageComponentCollector({ 
                        filter, 
                        time: 300000 
                    });
                
                    collector.on('collect', async (interaction) => {
                        try {
                            switch (interaction.customId) {
                                case 'option_title':
                                case 'option_style':
                                case 'option_minlength':
                                case 'option_maxlength':
                                case 'option_placeholder':
                                    // Pour ces cas, utiliser une fonction commune
                                    await handleOptionInput(interaction, optionData, optionEmbed, rows, response);
                                    break;
                                
                                case 'option_required':
                                    optionData.required = !optionData.required;
                                    optionEmbed.data.fields[4].value = optionData.required ? '✅' : '❌';
                                    
                                    // Mettre à jour directement l'embed sans créer de nouvelle réponse
                                    await response.edit({
                                        embeds: [optionEmbed],
                                        components: rows
                                    });
                                    break;

                                case 'option_save':
                                    if (!optionData.title || !optionData.style) {
                                        await interaction.reply({
                                            content: 'Veuillez configurer au moins le titre et le style de l\'option.',
                                            ephemeral: true
                                        });
                                        return;
                                    }
                    
                                    // Mettre à jour l'option existante au lieu d'en ajouter une nouvelle
                                    formData.options[optionIndex] = optionData;
                                    embed.data.fields[7].value = formData.options.map(opt => opt.title).join('\n') || 'Aucune';
                    
                                    try {
                                        // Mettre à jour le menu déroulant
                                        const updatedOptionsMenu = new StringSelectMenuBuilder()
                                            .setCustomId('form_options')
                                            .setPlaceholder('Options du formulaire')
                                            .addOptions([
                                                {
                                                    label: 'Ajouter une option',
                                                    description: 'Ajouter une nouvelle option au formulaire',
                                                    value: 'add_option'
                                                },
                                                ...formData.options.map((opt, index) => ({
                                                    label: opt.title,
                                                    description: `${opt.style} - ${opt.required ? 'Requis' : 'Optionnel'}`,
                                                    value: `edit_option_${index}`
                                                }))
                                            ]);
                    
                                        const row4 = new ActionRowBuilder().addComponents(updatedOptionsMenu);
                    
                                        await i.message.edit({
                                            embeds: [embed],
                                            components: [row1, row2, row3, row4, row5]
                                        });
                    
                                        await interaction.update({
                                            content: 'Option modifiée !',
                                            embeds: [],
                                            components: []
                                        });
                    
                                        collector.stop();
                                    } catch (error) {
                                        console.error('Erreur lors de la mise à jour du message:', error);
                                        await interaction.reply({
                                            content: 'Une erreur est survenue lors de la mise à jour. Veuillez réessayer.',
                                            ephemeral: true
                                        });
                                    }
                                    break;
                    
                                case 'option_cancel':
                                    try {
                                        await interaction.update({
                                            content: 'Configuration annulée',
                                            embeds: [],
                                            components: []
                                        });
                                        collector.stop();
                                    } catch (error) {
                                        console.error('Erreur lors de l\'annulation:', error);
                                    }
                                    break;
                    
                                default:
                                    try {
                                        await interaction.update({
                                            embeds: [optionEmbed],
                                            components: rows
                                        });
                                    } catch (error) {
                                        console.error('Erreur lors de la mise à jour de l\'embed:', error);
                                    }
                                    break;
                        }
                    } catch (error) {
                        console.error('Erreur dans le collector:', error);
                        try {
                            await interaction.reply({
                                content: 'Une erreur est survenue. Veuillez réessayer.',
                                ephemeral: true
                            }).catch(console.error);
                        } catch (err) {
                            console.error('Erreur lors de la réponse d\'erreur:', err);
                        }
                    }
                });
                
                collector.on('end', () => {
                    try {
                        i.message.edit({
                            embeds: [embed],
                            components: [row1, row2, row3, row4, row5]
                        }).catch(console.error);
                    } catch (error) {
                        console.error('Erreur lors de la fin du collector:', error);
                    }
                });
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }
    }
};

async function updateFormLogs(interaction, form, responses) {
    try {
        const logsChannel = await interaction.guild.channels.fetch(form.logsChannel);
        
        if (form.logsType === 'update' && form.logsMessage) {
            // Mettre à jour l'embed existant
            const message = await logsChannel.messages.fetch(form.logsMessage);
            const existingEmbed = message.embeds[0];
            
            let currentDescription = existingEmbed.data.description;
            if (currentDescription === 'En attente de réponses...') {
                currentDescription = '';
            }

            // Calculer le numéro de la nouvelle réponse
            const currentResponseCount = currentDescription ? currentDescription.split('\n').length + 1 : 1;

            // Formater la nouvelle réponse en une seule ligne avec un numéro et le tag de l'utilisateur
            const newResponse = `${currentResponseCount}. @${interaction.user.tag} : ${responses.join(' | ')}`;

            // Ajouter la nouvelle réponse
            const updatedDescription = currentDescription 
                ? `${currentDescription}\n${newResponse}`
                : newResponse;

            const updatedEmbed = new EmbedBuilder(existingEmbed.data)
                .setDescription(updatedDescription);
            
            await message.edit({ embeds: [updatedEmbed] });
        } else {
            // Créer un nouvel embed pour chaque réponse
            const responseEmbed = new EmbedBuilder()
                .setTitle(form.title)
                .setDescription(`1. @${interaction.user.tag} | ${responses.join(' | ')}`)
                .setColor('#00ff00')
                .setTimestamp();

            await logsChannel.send({ embeds: [responseEmbed] });
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour des logs:', error);
    }
}