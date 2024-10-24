const { Client, EmbedBuilder } = require('discord.js');
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

// Liste des commandes disponibles avec leurs descriptions
const commands = [
  { name: '!help', description: 'Affiche la liste des commandes disponibles.' },
  { name: '!set-color', description: 'Permet de modifier la couleur des embeds.' },
  { name: '!embed', description: 'Permet de créer des embeds.' },
  { name: '!embed-modify', description: 'Permet de modifier des embeds existant.' },
  { name: '!renew [Nouveau nom]', description: 'Permet de recréer un salon avec ou sans nouveau nom.' },
  { name: '!rolemenu [ID]', description: 'Permet de créer un rolemenu.\n└ Si vous ajoutez un ID ça modifiera un rolemnu existant.' },
  { name: '!roleid', description: 'Permet de voir les rolemenu créés.' },
  { name: '!vote', description: 'Permet de gérer les votes.' },
  { name: '!setpermission', description: '⚠️ **UNIQUEMENT POUR LES ADMINISTRATEURS** : Permet de gérer les permissions des commandes.' },
];

module.exports = {
  name: 'help',
  description: 'Affiche la liste des commandes disponibles',
  execute(message) {
    const serverColor = colorManager.getColor(message.guild.id);
    // Création de l'embed
    const helpEmbed = new EmbedBuilder()
      .setColor(serverColor)
      .setTitle('📚 | Liste des Commandes')
      .setDescription('Voici toutes les commandes disponibles :\n\n' + 
        commands.map(cmd => `\`${cmd.name}\`\n└ ${cmd.description}`).join('\n\n'))
      .setFooter({ text: 'Bot créé par RiuXe | Préfix : !'});

    // Envoi de l'embed
    message.channel.send({ embeds: [helpEmbed] });
  },
};