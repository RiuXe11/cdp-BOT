const { Events, ActivityType } = require("discord.js");

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        client.user.setActivity("⚙️ | En cours de développement...", { type: ActivityType.Custom });
        console.log(`✅ | Le bot ${client.user.tag} est prêt !`);
    },
};