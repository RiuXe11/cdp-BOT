// config/database/database.js
const mongoose = require('mongoose');
require('dotenv').config();

const DATABASE_NAME = 'cdp_bot'; // Nom de votre choix pour la base de données

module.exports = {
    connect: async () => {
        try {
            const baseUri = process.env.MONGODB_URI;
            const mongoUri = baseUri.replace('/?', `/${DATABASE_NAME}?`);
            
            await mongoose.connect(mongoUri);

            console.log(`✅ Connecté à la base de données: ${DATABASE_NAME}`);

            // Gérer l'initialisation de la base de données
            const db = mongoose.connection;
            
            db.on('error', (error) => {
                console.error('❌ Erreur de connexion MongoDB:', error);
            });

            db.once('open', () => {
                console.log('📁 Collections disponibles:', Object.keys(db.collections));
            });

        } catch (error) {
            console.error('❌ Erreur lors de la connexion à MongoDB:', error);
            process.exit(1);
        }
    }
};