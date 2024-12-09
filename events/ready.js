const { Events, ActivityType } = require("discord.js");
const fs = require('fs');
const path = require('path');

// Chemin vers le fichier de configuration du statut
const statusConfigPath = path.join(process.cwd(), 'data', 'status-config.json');

// Fonction pour charger le statut
function loadStatus() {
    try {
        if (fs.existsSync(statusConfigPath)) {
            return JSON.parse(fs.readFileSync(statusConfigPath, 'utf8'));
        }
    } catch (error) {
        console.error('Erreur lors du chargement du statut:', error);
    }
    return { type: ActivityType.Custom, text: "⚙️ | En cours de développement..." };
}

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        try {
            // Charger et configurer le dernier statut
            const savedStatus = loadStatus();
            client.user.setActivity(savedStatus.text, { type: savedStatus.type });
            console.log(`✅ | Le bot ${client.user.tag} est prêt !`);

            // Gérer l'arrêt propre du bot
            process.on('SIGINT', () => {
                console.log('Arrêt du bot...');
                client.destroy();
                process.exit(0);
            });
        } catch (error) {
            console.error('❌ | Erreur lors de l\'initialisation:', error);
        }
    },
};