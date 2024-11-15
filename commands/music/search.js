const { spawn } = require('child_process');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'search',
    async execute(message, args, client) {
        if (!args.length) {
            return message.reply('⚠️ Veuillez spécifier un terme de recherche');
        }

        const searchTerm = args.join(' ');
        const loadingMsg = await message.channel.send('🔄 Recherche en cours...');

        try {
            // Recherche avec yt-dlp
            const searchProcess = spawn('yt-dlp', [
                'ytsearch5:' + searchTerm,
                '--get-title',
                '--get-id',
                '--get-duration',
                '--no-warnings'
            ]);

            let output = '';
            searchProcess.stdout.on('data', data => {
                output += data.toString();
            });

            const results = await new Promise((resolve, reject) => {
                searchProcess.on('close', code => {
                    if (code !== 0) reject('Erreur de recherche');
                    
                    const lines = output.trim().split('\n');
                    const videos = [];
                    
                    for (let i = 0; i < lines.length; i += 3) {
                        if (lines[i]) {
                            videos.push({
                                title: lines[i],
                                id: lines[i + 1],
                                duration: lines[i + 2],
                                url: `https://youtube.com/watch?v=${lines[i + 1]}`
                            });
                        }
                    }
                    resolve(videos);
                });
            });

            if (results.length === 0) {
                return loadingMsg.edit('❌ Aucun résultat trouvé.');
            }

            // Création de l'embed avec les résultats
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🔍 Résultats de recherche')
                .setDescription(
                    results.map((video, index) => 
                        `${['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][index]} ${video.title}\n⏱️ \`${video.duration}\``
                    ).join('\n\n')
                )
                .setFooter({ text: '📝 Réagissez pour sélectionner une musique' });

            const resultsMessage = await loadingMsg.edit({ content: '', embeds: [embed] });

            // Ajout des réactions
            const reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'].slice(0, results.length);
            for (const reaction of reactions) {
                await resultsMessage.react(reaction);
            }

            // Collecteur de réactions
            const filter = (reaction, user) => 
                reactions.includes(reaction.emoji.name) && user.id === message.author.id;

            const collected = await resultsMessage.awaitReactions({
                filter,
                max: 1,
                time: 30000
            });

            if (collected.size === 0) {
                return resultsMessage.edit({ content: '❌ Temps écoulé', embeds: [] });
            }

            const choice = reactions.indexOf(collected.first().emoji.name);
            const selectedVideo = results[choice];

            // Demande de confirmation pour play ou queue
            const confirmationEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎵 Que souhaitez-vous faire ?')
                .setDescription(`**${selectedVideo.title}**\n\n▶️ Lecture immédiate\n📥 Ajouter à la file d'attente`);

            await resultsMessage.reactions.removeAll();
            const confirmationMsg = await resultsMessage.edit({ embeds: [confirmationEmbed] });
            
            await confirmationMsg.react('▶️');
            await confirmationMsg.react('📥');

            const actionFilter = (reaction, user) => 
                ['▶️', '📥'].includes(reaction.emoji.name) && user.id === message.author.id;

            const actionCollected = await confirmationMsg.awaitReactions({
                filter: actionFilter,
                max: 1,
                time: 30000
            });

            if (actionCollected.size === 0) {
                return confirmationMsg.edit({ content: '❌ Temps écoulé', embeds: [] });
            }

            if (actionCollected.first().emoji.name === '▶️') {
                if (client.currentSong) {
                    return message.reply('⚠️ Une musique est déjà en cours de lecture. Utilisez !queue pour ajouter à la file d\'attente.');
                }
                client.commands.get('play').execute(message, [selectedVideo.url], client);
            } else {
                client.commands.get('queue').execute(message, [selectedVideo.url], client);
            }

        } catch (error) {
            console.error('Search Error:', error);
            loadingMsg.edit('❌ Une erreur est survenue lors de la recherche.');
        }
    }
};