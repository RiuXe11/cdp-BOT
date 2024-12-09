const { EmbedBuilder } = require('discord.js');
const { AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');

module.exports = {
    name: 'nowplaying',
    aliases: ['np'],
    async execute(message, args, client) {
        if (!client.audioPlayer || client.audioPlayer.state.status !== AudioPlayerStatus.Playing) {
            return message.reply('❌ Aucune musique en cours !');
        }

        const currentSong = client.currentSong;
        if (!currentSong) return message.reply('❌ Aucune musique en cours !');

        // Calculer le temps écoulé et la durée totale
        const startTime = currentSong.startTime || Date.now();
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const [minutes, seconds] = currentSong.duration.split(':');
        const duration = parseInt(minutes) * 60 + parseInt(seconds);
        
        // Calculer la position de la barre de progression
        const barLength = 30;
        const position = Math.min(Math.floor((elapsed / duration) * barLength), barLength);
        
        // Créer la barre de progression
        const progressBar = '▬'.repeat(position) + '⚪' + '▬'.repeat(barLength - position);
        
        // Formater le temps écoulé
        const formatTime = (secs) => {
            const min = Math.floor(secs / 60);
            const sec = secs % 60;
            return `${min}:${sec.toString().padStart(2, '0')}`;
        };

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 En lecture')
            .setDescription(`${currentSong.title}`)
            .addFields(
                { 
                    name: 'Progression', 
                    value: progressBar,
                    inline: false
                },
                {
                    name: 'Temps',
                    value: `${formatTime(elapsed)} / ${currentSong.duration}`,
                    inline: true
                },
                {
                    name: 'Demandé par',
                    value: currentSong.requestedBy,
                    inline: true
                }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
};