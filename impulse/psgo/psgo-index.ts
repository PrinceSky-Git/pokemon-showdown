/**
 * PSGO Card System - Main Entry Point
 * @license MIT
 */

export { PSGOStorage } from './psgo-storage';
export { PSGOCardManager } from './psgo-manager';
export { commands, pages } from './psgo-commands';
export * from './psgo-models';

import { commands } from './psgo-commands';

// Register commands
Object.assign(Chat.commands, commands);

/**
 * PSGO Card System - Clean Version
 * 
 * ## Modern Features:
 * 
 * ### **File-Based Storage**
 * - Uses `fs.ts` with `writeUpdate()` for atomic operations
 * - JSON storage in `impulse-db/` directory
 * - Intelligent caching system (5-minute TTL)
 * - Race-condition-free persistence
 * 
 * ### **Economy Integration**
 * - Full integration with `Economy` class
 * - Uses `Economy.readMoney()`, `Economy.takeMoney()`, etc.
 * - Consistent transaction logging
 * - Native currency support
 * 
 * ### **Modern Utilities**
 * - `Impulse.generateThemedTable()` for tables
 * - `Impulse.nameColor()` for user formatting
 * - Consistent theming and UI
 * 
 * ### **Clean Architecture**
 * - **psgo-models.ts**: Modern type definitions
 * - **psgo-storage.ts**: File persistence layer
 * - **psgo-manager.ts**: Core business logic
 * - **psgo-commands.ts**: Command implementation
 * - **psgo-index.ts**: Main entry point
 * 
 * ## Installation:
 * 
 * 1. **Place Files**: Put all files in `impulse/misc/` directory
 * 2. **Import**: Add `import './psgo-index';` to your main file
 * 3. **Data Directory**: System creates `impulse-db/` automatically
 * 
 * ## Commands:
 * 
 * ### **User Commands**:
 * - `/psgo show [cardId]` - View card details
 * - `/psgo collection [user, page, sort]` - Browse collections
 * - `/psgo transfer [user], [cardId]` - Transfer cards
 * - `/psgo shop` - Browse pack shop
 * - `/psgo buy [pack]` - Purchase packs
 * - `/psgo open [pack]` - Open packs
 * - `/psgo packs` - View owned packs
 * - `/psgo ladder` - Points leaderboard
 * - `/psgo set [setting], [value]` - User preferences
 * 
 * ### **Admin Commands**:
 * - `/psgo add [params]` - Add cards/packs
 * - `/psgo edit [id, params]` - Edit cards/packs  
 * - `/psgo delete [id]` - Delete cards/packs
 * - `/psgo give [user], [cardId]` - Give cards to users
 * - `/psgo manage [action], [user], [amount]` - System management
 * 
 * ## Modern Card Format:
 * 
 * ### **Pokemon Cards**:
 * ```typescript
 * {
 *   id: 'base1-25',
 *   name: 'Pikachu',
 *   supertype: 'PokÃ©mon',
 *   hp: '60',
 *   types: ['Electric'],
 *   subtypes: ['Basic'],
 *   rarity: 'Rare',
 *   images: { small: 'url', large: 'url' },
 *   attacks: [{ name: 'Thunder Shock', damage: '10', ... }]
 * }
 * ```
 * 
 * ### **Trainer/Energy Cards**:
 * ```typescript
 * {
 *   id: 'base1-77',
 *   name: 'Computer Search',
 *   supertype: 'Trainer',
 *   rules: ['Search your deck for any card.']
 * }
 * ```
 * 
 * ## Special Features:
 * 
 * ### **Modern Subtypes**:
 * - **VMAX/VSTAR**: +5 bonus points
 * - **TAG TEAM**: +6 bonus points  
 * - **GX/EX/V**: +3 bonus points
 * - **LEGEND/Prime**: +4 bonus points
 * - **Special visual effects**: Glowing borders, colored text
 * 
 * ### **Pack Distribution**:
 * - 6 Commons, 3 Uncommons, 1 Rare+ per pack
 * - Weighted rarity system: 75% Rare, 15% Ultra Rare, 7% Secret, 3% Special
 * - Official Pokemon TCG distribution patterns
 * 
 * ### **Data Persistence**:
 * - `psgo-user-cards.json` - User card collections
 * - `psgo-user-packs.json` - Unopened packs
 * - `psgo-pack-credits.json` - Pack credit balances
 * - `psgo-managers.json` - System managers
 * - `psgo-user-settings.json` - User preferences
 * - `psgo-card-definitions.json` - All card data
 * - `psgo-pack-definitions.json` - Pack information
 * 
 * All files use atomic operations to prevent corruption and include
 * intelligent caching for optimal performance.
 */

console.log('[PSGO] Modern card system loaded successfully');
