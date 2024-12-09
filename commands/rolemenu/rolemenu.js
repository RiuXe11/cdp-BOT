const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ComponentType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

class RoleMenuBuilder {
    constructor(guild) {
        this.guild = guild;
        this.settings = {
            isMultiple: false,
            channel: null,
            messageType: null,
            messageContent: null,
            messageId: null,
            style: 'Bouton',
            type: 'Donner/Retirer',
            requiredRoles: [],
            forbiddenRoles: [],
            options: []
        };
        this.menuMessage = null;
        this.isCreatingOption = false;
        this.currentOption = null;
    }

    static async ensureDataDirectory() {
        try {
            // Obtenir le chemin absolu du dossier du bot
            const rootDir = process.cwd(); // Chemin absolu du dossier du bot
            const dataPath = path.join(rootDir, 'data');
            const rolemenusPath = path.join(dataPath, 'rolemenus');

            await fs.mkdir(dataPath, { recursive: true });
            await fs.mkdir(rolemenusPath, { recursive: true });
    
            return rolemenusPath;
        } catch (error) {
            console.error('Erreur lors de la création des dossiers:', error);
            throw error;
        }
    }

    async save() {
        try {
            // Obtenir le chemin du dossier rolemenus
            const rolemenusPath = await RoleMenuBuilder.ensureDataDirectory();
            
            const saveData = {
                id: this.id,
                settings: this.settings
            };
    
            const saveFilePath = path.join(rolemenusPath, `${this.id}.json`);

            
            await fs.writeFile(saveFilePath, JSON.stringify(saveData, null, 2));
        } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            throw new Error(`Erreur lors de la sauvegarde: ${error.message}`);
        }
    }

    static async load(id) {
        try {
            const rolemenusPath = await this.ensureDataDirectory();
            const loadPath = path.join(rolemenusPath, `${id}.json`);

            const data = await fs.readFile(loadPath, 'utf8');
            const parsed = JSON.parse(data);
    
            const menu = new RoleMenuBuilder();
            menu.id = parsed.id;
            menu.settings = parsed.settings;
    
            return menu;
        } catch (error) {
            console.error('Erreur lors du chargement:', error);
            return null;
        }
    }

    static async getNextId() {
        try {
            const savePath = path.join(__dirname, '..', 'data', 'rolemenus');
            await fs.mkdir(savePath, { recursive: true });

            const files = await fs.readdir(savePath);
            const ids = files
                .filter(f => f.endsWith('.json'))
                .map(f => parseInt(f.slice(0, -5)))
                .filter(n => !isNaN(n));

            return ids.length > 0 ? Math.max(...ids) + 1 : 1;
        } catch (error) {
            return 1;
        }
    }

    createMainEmbed() {
        const serverColor = colorManager.getColor(this.guild.id); // Utilise this.guild au lieu de message.guild
        const embed = new EmbedBuilder()
            .setTitle('⚙️ | Configuration du RoleMenu')
            .setDescription('Configurez le menu de rôles')
            .addFields(
                { name: '🔢 | Multiple', value: this.settings.isMultiple ? '✅' : '❌', inline: true },
                { name: '⚙️ | Salon', value: this.settings.channel ? `<#${this.settings.channel}>` : 'Non défini', inline: true },
                { name: '📝 | Message', value: this.settings.messageType || 'Non défini', inline: true },
                { name: '✨ | Style', value: this.settings.style, inline: true },
                { name: '💭 | Type', value: this.settings.type, inline: true },
                { name: '✅ | Rôles Requis', value: this.settings.requiredRoles.length > 0 ? 
                    this.settings.requiredRoles.map(r => `<@&${r}>`).join('\n') : 'Aucun', inline: true },
                { name: '⛔ | Rôles Interdits', value: this.settings.forbiddenRoles.length > 0 ? 
                    this.settings.forbiddenRoles.map(r => `<@&${r}>`).join('\n') : 'Aucun', inline: true }
            )
            .setColor(serverColor);
            
    
        // Ajoute le champ des options si il y en a
        if (this.settings.options.length > 0) {
            const sortedOptions = [...this.settings.options].sort((a, b) => a.position - b.position);
            const optionsText = sortedOptions.map(opt => 
                `${opt.position}. ${opt.emoji} <@&${opt.roleId}>${opt.text ? ` (${opt.text})` : ''}`
            ).join('\n');
            
            embed.addFields({ 
                name: `Options (${this.settings.options.length})`, 
                value: optionsText || 'Aucune option configurée',
                inline: false 
            });
        }
    
        return embed;
    }

    createOptionEmbed() {
        const serverColor = colorManager.getColor(this.guild.id); // Utilise this.guild au lieu de message.guild
        return new EmbedBuilder()
            .setTitle('⚙️ | Configuration d\'une option')
            .setDescription('Configurez les paramètres de cette option')
            .addFields(
                { name: '🔢 | Position', value: this.currentOption.position.toString(), inline: true },
                { name: '👥 | Rôle', value: this.currentOption.roleId ? `<@&${this.currentOption.roleId}>` : 'Non défini', inline: true },
                { name: '✨ | Emoji', value: this.currentOption.emoji || 'Non défini', inline: true },
                { name: '📋 | Texte', value: this.currentOption.text || 'Non défini', inline: true },
                { name: '📝 | Description', value: this.currentOption.description || 'Non défini', inline: true },
                { name: '🔴 | Couleur', value: this.currentOption.color, inline: true }
            )
            .setColor(serverColor);
    }

    createMainButtons() {
        const menu1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('multiple')
                    .setLabel('Multiple')
                    .setStyle(this.settings.isMultiple ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('channel')
                    .setLabel('Salon')
                    .setStyle(this.settings.channel ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('message')
                    .setLabel('Message')
                    .setStyle(this.settings.messageType ? ButtonStyle.Success : ButtonStyle.Primary)
            );
    
        const menu2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('style')
                    .setLabel(`Style: ${this.settings.style}`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('type')
                    .setLabel(`Type: ${this.settings.type}`)
                    .setStyle(ButtonStyle.Secondary)
            );
    
        const menu3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('requiredRoles')
                    .setLabel('Rôles Requis')
                    .setStyle(this.settings.requiredRoles.length > 0 ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('forbiddenRoles')
                    .setLabel('Rôles Interdits')
                    .setStyle(this.settings.forbiddenRoles.length > 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
            );
    
        const menu4 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('options_menu')
                    .setPlaceholder('Gérer les options')
                    .addOptions([
                        {
                            label: 'Créer une option',
                            description: 'Ajouter une nouvelle option au menu',
                            value: 'create_option'
                        },
                        {
                            label: 'Supprimer une option',
                            description: 'Supprimer une option existante',
                            value: 'delete_option',
                            disabled: this.settings.options.length === 0
                        },
                        {
                            label: 'Supprimer le menu',
                            description: 'Supprimer complètement ce rolemenu',
                            value: 'delete_menu'
                        }
                    ])
            );
    
        const menu5 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('send')
                    .setLabel('Envoyer')
                    .setStyle(ButtonStyle.Success)
            );
    
        return [menu1, menu2, menu3, menu4, menu5];
    }

    createOptionButtons() {
        const menu1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('option_position')
                    .setLabel('Position')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('option_role')
                    .setLabel('Rôle')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('option_emoji')
                    .setLabel('Emoji')
                    .setStyle(ButtonStyle.Primary)
            );

        const menu2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('option_text')
                    .setLabel('Texte')
                    .setStyle(this.settings.style !== 'Réaction' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(this.settings.style === 'Réaction'),
                new ButtonBuilder()
                    .setCustomId('option_description')
                    .setLabel('Description')
                    .setStyle(this.settings.style === 'Sélecteur' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(this.settings.style !== 'Sélecteur'),
                new ButtonBuilder()
                    .setCustomId('option_color')
                    .setLabel('Couleur')
                    .setStyle(this.settings.style === 'Bouton' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setDisabled(this.settings.style !== 'Bouton')
            );

        const menu3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('option_save')
                    .setLabel('Sauvegarder')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('option_cancel')
                    .setLabel('Annuler')
                    .setStyle(ButtonStyle.Danger)
            );

        return [menu1, menu2, menu3];
    }

    static async deleteMenu(id) {
        try {
            const filePath = path.join(__dirname, '..', 'data', 'rolemenus', `${id}.json`);
            await fs.unlink(filePath);
            return true;
        } catch (error) {
            return false;
        }
    }

    async isReadyToSend() {
        const missingParams = [];
        
        if (!this.settings.channel) missingParams.push("Salon");
        if (!this.settings.targetRole) missingParams.push("Rôle à donner");
        if (!this.settings.messageType) missingParams.push("Type de message");
        if (this.settings.messageType === 'custom' && !this.settings.messageContent) {
            missingParams.push("Message personnalisé");
        }
        if (this.settings.messageType === 'id' && !this.settings.messageId) {
            missingParams.push("ID du message");
        }

        return missingParams;
    }

    createRoleMenuComponents() {
        switch (this.settings.style) {
            case 'Bouton':
                const buttonRows = [];
                const sortedOptions = [...this.settings.options].sort((a, b) => a.position - b.position);
                let currentRow = [];
                
                for (const option of sortedOptions) {
                    const button = new ButtonBuilder()
                        .setCustomId(`role_${option.roleId}`)
                        .setLabel(option.text || 'Toggle rôle')
                        .setStyle(this.getButtonStyle(option.color));

                    if (option.emoji) {
                        button.setEmoji(option.emoji);
                    }

                    currentRow.push(button);

                    if (currentRow.length === 5) {
                        buttonRows.push(new ActionRowBuilder().addComponents(currentRow));
                        currentRow = [];
                    }
                }

                if (currentRow.length > 0) {
                    buttonRows.push(new ActionRowBuilder().addComponents(currentRow));
                }

                return buttonRows;

            case 'Sélecteur':
                return [
                    new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('role_select')
                                .setPlaceholder('Sélectionnez une option')
                                .addOptions(
                                    this.settings.options
                                        .sort((a, b) => a.position - b.position)
                                        .map(option => ({
                                            label: option.text || 'Toggle rôle',
                                            value: `role_${option.roleId}`,
                                            description: option.description,
                                            emoji: option.emoji
                                        }))
                                )
                        )
                ];

            case 'Réaction':
                // Pour les réactions, on retourne un tableau vide car elles seront ajoutées après
                return [];
        }
    }

    getButtonStyle(color) {
        switch (color.toLowerCase()) {
            case 'bleu': return ButtonStyle.Primary;
            case 'vert': return ButtonStyle.Success;
            case 'gris': return ButtonStyle.Secondary;
            case 'rouge': return ButtonStyle.Danger;
            default: return ButtonStyle.Primary;
        }
    }

    async updateMenu() {
        if (this.menuMessage) {
            if (this.isCreatingOption) {
                await this.menuMessage.edit({
                    embeds: [this.createOptionEmbed()],
                    components: this.createOptionButtons()
                });
            } else {
                await this.menuMessage.edit({
                    embeds: [this.createMainEmbed()],
                    components: this.createMainButtons()
                });
            }
        }
    }

    async sendRoleMenu(message) {
        if (this.settings.options.length === 0) {
            throw new Error('Vous devez créer au moins une option.');
        }

        if (!this.settings.channel) {
            throw new Error('Vous devez sélectionner un salon.');
        }

        const targetChannel = message.guild.channels.cache.get(this.settings.channel);
        if (!targetChannel) {
            throw new Error('Le salon cible n\'a pas été trouvé.');
        }

        const components = this.createRoleMenuComponents();
        let sentMessage;

        if (this.settings.messageType === 'custom') {
            sentMessage = await targetChannel.send({
                content: this.settings.messageContent || '\u200b',
                components: components
            });
        } else if (this.settings.messageType === 'id') {
            try {
                const targetMessage = await targetChannel.messages.fetch(this.settings.messageId);
                sentMessage = await targetMessage.edit({
                    components: components
                });
            } catch (error) {
                throw new Error('Le message cible n\'a pas été trouvé.');
            }
        }

        // Ajoute les réactions si nécessaire
        if (this.settings.style === 'Réaction' && sentMessage) {
            for (const option of this.settings.options.sort((a, b) => a.position - b.position)) {
                if (option.emoji) {
                    try {
                        await sentMessage.react(option.emoji);
                    } catch (error) {
                        console.error(`Erreur lors de l'ajout de la réaction ${option.emoji}:`, error);
                    }
                }
            }
        }

        await this.save();
    }

    async handleOptionCreation(message, interaction) {
        switch (interaction.customId) {
            case 'option_position':
                const posMsg = await message.channel.send('Entrez la position de l\'option (nombre)');
                try {
                    const posResponse = await message.channel.awaitMessages({
                        filter: m => m.author.id === message.author.id && !isNaN(m.content),
                        max: 1,
                        time: 30000,
                        errors: ['time']
                    });
                    this.currentOption.position = parseInt(posResponse.first().content);
                    await posMsg.delete().catch(() => {});
                    await posResponse.first().delete().catch(() => {});
                    await this.updateMenu(); // Ajouté pour mettre à jour l'embed
                } catch (error) {
                    await posMsg.delete().catch(() => {});
                }
                break;
    
            case 'option_role':
                const roleMsg = await message.channel.send('Mentionnez le rôle pour cette option');
                try {
                    const roleResponse = await message.channel.awaitMessages({
                        filter: m => m.author.id === message.author.id && m.mentions.roles.size > 0,
                        max: 1,
                        time: 30000,
                        errors: ['time']
                    });
                    this.currentOption.roleId = roleResponse.first().mentions.roles.first().id;
                    await roleMsg.delete().catch(() => {});
                    await roleResponse.first().delete().catch(() => {});
                    await this.updateMenu(); // Ajouté pour mettre à jour l'embed
                } catch (error) {
                    await roleMsg.delete().catch(() => {});
                }
                break;
            
            case 'option_emoji':
                const emojiMsg = await message.channel.send('Envoyez l\'emoji que vous voulez utiliser (emoji standard ou emoji personnalisé du serveur)');
                try {
                    const emojiResponse = await message.channel.awaitMessages({
                        filter: m => {
                            if (m.author.id !== message.author.id) return false;
                            
                            // Vérifie si c'est un emoji custom de Discord
                            if (m.content.match(/<a?:\w+:\d+>/)) return true;
                            
                            // Vérifie si c'est un emoji standard
                            if (m.content.match(/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/)) return true;
                            
                            return false;
                        },
                        max: 1,
                        time: 30000,
                        errors: ['time']
                    });
            
                    const emojiContent = emojiResponse.first().content;
                    console.log("Emoji reçu:", emojiContent); // Pour le débogage
            
                    // Valider et extraire l'emoji
                    let validEmoji;
                    // Pour les emojis custom de Discord
                    const customEmojiMatch = emojiContent.match(/<a?:(\w+):(\d+)>/);
                    if (customEmojiMatch) {
                        validEmoji = emojiContent; // Garde le format complet pour les emojis custom
                    } 
                    // Pour les emojis standard
                    else if (emojiContent.length === 1 || emojiContent.length === 2) {
                        validEmoji = emojiContent;
                    } else {
                        throw new Error('Format d\'emoji invalide');
                    }
            
                    this.currentOption.emoji = validEmoji;
                    await this.save();
                    await emojiMsg.delete().catch(() => {});
                    await emojiResponse.first().delete().catch(() => {});
                    
                    // Message de confirmation
                    await message.channel.send(`Emoji ${validEmoji} ajouté avec succès !`).then(msg => {
                        setTimeout(() => msg.delete().catch(() => {}), 3000);
                    });
                    
                    await this.updateMenu();
                } catch (error) {
                    await emojiMsg.delete().catch(() => {});
                    await message.channel.send(
                        'L\'emoji n\'a pas pu être ajouté. Assurez-vous d\'envoyer un emoji valide (emoji standard ou emoji du serveur).'
                    ).then(msg => {
                        setTimeout(() => msg.delete().catch(() => {}), 5000);
                    });
                }
                break;
    
            case 'option_text':
                if (this.settings.style !== 'Réaction') {
                    const textMsg = await message.channel.send('Entrez le texte pour cette option');
                    try {
                        const textResponse = await message.channel.awaitMessages({
                            filter: m => m.author.id === message.author.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });
                        this.currentOption.text = textResponse.first().content;
                        await textMsg.delete().catch(() => {});
                        await textResponse.first().delete().catch(() => {});
                        await this.updateMenu(); // Ajouté pour mettre à jour l'embed
                    } catch (error) {
                        await textMsg.delete().catch(() => {});
                    }
                }
                break;

            case 'option_description':
                if (this.settings.style === 'Sélecteur') {
                    const descMsg = await message.channel.send('Entrez la description pour cette option');
                    try {
                        const descResponse = await message.channel.awaitMessages({
                            filter: m => m.author.id === message.author.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });
                        this.currentOption.description = descResponse.first().content;
                        await descMsg.delete().catch(() => {});
                        await descResponse.first().delete().catch(() => {});
                    } catch (error) {
                        await descMsg.delete().catch(() => {});
                    }
                }
                break;

            case 'option_color':
                if (this.settings.style === 'Bouton') {
                    const colorRow = new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('colorSelect')
                                .setPlaceholder('Choisissez une couleur')
                                .addOptions([
                                    { label: 'Bleu', value: 'Bleu' },
                                    { label: 'Vert', value: 'Vert' },
                                    { label: 'Gris', value: 'Gris' },
                                    { label: 'Rouge', value: 'Rouge' }
                                ])
                        );

                    const colorMsg = await message.channel.send({
                        content: 'Choisissez la couleur du bouton',
                        components: [colorRow]
                    });

                    try {
                        const colorInteraction = await colorMsg.awaitMessageComponent({
                            filter: i => i.user.id === message.author.id,
                            time: 30000
                        });
                        
                        this.currentOption.color = colorInteraction.values[0];
                        await colorMsg.delete().catch(() => {});
                    } catch (error) {
                        await colorMsg.delete().catch(() => {});
                    }
                }
                break;
            
            case 'option_save':
                if (this.currentOption.roleId && this.currentOption.emoji) {
                    this.settings.options.push({ ...this.currentOption });
                    await this.save();
                    this.isCreatingOption = false;
                    this.currentOption = null;
                    await message.channel.send('Option sauvegardée avec succès !').then(msg => {
                        setTimeout(() => msg.delete().catch(() => {}), 3000);
                    });
                    await this.updateMenu(); // S'assure que l'embed principal est mis à jour
                } else {
                    await message.channel.send('L\'option doit au moins avoir un rôle et un emoji !').then(msg => {
                        setTimeout(() => msg.delete().catch(() => {}), 3000);
                    });
                }
                break;
    
            case 'option_cancel':
                this.isCreatingOption = false;
                this.currentOption = null;
                await this.updateMenu(); // S'assure que l'embed principal est mis à jour
                break;
        }
    }

    async start(message) {
        this.guild = message.guild; // Stocke la guild à partir du message
        this.menuMessage = await message.channel.send({
            embeds: [this.createMainEmbed()],
            components: this.createMainButtons()
        });
    
        const collector = this.menuMessage.createMessageComponentCollector({
            time: 300000
        });
    
        collector.on('collect', async interaction => {
            if (interaction.user.id !== message.author.id) {
                await interaction.deferUpdate();
                return;
            }
    
            await interaction.deferUpdate();

            if (this.isCreatingOption) {
                await this.handleOptionCreation(message, interaction);
            } else {
                switch (interaction.customId) {
                    case 'multiple':
                        this.settings.isMultiple = !this.settings.isMultiple;
                        await this.save();
                        await this.updateMenu();
                        break;
    
                    case 'channel':
                        const channelMsg = await message.channel.send('Mentionnez le salon pour le rolemenu');
                        
                        try {
                            const channelResponse = await message.channel.awaitMessages({
                                filter: m => m.author.id === message.author.id && m.mentions.channels.size > 0,
                                max: 1,
                                time: 30000,
                                errors: ['time']
                            });
                            
                            this.settings.channel = channelResponse.first().mentions.channels.first().id;
                            await this.save();
                            await channelMsg.delete().catch(() => {});
                            await channelResponse.first().delete().catch(() => {});
                            await this.updateMenu();
                        } catch (error) {
                            await channelMsg.delete().catch(() => {});
                        }
                        break;
                    //
                    case 'message':
                        const msgTypeRow = new ActionRowBuilder()
                            .addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('messageTypeSelect')
                                    .setPlaceholder('Sélectionnez le type de message')
                                    .addOptions([
                                        { label: 'Message personnalisé', value: 'custom' }, 
                                        { label: 'ID de message', value: 'id' }             
                                    ])
                            );
                    
                        const typeMsg = await message.channel.send({
                            content: 'Choisissez le type de message',
                            components: [msgTypeRow]
                        });
                    
                        const typeCollector = typeMsg.createMessageComponentCollector({
                            componentType: ComponentType.StringSelect,
                            time: 30000
                        });
                    
                        typeCollector.on('collect', async typeInteraction => {
                            if (typeInteraction.user.id !== message.author.id) {
                                await typeInteraction.deferUpdate();
                                return;
                            }
                        
                            await typeInteraction.deferUpdate();
                            this.settings.messageType = typeInteraction.values[0];
                            await typeMsg.delete().catch(() => {});
                        
                            if (this.settings.messageType === 'custom') {
                                const contentMsg = await message.channel.send('Entrez le message personnalisé');
                                try {
                                    const contentResponse = await message.channel.awaitMessages({
                                        filter: m => m.author.id === message.author.id,
                                        max: 1,
                                        time: 30000,
                                        errors: ['time']
                                    });
                                    
                                    this.settings.messageContent = contentResponse.first().content;
                                    await contentMsg.delete().catch(() => {});
                                    await contentResponse.first().delete().catch(() => {});
                                } catch (error) {
                                    await contentMsg.delete().catch(() => {});
                                }
                            } else if (this.settings.messageType === 'id') {
                                const idMsg = await message.channel.send('Entrez l\'ID du message');
                                try {
                                    const idResponse = await message.channel.awaitMessages({
                                        filter: m => m.author.id === message.author.id,
                                        max: 1,
                                        time: 30000,
                                        errors: ['time']
                                    });
                                    
                                    this.settings.messageId = idResponse.first().content;
                                    await idMsg.delete().catch(() => {});
                                    await idResponse.first().delete().catch(() => {});
                                } catch (error) {
                                    await idMsg.delete().catch(() => {});
                                }
                            }
                        
                            await this.save();
                            await this.updateMenu();
                        });
                    
                        typeCollector.on('end', () => {
                            typeMsg.delete().catch(() => {});
                        });
                        break;
                    
                    case 'style':
                        const styles = ['Bouton', 'Sélecteur', 'Réaction'];
                        const currentStyleIndex = styles.indexOf(this.settings.style);
                        this.settings.style = styles[(currentStyleIndex + 1) % styles.length];
                        await this.save();
                        await this.updateMenu();
                        break;
    
                    case 'type':
                        const types = ['Donner/Retirer', 'Donner', 'Retirer'];
                        const currentIndex = types.indexOf(this.settings.type);
                        this.settings.type = types[(currentIndex + 1) % types.length];
                        await this.save();
                        await this.updateMenu();
                        break;
                    
                    //
                    case 'options_menu':
                        if (interaction.values[0] === 'create_option') {
                            this.isCreatingOption = true;
                            this.currentOption = new RoleMenuOption();
                            await this.updateMenu();
                        } 
                        else if (interaction.values[0] === 'delete_option') {
                            if (this.settings.options.length === 0) {
                                await message.channel.send('Aucune option à supprimer.').then(msg => {
                                    setTimeout(() => msg.delete().catch(() => {}), 3000);
                                });
                                break;
                            }
                    
                            const optionsMenu = new ActionRowBuilder()
                                .addComponents(
                                    new StringSelectMenuBuilder()
                                        .setCustomId('delete_option_select')
                                        .setPlaceholder('Choisissez l\'option à supprimer')
                                        .addOptions(
                                            this.settings.options.map(opt => ({
                                                label: `Position ${opt.position}: ${opt.text || 'Sans texte'}`,
                                                description: `Rôle: ${message.guild.roles.cache.get(opt.roleId)?.name || 'Rôle inconnu'}`,
                                                value: opt.position.toString(),
                                                emoji: opt.emoji
                                            }))
                                        )
                                );
                    
                            const deleteMsg = await message.channel.send({
                                content: 'Sélectionnez l\'option à supprimer :',
                                components: [optionsMenu]
                            });
                    
                            try {
                                const optionResponse = await deleteMsg.awaitMessageComponent({
                                    filter: i => i.user.id === message.author.id,
                                    time: 30000
                                });
                    
                                const position = parseInt(optionResponse.values[0]);
                                this.settings.options = this.settings.options.filter(opt => opt.position !== position);
                                await this.save();
                                
                                await deleteMsg.delete().catch(() => {});
                                await message.channel.send('Option supprimée avec succès !').then(msg => {
                                    setTimeout(() => msg.delete().catch(() => {}), 3000);
                                });
                                await this.updateMenu();
                            } catch (error) {
                                await deleteMsg.delete().catch(() => {});
                            }
                        }
                        else if (interaction.values[0] === 'delete_menu') {
                            const confirmMsg = await message.channel.send({
                                content: '⚠️ Êtes-vous sûr de vouloir supprimer ce menu ? Cette action est irréversible.',
                                components: [
                                    new ActionRowBuilder()
                                        .addComponents(
                                            new ButtonBuilder()
                                                .setCustomId('confirm_delete')
                                                .setLabel('Confirmer')
                                                .setStyle(ButtonStyle.Danger),
                                            new ButtonBuilder()
                                                .setCustomId('cancel_delete')
                                                .setLabel('Annuler')
                                                .setStyle(ButtonStyle.Secondary)
                                        )
                                ]
                            });
                    
                            try {
                                const confirmResponse = await confirmMsg.awaitMessageComponent({
                                    filter: i => i.user.id === message.author.id,
                                    time: 30000
                                });
                    
                                if (confirmResponse.customId === 'confirm_delete') {
                                    await RoleMenuBuilder.deleteMenu(this.id);
                                    await confirmMsg.delete().catch(() => {});
                                    await this.menuMessage.delete().catch(() => {});
                                    await message.channel.send('Le rolemenu a été supprimé avec succès !').then(msg => {
                                        setTimeout(() => msg.delete().catch(() => {}), 3000);
                                    });
                                } else {
                                    await confirmMsg.delete().catch(() => {});
                                }
                            } catch (error) {
                                await confirmMsg.delete().catch(() => {});
                            }
                        }
                        break;
    
                    case 'requiredRoles':
                        const reqMsg = await message.channel.send('Mentionnez les rôles requis (séparés par des espaces). Tapez "aucun" pour ne pas avoir de rôles requis.');
                        
                        try {
                            const reqResponse = await message.channel.awaitMessages({
                                filter: m => m.author.id === message.author.id,
                                max: 1,
                                time: 30000,
                                errors: ['time']
                            });
                            
                            const content = reqResponse.first().content.toLowerCase();
                            if (content === 'aucun') {
                                this.settings.requiredRoles = [];
                            } else {
                                this.settings.requiredRoles = reqResponse.first().mentions.roles.map(r => r.id);
                            }
                            await reqMsg.delete().catch(() => {});
                            await reqResponse.first().delete().catch(() => {});
                            await this.updateMenu();
                        } catch (error) {
                            await reqMsg.delete().catch(() => {});
                        }
                        break;
    
                    case 'forbiddenRoles':
                        const forbidMsg = await message.channel.send('Mentionnez les rôles interdits (séparés par des espaces). Tapez "aucun" pour ne pas avoir de rôles interdits.');
                        
                        try {
                            const forbidResponse = await message.channel.awaitMessages({
                                filter: m => m.author.id === message.author.id,
                                max: 1,
                                time: 30000,
                                errors: ['time']
                            });
                            
                            const content = forbidResponse.first().content.toLowerCase();
                            if (content === 'aucun') {
                                this.settings.forbiddenRoles = [];
                            } else {
                                this.settings.forbiddenRoles = forbidResponse.first().mentions.roles.map(r => r.id);
                            }
                            await forbidMsg.delete().catch(() => {});
                            await forbidResponse.first().delete().catch(() => {});
                            await this.updateMenu();
                        } catch (error) {
                            await forbidMsg.delete().catch(() => {});
                        }
                        break;
    
                    case 'targetRole':
                        const targetMsg = await message.channel.send('Mentionnez le rôle à donner.');
                        
                        try {
                            const targetResponse = await message.channel.awaitMessages({
                                filter: m => m.author.id === message.author.id && m.mentions.roles.size > 0,
                                max: 1,
                                time: 30000,
                                errors: ['time']
                            });
                            
                            this.settings.targetRole = targetResponse.first().mentions.roles.first().id;
                            await targetMsg.delete().catch(() => {});
                            await targetResponse.first().delete().catch(() => {});
                            await this.updateMenu();
                        } catch (error) {
                            await targetMsg.delete().catch(() => {});
                        }
                        break;
                    //
                    case 'send':
                        try {
                            await this.sendRoleMenu(message);
                            await message.channel.send('Le rolemenu a été créé avec succès !');
                            if (this.menuMessage) {
                                await this.menuMessage.delete();
                            }
                        } catch (error) {
                            await message.channel.send(`Erreur : ${error.message}`);
                        }
                        break;
    
                    case 'messageTypeSelect':
                        this.settings.messageType = interaction.values[0];
                        if (interaction.values[0] === 'custom') {
                            const contentMsg = await message.channel.send('Entrez le message personnalisé');
                            try {
                                const contentResponse = await message.channel.awaitMessages({
                                    filter: m => m.author.id === message.author.id,
                                    max: 1,
                                    time: 30000,
                                    errors: ['time']
                                });
                                
                                this.settings.messageContent = contentResponse.first().content;
                                await contentMsg.delete().catch(() => {});
                                await contentResponse.first().delete().catch(() => {});
                            } catch (error) {
                                await contentMsg.delete().catch(() => {});
                            }
                        } else if (interaction.values[0] === 'id') {
                            const idMsg = await message.channel.send('Entrez l\'ID du message');
                            try {
                                const idResponse = await message.channel.awaitMessages({
                                    filter: m => m.author.id === message.author.id,
                                    max: 1,
                                    time: 30000,
                                    errors: ['time']
                                });
                                
                                this.settings.messageId = idResponse.first().content;
                                await idMsg.delete().catch(() => {});
                                await idResponse.first().delete().catch(() => {});
                            } catch (error) {
                                await idMsg.delete().catch(() => {});
                            }
                        }
                        await this.updateMenu();
                        break;
                }
            }   
        });
        
        return collector;
    }
}

