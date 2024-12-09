const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const { spawn } = require('child_process');
const sodium = require('libsodium-wrappers');

async function playSong(message, url, client) {
    const loadingMsg = await message.channel.send('🔄 Chargement...');
    let ytProcess;

    try {
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
                '--external-downloader-args', 'aria2c:"-x 32 -s 32 -k 512K"',
                '--force-ipv4',
                url
            ])
        ]);

        ytProcess = streamProcess;
        
        let infoOutput = '';
        infoProcess.stdout.on('data', (data) => {
            infoOutput += data.toString();
        });

        const [title, duration] = (await new Promise((resolve) => {
            infoProcess.on('close', () => resolve(infoOutput.trim().split('\n')));
        }));

        const resource = createAudioResource(streamProcess.stdout, {
            inputType: 'arbitrary',
            inlineVolume: true,
            silencePaddingFrames: 0
        });

        if (resource.volume) {
            resource.volume.setVolume(0.5);
        }

        const previousSong = client.currentSong;
        client.currentSong = {
            title,
            duration: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
            requestedBy: message.author.tag,
            url,
            process: ytProcess,
            message,
            startTime: Date.now(),
            loadingMsg
        };

        if (previousSong?.process && !previousSong.process.killed) {
            previousSong.process.kill();
        }

        client.audioPlayer.play(resource);
        loadingMsg.edit({
            content: `🎵 **Lecture en cours**\n> **Titre :** ${title}\n> **Durée :** ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`
        });

    } catch (error) {
        console.error('Play Song Error:', error);
        loadingMsg.edit('❌ Erreur de lecture.');
        if (ytProcess?.killed === false) ytProcess.kill();
    }
}

function checkVoiceChannel(client, voiceChannel) {
    if (!client.checkEmptyTimeout) {
        client.checkEmptyTimeout = null;
    }

    const members = voiceChannel.members.filter(member => !member.user.bot);

    if (members.size === 0) {
        if (!client.checkEmptyTimeout) {
            client.checkEmptyTimeout = setTimeout(() => {
                if (voiceChannel.members.filter(member => !member.user.bot).size === 0) {
                    if (client.voiceConnection) {
                        client.voiceConnection.destroy();
                        client.voiceConnection = null;
                    }
                    if (client.currentSong?.process) {
                        client.currentSong.process.kill();
                        client.currentSong = null;
                    }
                    client.queue = [];
                    voiceChannel.send('👋 Salon vocal vide, déconnexion...');
                }
                client.checkEmptyTimeout = null;
            }, 10000);
        }
    } else if (client.checkEmptyTimeout) {
        clearTimeout(client.checkEmptyTimeout);
        client.checkEmptyTimeout = null;
    }
}

module.exports = {
    name: 'play',
    playSong,
    async execute(message, args, client) {
        if (!client.queue) client.queue = [];
        if (!client.currentSong) client.currentSong = null;

        if (!client.audioPlayer) {
            client.audioPlayer = createAudioPlayer({
                behaviors: {
                    noSubscriber: NoSubscriberBehavior.Play,
                    maxMissedFrames: 10
                }
            });

            client.audioPlayer.on(AudioPlayerStatus.Idle, async () => {
                if (client.queue.length > 0) {
                    const nextSong = client.queue.shift();
                    const savedMessage = client.currentSong?.message || message;
                    await playSong(savedMessage, nextSong.url, client);
                } else if (client.currentSong) {
                    const currentMsg = client.currentSong.message;
                    client.currentSong = null;
                    currentMsg.channel.send('✅ Lecture terminée !');
                }
            });

            client.audioPlayer.on('error', error => {
                console.error('Player Error:', error);
                if (client.currentSong?.message) {
                    client.currentSong.message.channel.send('❌ Erreur de lecture.');
                }
            });
        }

        await sodium.ready;

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply(`⚠️ Vous devez d'abord rejoindre un \`salon vocal\` !`);
        }

        if (!args[0]) {
            return message.reply(`⚠️ Commande incomplète. Merci de faire : \`!play <lien YouTube>\``);
        }

        if (!client.voiceConnection || client.voiceConnection.state.status === 'destroyed') {
            client.voiceConnection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });
            client.voiceConnection.subscribe(client.audioPlayer);

            // Configurer une vérification périodique du salon vocal
            setInterval(() => {
                checkVoiceChannel(client, voiceChannel);
            }, 5000);
        }

        if (client.currentSong) {
            return client.commands.get('queue').execute(message, args, client);
        }

        await playSong(message, args[0], client);
    },
};