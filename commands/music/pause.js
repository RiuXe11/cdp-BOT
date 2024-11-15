const { AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
    name: 'pause',
    async execute(message, args, client) {
        if (!client.audioPlayer) {
            return message.reply('❌ Aucune musique en cours !');
        }

        if (client.audioPlayer.state.status === AudioPlayerStatus.Paused) {
            client.audioPlayer.unpause();
            return message.reply('▶️ Lecture reprise !');
        }
        
        client.audioPlayer.pause();
        message.reply('⏸️ Musique mise en pause !');
    }
};