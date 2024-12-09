const fs = require('fs');
const path = require('path');

class BaseHandler {
    constructor() {
        this.loadedItems = new Map();
    }

    formatLoadingDisplay(items, type) {
        console.log('\n' + '═'.repeat(80));
        console.log(`📝 Total des ${type} chargés: ${items.size}`);
        
        if (items.size === 0) {
            console.log(`⚠️ Aucun ${type} n'a été trouvé!`);
            console.log('═'.repeat(80) + '\n');
            return;
        }

        console.log('✨ Liste des ' + type + ':');
        
        // Grouper par dossier
        const itemsByFolder = new Map();
        items.forEach((itemInfo, itemName) => {
            const folderPath = path.dirname(itemInfo.path);
            if (!itemsByFolder.has(folderPath)) {
                itemsByFolder.set(folderPath, []);
            }
            itemsByFolder.get(folderPath).push({ name: itemName, ...itemInfo });
        });

        // Afficher les dossiers et leurs items
        const folders = Array.from(itemsByFolder.keys());
        folders.forEach((folder, folderIndex) => {
            const isLastFolder = folderIndex === folders.length - 1;
            const folderItems = itemsByFolder.get(folder);
            
            console.log(`  ${isLastFolder ? '└─' : '├─'} 📁 ${folder}`);
            
            folderItems.forEach((item, itemIndex) => {
                const isLastItem = itemIndex === folderItems.length - 1;
                const prefix = isLastFolder ? '     ' : '  │  ';
                const itemPrefix = `${prefix}${isLastItem ? '└─' : '├─'}`;
                
                // Ligne principale de l'item
                let mainLine = `${itemPrefix} ${item.name}`;
                if (item.aliases) mainLine += ` (aliases: ${item.aliases.join(', ')})`;
                if (item.once) mainLine += ' (once)';
                console.log(mainLine);

                // Description de l'item
                if (item.description) {
                    const descPrefix = prefix + (isLastItem ? '     ' : '│    ');
                    console.log(`${descPrefix}└─ ${item.description}`);
                }
            });
        });

        console.log('═'.repeat(80) + '\n');
    }
}

module.exports = BaseHandler;