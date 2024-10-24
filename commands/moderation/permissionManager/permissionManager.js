const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

class PermissionManager {
    constructor() {
        this.commandPermissions = new Map();
        this.availableCommands = new Set();
        
        // Vérifie que la clé existe dans le .env
        if (!process.env.PERMISSION_KEY) {
            throw new Error('PERMISSION_KEY manquante dans le fichier .env');
        }
        
        this.encryptionKey = Buffer.from(process.env.PERMISSION_KEY, 'base64');
        this.loadCommands();
        this.loadPermissions();
    }

    // Chiffre les données
    encryptData(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(this.encryptionKey), iv);
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return {
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            data: encrypted
        };
    }

    decryptData(encryptedData) {
        try {
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                Buffer.from(this.encryptionKey),
                Buffer.from(encryptedData.iv, 'hex')
            );
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('Erreur lors du déchiffrement des données:', error);
            return null;
        }
    }

        // Sauvegarde les permissions dans un fichier chiffré
    savePermissions() {
        const permissionsData = Array.from(this.commandPermissions.entries());
        const encryptedData = this.encryptData(permissionsData);
        const filePath = path.join(__dirname, 'permissions.secure');
        
        try {
            fs.writeFileSync(filePath, JSON.stringify(encryptedData));
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des permissions:', error);
        }
    }

    // Charge les permissions depuis le fichier chiffré
    loadPermissions() {
        const filePath = path.join(__dirname, 'permissions.secure');
        
        try {
            if (fs.existsSync(filePath)) {
                const encryptedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const decryptedData = this.decryptData(encryptedData);
                
                if (decryptedData) {
                    this.commandPermissions = new Map(decryptedData);
                }
            }
        } catch (error) {
            console.error('Erreur lors du chargement des permissions:', error);
            // En cas d'erreur, on continue avec une Map vide
            this.commandPermissions = new Map();
        }
    }

    // Charge toutes les commandes du dossier /commands
    loadCommands() {
        const commandsPath = path.join(__dirname, '../../');
        
        const readCommands = (dir) => {
            const files = fs.readdirSync(dir);
            
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isDirectory() && file !== 'permissionManager') {
                    readCommands(filePath);
                } else if (file.endsWith('.js')) {
                    try {
                        const command = require(filePath);
                        if (command.name) {
                            this.availableCommands.add(command.name.toLowerCase());
                        }
                    } catch (error) {
                        console.error(`Erreur lors du chargement de la commande ${file}:`, error);
                    }
                }
            }
        };

        readCommands(commandsPath);
    }

    // Vérifie si une commande existe
    isValidCommand(commandName) {
        return this.availableCommands.has(commandName.toLowerCase());
    }

    // Initialise les permissions par défaut pour une commande
    initializeCommandPermission(commandName, guild) {
        if (!this.commandPermissions.has(commandName.toLowerCase())) {
            // Trouve le rôle le plus haut (en excluant @everyone)
            const highestRole = guild.roles.cache
                .filter(role => role.id !== guild.id)
                .sort((a, b) => b.position - a.position)
                .first();
            
            if (highestRole) {
                this.setCommandPermission(commandName, highestRole.id);
            }
        }
    }

    // Définit le rôle minimum requis pour une commande
    setCommandPermission(commandName, roleId) {
        if (!this.isValidCommand(commandName)) {
            throw new Error('Cette commande n\'existe pas.');
        }
        this.commandPermissions.set(commandName.toLowerCase(), roleId);
        this.savePermissions(); // Sauvegarde après chaque modification
    }


    // Vérifie si un utilisateur peut utiliser une commande
    checkPermission(member, commandName) {
        // Si c'est la commande setpermission, vérifie si l'utilisateur est admin
        if (commandName.toLowerCase() === 'setpermission') {
            return member.permissions.has(PermissionsBitField.Flags.Administrator);
        }
    
        const requiredRoleId = this.commandPermissions.get(commandName.toLowerCase());
        
        // Si aucune permission n'est définie, vérifie si le membre a la permission Administrateur
        if (!requiredRoleId) {
            return member.permissions.has(PermissionsBitField.Flags.Administrator);
        }
        
        // Sinon, vérifie les permissions normales
        return member.roles.cache.some(role => {
            const requiredRole = member.guild.roles.cache.get(requiredRoleId);
            if (!requiredRole) return false;
            return role.id === requiredRoleId || role.position >= requiredRole.position;
        });
    }

    // Crée l'embed des permissions
    createPermissionsEmbed(guild,message) {
        const serverColor = colorManager.getColor(message.guild.id);
        const embed = new EmbedBuilder()
            .setColor(serverColor)
            .setTitle('📋 Permissions des Commandes')
            .setDescription('Liste des commandes et des rôles requis pour les utiliser')
            .setTimestamp();

        // Groupe les commandes par rôle et non-configurées
        const roleCommands = new Map();
        const unconfiguredCommands = [];

        // Trie les commandes
        this.availableCommands.forEach(commandName => {
            // Ignore la commande setpermission dans la liste
            if (commandName === 'setpermission') return;
            
            const roleId = this.commandPermissions.get(commandName);
            
            if (roleId) {
                const role = guild.roles.cache.get(roleId);
                const roleName = role ? role.name : 'Rôle inconnu';
                
                if (!roleCommands.has(roleName)) {
                    roleCommands.set(roleName, []);
                }
                roleCommands.get(roleName).push(commandName);
            } else {
                unconfiguredCommands.push(commandName);
            }
        });

        // Ajoute les commandes configurées
        roleCommands.forEach((commands, roleName) => {
            embed.addFields({
                name: `🔸 ${roleName}`,
                value: commands.map(cmd => `\`${cmd}\``).join(', '),
                inline: false
            });
        });

        // Ajoute les commandes non configurées
        if (unconfiguredCommands.length > 0) {
            embed.addFields({
                name: '⚪ Commandes sans permissions',
                value: unconfiguredCommands.map(cmd => `\`${cmd}\``).join(', '),
                inline: false
            });
        }

        // Ajoute l'aide
        embed.addFields({
            name: '💡 Configuration',
            value: 'Pour définir les permissions:\n`!setpermission <commande> @role`\n*(Réservé aux administrateurs)*',
            inline: false
        });

        return embed;
    }

    // Gère la commande !setpermission
    async handleCommand(message, args) {
        // Vérifie les permissions administrateur
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ Cette commande est réservée aux administrateurs.');
        }

        // Affiche l'embed si pas d'arguments
        if (!args.length) {
            const embed = this.createPermissionsEmbed(message.guild, message);
            return message.reply({ embeds: [embed] });
        }

        const commandName = args[0].toLowerCase();
        const role = message.mentions.roles.first();

        // Empêche la modification des permissions de la commande setpermission
        if (commandName === 'setpermission') {
            return message.reply('❌ Les permissions de cette commande ne peuvent pas être modifiées.');
        }

        // Vérifie que la commande existe
        if (!this.isValidCommand(commandName)) {
            return message.reply('Cette commande n\'existe pas. Utilisez `!setpermission` pour voir la liste des commandes disponibles.');
        }

        // Vérifie qu'un rôle est mentionné
        if (!role) {
            return message.reply('Usage: !setpermission <commande> @role');
        }

        try {
            this.setCommandPermission(commandName, role.id);
            message.reply(`La commande \`${commandName}\` nécessite maintenant le rôle ${role.name} ou supérieur.`);
        } catch (error) {
            message.reply('Une erreur est survenue lors de la configuration des permissions.');
            console.error(error);
        }
    }
}

// Création d'une instance unique du gestionnaire de permissions
const permissionManager = new PermissionManager();

module.exports = {
    name: 'setpermission',
    description: 'Gère les permissions des commandes',
    permissions: [PermissionsBitField.Flags.Administrator],
    execute: (message, args) => permissionManager.handleCommand(message, args),
    checkPermission: (member, commandName) => permissionManager.checkPermission(member, commandName)
};