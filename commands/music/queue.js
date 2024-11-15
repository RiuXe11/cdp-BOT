const { EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');

module.exports = {
    name: 'queue',
    async execute(message, args, client) {
        if (!client.queue) client.queue = [];
        if (!client.preloadedStreams) client.preloadedStreams = new Map();

        if (args[0]) {
            const url = args[0];
            const loadingMsg = await message.channel.send('🔄 Chargement...');

            try {
                // Charger la musique
                const songInfo = await preloadSong(url, message.author.tag, client);
                client.queue.push(songInfo);
                loadingMsg.edit(`✅ **${songInfo.title}** ajouté à la file d'attente !`);
            } catch (error) {
                console.error('Queue Add Error:', error);
                loadingMsg.edit('❌ Erreur lors de l\'ajout à la file d\'attente.');
            }
            return;
        }

        // Affichage de la queue (reste identique)
        if (client.queue.length === 0 && !client.currentSong) {
            return message.reply('❌ File d\'attente vide !');
        }

        const queueEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📑 File d\'attente')
            .setTimestamp();

        if (client.currentSong) {
            queueEmbed.addFields({
                name: '🎵 En cours de lecture',
                value: `**${client.currentSong.title}**\nDurée: \`${client.currentSong.duration}\`\nDemandé par: ${client.currentSong.requestedBy}`
            });
        }

        if (client.queue.length > 0) {
            const queueList = client.queue
                .slice(0, 10)
                .map((song, id) => `${id + 1}. **${song.title}** (\`${song.duration}\`) - Demandé par: ${song.requestedBy}`)
                .join('\n');

            queueEmbed.addFields({
                name: '📋 Prochaines musiques',
                value: queueList + (client.queue.length > 10 ? `\n\n...et ${client.queue.length - 10} autres musiques` : '')
            });
        }

        queueEmbed.setFooter({
            text: `Total: ${client.queue.length + (client.currentSong ? 1 : 0)} musique(s)`
        });

        message.reply({ embeds: [queueEmbed] });
    },
};

async function preloadSong(url, requestedBy, client) {
    const [infoProcess, streamProcess] = await Promise.all([
        spawn('yt-dlp', [
            '--print', 'title,duration',
            '--no-warnings',
            '--no-playlist',
            url
        ]),
        spawn('yt-dlp', [
            '-o', '-',
            '-f', 'bestaudio[acodec=opus]/bestaudio/best',
            '--no-warnings',
            '--no-playlist',
            '--buffer-size', '8K',
            '--downloader', 'aria2c',
            '--external-downloader-args', 'aria2c:"-x 32 -s 32 -k 512K --optimize-concurrent-downloads=true"',
            '--force-ipv4',
            url
        ])
    ]);

    let infoOutput = '';
    infoProcess.stdout.on('data', (data) => {
        infoOutput += data.toString();
    });

    const [title, duration] = await new Promise((resolve) => {
        infoProcess.on('close', () => resolve(infoOutput.trim().split('\n')));
    });

    const songInfo = {
        title,
        duration: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
        requestedBy,
        url,
        process: streamProcess
    };

    client.preloadedStreams.set(url, streamProcess);
    return songInfo;
}