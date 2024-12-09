const Form = require('../../data/schemas/FormSchema');
const { EmbedBuilder } = require('discord.js');

class FormManager {
    static async getAllForms() {
        return await Form.find().sort({ number: 1 });
    }

    static async getFormById(formId) {
        console.log('Recherche du formulaire avec ID:', formId);
        return await Form.findOne({ id: formId });
    }

    static async createForm(formData) {
        try {
            const count = await Form.countDocuments();
            const newForm = new Form({
                ...formData,
                number: count + 1,
                // Ne pas réécrire l'ID ici
                // id: `form_${Date.now()}`  <-- Supprimer cette ligne
            });
            return await newForm.save();
        } catch (error) {
            console.error('❌ Erreur lors de la création du formulaire:', error);
            throw error;
        }
    }

    static async updateForm(formId, updateData) {
        return await Form.findOneAndUpdate(
            { id: formId },
            { ...updateData, updatedAt: new Date() },
            { new: true }
        );
    }

    static async deleteForm(formId) {
        return await Form.findOneAndDelete({ id: formId });
    }

    static async addResponse(formId, userId, userTag, responses) {
        const form = await Form.findOne({ id: formId });
        if (!form) return null;

        form.responses.push({
            userId,
            userTag,
            responses
        });

        return await form.save();
    }

    static async updateLogs(form, interaction) {
        try {
            if (!form.logsChannel || !form.logsType) return;

            const logsChannel = await interaction.guild.channels.fetch(form.logsChannel);
            if (!logsChannel) return;

            let logsMessage;
            let logsEmbed = new EmbedBuilder()
                .setTitle(form.title)
                .setColor('#0099ff')
                .setTimestamp();

            if (form.logsType === 'update') {
                try {
                    if (form.logsMessage) {
                        logsMessage = await logsChannel.messages.fetch(form.logsMessage);
                    }
                } catch {
                    form.logsMessage = null;
                    await form.save();
                }

                if (!logsMessage) {
                    logsMessage = await logsChannel.send({ embeds: [logsEmbed] });
                    form.logsMessage = logsMessage.id;
                    await form.save();
                }

                const description = form.responses.length > 0 ? 
                    form.responses.map(r => `${r.userTag}\n${r.responses.join(' | ')}`).join('\n\n') :
                    'En attente de réponses...';

                logsEmbed.setDescription(description);
                await logsMessage.edit({ embeds: [logsEmbed] });
            } else {
                // Pour le mode embed, on crée un nouvel embed pour chaque réponse
                const lastResponse = form.responses[form.responses.length - 1];
                logsEmbed.setDescription(`${lastResponse.userTag}\n${lastResponse.responses.join(' | ')}`);
                await logsChannel.send({ embeds: [logsEmbed] });
            }
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour des logs:', error);
        }
    }
}

module.exports = FormManager;