class RoleMenuOption {
    constructor() {
        this.position = 1;
        this.roleId = null;
        this.emoji = null;
        this.text = '';
        this.description = '';
        this.color = 'Bleu';
    }

    isComplete() {
        return this.roleId !== null && this.emoji !== null;
    }

    toJSON() {
        return {
            position: this.position,
            roleId: this.roleId,
            emoji: this.emoji,
            text: this.text,
            description: this.description,
            color: this.color
        };
    }
}

module.exports = {
    name: 'rolemenu',
    description: 'Crée un menu de rôles interactif',
    permissions: [PermissionFlagsBits.ManageRoles],
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('Vous n\'avez pas la permission de gérer les rôles !');
        }
    
        await RoleMenuBuilder.ensureDataDirectory();
    
        let roleMenu;
    
        if (args.length > 0 && !isNaN(args[0])) {
            roleMenu = await RoleMenuBuilder.load(args[0]);
            if (!roleMenu) {
                return message.reply(`Aucun rolemenu trouvé avec l'ID ${args[0]}`);
            }
            roleMenu.guild = message.guild; // Ajoute la guild au roleMenu chargé
        } else {
            roleMenu = new RoleMenuBuilder(message.guild);
            roleMenu.id = await RoleMenuBuilder.getNextId();
            await roleMenu.save();
        }
        
        try {
            await roleMenu.start(message);
        } catch (error) {
            console.error('Erreur lors de la création du rolemenu:', error);
            message.reply('Une erreur est survenue lors de la création du menu de rôles.');
        }
    }
};