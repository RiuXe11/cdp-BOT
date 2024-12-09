const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Fonction pour scanner les fichiers du bot
function scanBotFiles(directory, baseDir = directory) {
    let files = [];
    try {
        const items = fs.readdirSync(directory);

        for (const item of items) {
            const fullPath = path.join(directory, item);
            const relativePath = path.relative(baseDir, fullPath);

            if (fs.statSync(fullPath).isDirectory()) {
                if (item !== 'node_modules' && item !== '.git' && item !== 'data') {
                    files = files.concat(scanBotFiles(fullPath, baseDir));
                }
            } else {
                if (!item.includes('.env') && !item.includes('config.json')) {
                    const stats = fs.statSync(fullPath);
                    files.push({
                        path: relativePath,
                        lastModified: stats.mtime.toISOString(),
                        size: stats.size
                    });
                }
            }
        }
    } catch (error) {
        console.error('❌ | Erreur lors du scan des fichiers:', error);
    }
    return files;
}

// Fonction pour formater l'uptime
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    return `${days}j ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

let lastUpdateMessage = null;

async function sendBotInfo(client, centralChannelId) {
    console.log(`📡 | Mise à jour des informations...`);
    
    try {
        const channel = await client.channels.fetch(centralChannelId);
        if (!channel) {
            throw new Error(`Canal ${centralChannelId} non trouvé`);
        }

        // Préparer les informations et l'embed comme avant
        let version = '1.0.0';
        try {
            const packageInfo = require(path.join(process.cwd(), 'package.json'));
            version = packageInfo.version || version;
        } catch (error) {
            console.warn('⚠️ | package.json non trouvé, version par défaut utilisée');
        }

        const files = scanBotFiles(process.cwd());
        const commands = Array.from(client.commands?.keys() || []);
        
        const infoEmbed = new EmbedBuilder()
            .setTitle('🤖 Bot Information Update')
            .setColor('#00ff00')
            .setDescription(`Bot: ${client.user.tag}`)
            .addFields([
                {
                    name: 'Version',
                    value: version.toString(),
                    inline: true
                },
                {
                    name: 'Uptime',
                    value: formatUptime(client.uptime),
                    inline: true
                },
                {
                    name: 'Ping',
                    value: `${Math.round(client.ws.ping)}ms`,
                    inline: true
                },
                {
                    name: 'Commandes',
                    value: commands.length > 0 ? commands.join(', ') : 'Aucune commande',
                    inline: false
                },
                {
                    name: 'Fichiers',
                    value: `${files.length} fichiers surveillés`,
                    inline: true
                }
            ])
            .setTimestamp();

        const botInfo = {
            name: client.user.tag,
            version: version,
            files: files,
            commands: commands,
            uptime: client.uptime,
            ping: client.ws.ping
        };

        // Vérifier s'il existe déjà un message à mettre à jour
        if (!lastUpdateMessage) {
            // Chercher le dernier message du bot
            const messages = await channel.messages.fetch({ limit: 10 });
            lastUpdateMessage = messages.find(msg => 
                msg.author.id === client.user.id && 
                msg.content === '!bot-update'
            );
        }

        if (lastUpdateMessage) {
            // Mettre à jour le message existant
            lastUpdateMessage = await lastUpdateMessage.edit({
                content: '!bot-update',
                embeds: [infoEmbed],
                files: [{
                    attachment: Buffer.from(JSON.stringify(botInfo, null, 2)),
                    name: 'bot-info.json'
                }]
            });
            console.log('✅ | Message mis à jour');
        } else {
            // Créer un nouveau message si aucun n'existe
            lastUpdateMessage = await channel.send({
                content: '!bot-update',
                embeds: [infoEmbed],
                files: [{
                    attachment: Buffer.from(JSON.stringify(botInfo, null, 2)),
                    name: 'bot-info.json'
                }]
            });
            console.log('✅ | Nouveau message créé');
        }

        // S'assurer que la réaction existe
        if (!(lastUpdateMessage.reactions.cache.has('🔄'))) {
            await lastUpdateMessage.react('🔄');
        }

    } catch (error) {
        console.error('❌ | Erreur lors de la mise à jour des informations:', error);
        lastUpdateMessage = null; // Réinitialiser en cas d'erreur
        throw error;
    }
}

module.exports = { sendBotInfo };