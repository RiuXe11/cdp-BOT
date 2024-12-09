module.exports = {
    name: 'stop',
    async execute(message, args, client) {
        if (!message.member.voice.channel) {
            return message.reply('⚠️ Vous devez être dans un salon vocal !');
        }

        if (!client.audioPlayer) {
            return message.reply('❌ Aucune musique en cours !');
        }

        try {
            client.queue = [];
            client.currentSong = null;
            client.audioPlayer.stop();
            if (client.voiceConnection) {
                client.voiceConnection.destroy();
                client.voiceConnection = null;
            }
            message.reply('⏹️ Musique arrêtée !');
        } catch (error) {
            message.reply('❌ Une erreur s\'est produite lors de l\'arrêt de la musique !');
        }
    },
};