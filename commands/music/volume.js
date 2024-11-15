const { AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
    name: 'volume',
    async execute(message, args, client) {
        if (!client.audioPlayer || client.audioPlayer.state.status !== AudioPlayerStatus.Playing) {
            return message.reply('❌ Aucune musique en cours !');
        }

        const volume = parseInt(args[0]);
        if (isNaN(volume) || volume < 1 || volume > 100) {
            return message.reply('⚠️ Veuillez spécifier un volume entre 1 et 100 !');
        }

        try {
            const resource = client.audioPlayer.state.resource;
            if (resource && resource.volume) {
                // Convertir le pourcentage en valeur décimale (0-1)
                const normalizedVolume = volume / 100;
                resource.volume.setVolume(normalizedVolume);
                message.reply(`🔊 Volume réglé à ${volume}% !`);
            } else {
                message.reply('❌ Impossible de modifier le volume pour le moment.');
            }
        } catch (error) {
            console.error('Volume Command Error:', error);
            message.reply('❌ Une erreur s\'est produite lors du changement de volume.');
        }
    }
};