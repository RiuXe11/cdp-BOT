const fs = require('fs');
const path = require('path');
const BaseHandler = require('./BaseHandler');

class EventHandler extends BaseHandler {
    constructor(client) {
        super();
        this.client = client;
    }

    loadEvents() {
        const eventsPath = path.join(process.cwd(), 'events');
        
        if (!fs.existsSync(eventsPath)) {
            console.error('❌ Le dossier events n\'existe pas!');
            return;
        }

        console.log(`\n`);

        const loadEventsRecursively = (dir) => {
            const files = fs.readdirSync(dir);
            
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isDirectory()) {
                    loadEventsRecursively(filePath);
                } else if (file.endsWith('.js')) {
                    try {
                        const event = require(filePath);
                        if ('name' in event && 'execute' in event) {
                            if (event.once) {
                                this.client.once(event.name, (...args) => event.execute(...args, this.client));
                            } else {
                                this.client.on(event.name, (...args) => event.execute(...args, this.client));
                            }
                            
                            const relativePath = path.relative(process.cwd(), filePath);
                            this.loadedItems.set(event.name, {
                                path: relativePath,
                                description: event.description || 'Aucune description',
                                once: event.once || false
                            });
                            console.log(`[✓] Événement chargé: ${event.name} (${relativePath})`);
                        } else {
                            console.log(`[×] L'événement ${filePath} est invalide (name ou execute manquant)`);
                        }
                    } catch (error) {
                        console.error(`[×] Erreur lors du chargement de ${filePath}:`, error);
                    }
                }
            }
        };

        loadEventsRecursively(eventsPath);
        this.formatLoadingDisplay(this.loadedItems, 'événements');
    }
}

module.exports = EventHandler;