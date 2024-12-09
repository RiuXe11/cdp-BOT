module.exports = {
    name: 'skip',
    async execute(message, args, client) {
        if (!message.member.voice.channel) {
            return message.reply('❌ Vous devez être dans un salon vocal !');
        }

        if (!client.audioPlayer || !client.currentSong) {
            return message.reply('❌ Aucune musique en cours !');
        }

        try {
            // Vérifier s'il y a des musiques dans la queue
            if (client.queue.length > 0) {
                if (client.currentSong?.process) {
                    client.currentSong.process.kill();
                }
                const nextSong = client.queue.shift();
                message.reply('⏭️ Passage à la musique suivante...');
                await client.commands.get('play').playSong(message, nextSong.url, client);
            } else {
                message.reply('❌ Pas de musique suivante dans la queue !');
            }
        } catch (error) {
            console.error('Skip Error:', error);
            message.reply('❌ Erreur lors du changement de musique !');
        }
    },
};