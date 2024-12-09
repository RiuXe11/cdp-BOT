const { Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const BaseHandler = require('./BaseHandler');

class CommandHandler extends BaseHandler {
    constructor(client) {
        super();
        this.client = client;
        this.client.commands = new Collection();
    }

    loadCommands() {
        const commandsPath = path.join(process.cwd(), 'commands');
        
        if (!fs.existsSync(commandsPath)) {
            console.error('❌ Le dossier commands n\'existe pas!');
            return;
        }

        const loadCommandsRecursively = (dir) => {
            const files = fs.readdirSync(dir);
            
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isDirectory()) {
                    loadCommandsRecursively(filePath);
                } else if (file.endsWith('.js')) {
                    try {
                        const command = require(filePath);
                        if ('name' in command && 'execute' in command) {
                            const relativePath = path.relative(process.cwd(), filePath);
                            
                            this.loadedItems.set(command.name, {
                                path: relativePath,
                                description: command.description || 'Aucune description',
                                aliases: command.aliases || []
                            });

                            console.log(`[✓] Commande chargée: ${command.name} (${relativePath})`);
                            this.client.commands.set(command.name, command);

                            if (command.aliases && Array.isArray(command.aliases)) {
                                command.aliases.forEach(alias => {
                                    this.client.commands.set(alias, command);
                                });
                            }
                        } else {
                            console.log(`[×] La commande ${filePath} est invalide (name ou execute manquant)`);
                        }
                    } catch (error) {
                        console.error(`[×] Erreur lors du chargement de ${filePath}:`, error);
                    }
                }
            }
        };

        loadCommandsRecursively(commandsPath);
        this.formatLoadingDisplay(this.loadedItems, 'commandes');
    }
}

module.exports = CommandHandler;