/**
 * Pokemon Showdown
 * PSGO Collectable Pokemon Cards System
 * Refactored for Pokemon TCG API Data Format
 * @license MIT
 */

// ================ Configuration ================
const CARDS_PER_PACK = 10;
const CURRENCY = Impulse.currency || 'coins';

// ================ Interfaces ================
interface Card {
    id: string; // e.g., "base1-4"
    name: string;
    supertype: string; // "Pokémon", "Trainer", "Energy"
    subtypes?: string[]; // ["Stage 2", "ex", "VMAX", "EX", "MEGA", "Tera"]
    hp?: string;
    types?: string[]; // ["Fire", "Water"]
    evolvesFrom?: string;
    evolvesTo?: string[]; // For Basic/Stage 1 cards
    rules?: string[]; // Special rules (EX, MEGA, ex, etc.)
    abilities?: Array<{
        name: string;
        text: string;
        type: string; // "Ability", "Poké-Power", "Poké-Body"
    }>;
    attacks?: Array<{
        name: string;
        cost: string[];
        convertedEnergyCost: number;
        damage: string;
        text: string;
    }>;
    weaknesses?: Array<{ type: string; value: string }>;
    resistances?: Array<{ type: string; value: string }>;
    retreatCost?: string[];
    convertedRetreatCost?: number;
    set: {
        id: string;
        name: string;
        series: string;
        printedTotal: number;
        total: number;
        releaseDate: string;
        images?: {
            symbol: string;
            logo: string;
        };
    };
    number: string;
    artist?: string;
    rarity: string; // API format: "Common", "Uncommon", "Rare Holo", "Double Rare", etc.
    flavorText?: string;
    nationalPokedexNumbers?: number[];
    legalities?: {
        unlimited?: string;
        standard?: string;
        expanded?: string;
    };
    regulationMark?: string; // Modern cards (SV era): "G", "F", etc.
    images: {
        small: string;
        large: string;
    };
    tcgplayer?: {
        url: string;
        updatedAt: string;
        prices?: any;
    };
    cardmarket?: {
        url: string;
        updatedAt: string;
        prices?: any;
    };
}

interface CardInstance extends Card {
    obtainedAt?: number;
}

interface PackDefinition {
    code: string;
    name: string;
    series: string;
    releaseDate: string;
    price: number;
    inShop: boolean;
    creditPack: boolean;
}

interface UserSettings {
    transfersEnabled?: boolean;
    showcaseSort?: 'rarity' | 'points' | 'types' | 'name' | 'date';
}

type CardRarity = 'Common' | 'Uncommon' | 'Rare' | 'Ultra Rare' | 'Legendary' | 'Mythic';

// ================ Database Collections ================
const userCards = DB.userCards;
const userPacks = DB.userPacks;
const packCredits = DB.packCredits;
const managers = DB.managers;
const userSettings = DB.userSettings;
const cardDefinitions = DB.cardDefinitions;
const packDefinitions = DB.packDefinitions;

// ================ Database Helper Functions ================
async function getAllCards(): Promise<Record<string, Card>> {
    const cards = await cardDefinitions.get();
    return (cards as any) || {};
}

function getAllCardsSync(): Record<string, Card> {
    const cards = cardDefinitions.getSync();
    return (cards as any) || {};
}

async function getAllPacks(): Promise<Record<string, PackDefinition>> {
    const packs = await packDefinitions.get();
    return (packs as any) || {};
}

function getAllPacksSync(): Record<string, PackDefinition> {
    const packs = packDefinitions.getSync();
    return (packs as any) || {};
}

async function saveAllCards(cards: Record<string, Card>): Promise<void> {
    await cardDefinitions.clear(true);
    await cardDefinitions.insert(cards);
}

async function saveAllPacks(packs: Record<string, PackDefinition>): Promise<void> {
    await packDefinitions.clear(true);
    await packDefinitions.insert(packs);
}

// ================ Constants ================
const RARITY_POINTS: Record<string, number> = {
    'Common': 1,
    'Uncommon': 3,
    'Rare': 6,
    'Rare Holo': 8,
    'Rare Holo EX': 12,
    'Rare Holo GX': 12,
    'Rare Holo LV.X': 12,
    'Rare Holo V': 12,
    'Rare Holo VMAX': 15,
    'Rare Holo VSTAR': 15,
    'Rare Prime': 12,
    'Rare BREAK': 10,
    'Rare ACE': 15,
    'Rare Shining': 14,
    'Rare Rainbow': 18,
    'Rare Secret': 18,
    'Rare Ultra': 18,
    'LEGEND': 15,
    'Amazing Rare': 14,
    'Radiant Rare': 14,
    'Double Rare': 18, // SV era ex cards
    'Hyper Rare': 20, // SV era full art
    'Ultra Rare': 18, // SV era
    'Illustration Rare': 16, // SV era special illustrations
    'Special Illustration Rare': 20, // SV era
    'Promo': 5,
};

const RARITY_COLORS: Record<string, string> = {
    'Common': '#0066ff',
    'Uncommon': '#008000',
    'Rare': '#cc0000',
    'Rare Holo': '#cc0000',
    'Rare Holo EX': '#FFD700',
    'Rare Holo GX': '#FF6B35',
    'Rare Holo V': '#00D4AA',
    'Rare Holo VMAX': '#FF1493',
    'Rare Holo VSTAR': '#9932CC',
    'Rare Prime': '#32CD32',
    'Rare BREAK': '#FF4500',
    'Rare ACE': '#B8860B',
    'Rare Shining': '#C0C0C0',
    'Rare Rainbow': '#FF1493',
    'Rare Secret': '#998200',
    'Rare Ultra': '#800080',
    'LEGEND': '#B8860B',
    'Amazing Rare': '#FFD700',
    'Radiant Rare': '#FF1493',
    'Double Rare': '#FFD700', // SV era ex
    'Hyper Rare': '#FF1493', // SV era
    'Ultra Rare': '#9932CC', // SV era
    'Illustration Rare': '#00D4AA', // SV era
    'Special Illustration Rare': '#FFD700', // SV era
    'Promo': '#4caf50',
};

const SPECIAL_SUBTYPES: Record<string, { color: string; glow: boolean }> = {
    'EX': { color: '#FFD700', glow: true }, // XY era
    'GX': { color: '#FF6B35', glow: true }, // SM era
    'V': { color: '#00D4AA', glow: true }, // SWSH era
    'VMAX': { color: '#FF1493', glow: true }, // SWSH era
    'VSTAR': { color: '#9932CC', glow: true }, // SWSH era
    'ex': { color: '#FFB347', glow: true }, // SV era (lowercase!)
    'LEGEND': { color: '#B8860B', glow: true }, // HGSS era
    'Prime': { color: '#32CD32', glow: true }, // HGSS era
    'BREAK': { color: '#FF4500', glow: true }, // XY era
    'TAG TEAM': { color: '#4169E1', glow: true }, // SM era
    'MEGA': { color: '#8B008B', glow: true }, // XY era
    'LV.X': { color: '#DC143C', glow: true }, // DP era
    'Radiant': { color: '#FF1493', glow: true }, // SWSH era
    'Amazing': { color: '#FFD700', glow: true }, // SWSH era
    'Shining': { color: '#C0C0C0', glow: true }, // Neo era
    '★': { color: '#FFD700', glow: true }, // EX era
    'Tera': { color: '#00CED1', glow: true }, // SV era Terastal
};

// ================ Utility Functions ================
function toID(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeRarity(apiRarity: string): CardRarity {
    const rarity = apiRarity.toLowerCase();
    
    // Mythic tier (18-20 points)
    if (rarity.includes('secret') || rarity.includes('rainbow') || 
        rarity.includes('hyper') || rarity.includes('special illustration')) return 'Mythic';
    
    // Legendary tier (14-16 points)
    if (rarity.includes('legend') || rarity.includes('amazing') || 
        rarity.includes('radiant') || rarity.includes('shining') ||
        rarity.includes('illustration rare')) return 'Legendary';
    
    // Ultra Rare tier (12-18 points)
    if (rarity.includes('vmax') || rarity.includes('vstar') || 
        rarity.includes('ace') || rarity.includes('ultra') ||
        rarity.includes('double rare')) return 'Ultra Rare';
    
    // Rare tier (6-12 points)
    if (rarity.includes('holo') || rarity.includes('rare')) return 'Rare';
    
    // Uncommon (3 points)
    if (rarity.includes('uncommon')) return 'Uncommon';
    
    // Common (1 point)
    return 'Common';
}

async function getCardById(cardId: string): Promise<Card | null> {
    const allCards = await getAllCards();
    return allCards[cardId] || null;
}

function getCardByIdSync(cardId: string): Card | null {
    const allCards = getAllCardsSync();
    return allCards[cardId] || null;
}

async function getCardByName(setId: string, cardName: string): Promise<Card[]> {
    const allCards = await getAllCards();
    const matches: Card[] = [];
    const nameId = toID(cardName);
    
    for (const cardId in allCards) {
        const card = allCards[cardId];
        if (card.set.id === setId && toID(card.name) === nameId) {
            matches.push(card);
        }
    }
    return matches;
}

function getCardByNameSync(setId: string, cardName: string): Card[] {
    const allCards = getAllCardsSync();
    const matches: Card[] = [];
    const nameId = toID(cardName);
    
    for (const cardId in allCards) {
        const card = allCards[cardId];
        if (card.set.id === setId && toID(card.name) === nameId) {
            matches.push(card);
        }
    }
    return matches;
}

async function getCardFromInput(input: string): Promise<Card | Card[] | null> {
    if (!input) return null;
    
    // Try direct ID lookup first
    const byId = await getCardById(input);
    if (byId) return byId;
    
    // Try set-name format
    if (input.includes('-')) {
        const [setId, ...nameParts] = input.split('-');
        const cardName = nameParts.join('-');
        const byName = await getCardByName(setId, cardName);
        return byName.length > 0 ? (byName.length === 1 ? byName[0] : byName) : null;
    }
    
    return null;
}

function getCardFromInputSync(input: string): Card | Card[] | null {
    if (!input) return null;
    
    const byId = getCardByIdSync(input);
    if (byId) return byId;
    
    if (input.includes('-')) {
        const [setId, ...nameParts] = input.split('-');
        const cardName = nameParts.join('-');
        const byName = getCardByNameSync(setId, cardName);
        return byName.length > 0 ? (byName.length === 1 ? byName[0] : byName) : null;
    }
    
    return null;
}

async function toPackCode(packInput: string): Promise<string> {
    const packId = toID(packInput);
    const allPacks = await getAllPacks();
    for (const code in allPacks) {
        if (toID(code) === packId || toID(allPacks[code].name) === packId) {
            return code;
        }
    }
    return packInput;
}

async function isManager(userid: string): Promise<boolean> {
    const data = await managers.get();
    const managerList = (data as any)?.managers || [];
    return managerList.includes(userid);
}

function getSubtypeBonus(card: Card): number {
    if (!card.subtypes || card.subtypes.length === 0) return 0;
    
    let bonus = 0;
    for (const subtype of card.subtypes) {
        const t = subtype.toUpperCase();
        // Highest tier (SV era and special)
        if (t.includes('VMAX') || t.includes('VSTAR') || t.includes('TAG TEAM')) {
            bonus = Math.max(bonus, 6);
        }
        // High tier
        else if (t.includes('LEGEND') || t.includes('PRIME') || t.includes('SHINING') || t.includes('★')) {
            bonus = Math.max(bonus, 4);
        }
        // Mid tier (most special cards)
        else if (t === 'GX' || t === 'EX' || t === 'V' || t === 'EX' || // Note: 'ex' is lowercase in SV
                t.includes('MEGA') || t.includes('LV.X') || 
                t.includes('RADIANT') || t.includes('AMAZING') || t.includes('TERA')) {
            bonus = Math.max(bonus, 3);
        }
        // Low tier
        else if (t.includes('BREAK')) {
            bonus = Math.max(bonus, 2);
        }
    }
    
    // Special case: check for lowercase 'ex' (SV era)
    if (card.subtypes.includes('ex')) {
        bonus = Math.max(bonus, 3);
    }
    
    return bonus;
}

function getCardPoints(card: Card): number {
    const base = RARITY_POINTS[card.rarity] || 1;
    return base + getSubtypeBonus(card);
}

function formatCardTypes(card: Card): string {
    if (!card.types || card.types.length === 0) {
        if (card.supertype === 'Trainer') return 'Trainer';
        if (card.supertype === 'Energy') return 'Energy';
        return 'Unknown';
    }
    
    let typeStr = card.types.join('/');
    
    // Add special subtypes with formatting (checking for special mechanics)
    if (card.subtypes && card.subtypes.length > 0) {
        // Check for special subtypes that should be highlighted
        const specialSubtype = card.subtypes.find(st => SPECIAL_SUBTYPES[st]);
        if (specialSubtype) {
            const conf = SPECIAL_SUBTYPES[specialSubtype];
            const style = `color: ${conf.color}; font-weight: bold;${conf.glow ? ' text-shadow: 0 0 8px ' + conf.color + '80;' : ''}`;
            typeStr += ` - <span style="${style}">${specialSubtype}</span>`;
        } else {
            // Show evolution stage or other notable subtypes
            const notableSubtype = card.subtypes.find(st => 
                st !== 'Basic' && st !== 'Item' && st !== 'Supporter' && 
                st !== 'Stadium' && !st.includes('Stage')
            );
            if (notableSubtype) {
                typeStr += ` - <span style="font-weight: bold;">${notableSubtype}</span>`;
            }
        }
    }
    
    return typeStr;
}

async function makePack(setId: string): Promise<CardInstance[]> {
    const out: CardInstance[] = [];
    const allCards = await getAllCards();
    const packCards = Object.values(allCards).filter(c => c.set.id === setId);
    if (!packCards.length) return out;

    // Separate cards by normalized rarity
    const cardsByRarity: Record<CardRarity, Card[]> = {
        'Common': [],
        'Uncommon': [],
        'Rare': [],
        'Ultra Rare': [],
        'Legendary': [],
        'Mythic': [],
    };

    for (const card of packCards) {
        const normalizedRarity = normalizeRarity(card.rarity);
        cardsByRarity[normalizedRarity].push(card);
    }

    // Official TCG rates: 6 Commons, 3 Uncommons, 1 Rare or better
    for (let i = 0; i < 6; i++) {
        if (cardsByRarity['Common'].length > 0) {
            const randomCard = cardsByRarity['Common'][Math.floor(Math.random() * cardsByRarity['Common'].length)];
            out.push({ ...randomCard, obtainedAt: Date.now() });
        }
    }

    for (let i = 0; i < 3; i++) {
        if (cardsByRarity['Uncommon'].length > 0) {
            const randomCard = cardsByRarity['Uncommon'][Math.floor(Math.random() * cardsByRarity['Uncommon'].length)];
            out.push({ ...randomCard, obtainedAt: Date.now() });
        }
    }

    // Rare slot with weighted chances
    const rareRoll = Math.random() * 100;
    let selectedRarity: CardRarity;
    
    if (rareRoll < 1) selectedRarity = 'Mythic';
    else if (rareRoll < 5) selectedRarity = 'Legendary';
    else if (rareRoll < 15) selectedRarity = 'Ultra Rare';
    else selectedRarity = 'Rare';

    const rarityFallback: CardRarity[] = ['Mythic', 'Legendary', 'Ultra Rare', 'Rare', 'Uncommon', 'Common'];
    const startIdx = rarityFallback.indexOf(selectedRarity);
    
    for (let i = startIdx; i < rarityFallback.length; i++) {
        if (cardsByRarity[rarityFallback[i]].length > 0) {
            const randomCard = cardsByRarity[rarityFallback[i]][Math.floor(Math.random() * cardsByRarity[rarityFallback[i]].length)];
            out.push({ ...randomCard, obtainedAt: Date.now() });
            break;
        }
    }

    return out;
}

// ================ Data Functions ================
async function getUserCards(userid: string): Promise<CardInstance[]> {
    const cards = await userCards.getIn(userid, []);
    return cards;
}

async function giveCard(userid: string, cardId: string): Promise<boolean> {
    const card = await getCardById(cardId);
    if (!card) return false;
    const cardInstance: CardInstance = { ...card, obtainedAt: Date.now() };
    await userCards.pushIn(userid, cardInstance);
    return true;
}

async function takeCard(userid: string, cardId: string): Promise<boolean> {
    const cards = await getUserCards(userid);
    const idx = cards.findIndex(card => card.id === cardId);
    if (idx === -1) return false;
    
    cards.splice(idx, 1);
    await userCards.setIn(userid, cards);
    return true;
}

async function hasCard(userid: string, cardId: string): Promise<boolean> {
    const cards = await getUserCards(userid);
    return cards.some(card => card.id === cardId);
}

async function getUserPacks(userid: string): Promise<string[]> {
    return await userPacks.getIn(userid, []);
}

async function addUserPack(userid: string, pack: string): Promise<void> {
    await userPacks.pushIn(userid, pack);
}

async function removeUserPack(userid: string, pack: string): Promise<boolean> {
    const packs = await getUserPacks(userid);
    const idx = packs.indexOf(pack);
    if (idx === -1) return false;
    
    packs.splice(idx, 1);
    await userPacks.setIn(userid, packs);
    return true;
}

async function getPackCredits(userid: string): Promise<number> {
    return await packCredits.getIn(userid, 0);
}

async function addPackCredits(userid: string, amount: number): Promise<void> {
    const current = await getPackCredits(userid);
    await packCredits.setIn(userid, current + amount);
}

async function takePackCredits(userid: string, amount: number): Promise<boolean> {
    const current = await getPackCredits(userid);
    if (current < amount) return false;
    await packCredits.setIn(userid, current - amount);
    return true;
}

function displayCard(card: Card): string {
    const points = getCardPoints(card);
    const formattedTypes = formatCardTypes(card);
    const normalizedRarity = normalizeRarity(card.rarity);
    const rarityColor = RARITY_COLORS[card.rarity] || RARITY_COLORS[normalizedRarity] || '#cc0000';
    
    const specialSubtype = card.subtypes?.find(st => SPECIAL_SUBTYPES[st]);
    const borderColor = specialSubtype ? SPECIAL_SUBTYPES[specialSubtype].color : rarityColor;
    const glowEffect = specialSubtype && SPECIAL_SUBTYPES[specialSubtype].glow 
        ? `box-shadow: 0 0 12px ${borderColor}50;` 
        : '';
    
    let output = `<div style="border: 2px solid ${borderColor}; ${glowEffect} border-radius: 8px; padding: 16px; overflow: hidden;">`;
    output += `<table style="width: 100%; border-collapse: collapse;"><tr>`;
    output += `<td style="width: 210px; vertical-align: top; padding-right: 24px;">`;
    output += `<img src="${card.images.large}" alt="${card.name}" width="200" style="display: block; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">`;
    output += `</td>`;
    output += `<td style="vertical-align: top; line-height: 1.7;">`;
    output += `<div style="font-size: 2em; font-weight: bold; margin-bottom: 8px;">${card.name}</div>`;
    output += `<div style="color: ${rarityColor}; font-weight: bold; font-size: 1.2em; margin-bottom: 20px;">${card.rarity}</div>`;
    output += `<div style="margin-bottom: 10px;"><strong>Set:</strong> ${card.set.name} #${card.number}/${card.set.printedTotal}</div>`;
    output += `<div style="margin-bottom: 10px;"><strong>ID:</strong> ${card.id}</div>`;
    output += `<div style="margin-bottom: 10px;"><strong>Type:</strong> ${formattedTypes}</div>`;
    
    if (card.hp) {
        output += `<div style="margin-bottom: 10px;"><strong>HP:</strong> ${card.hp}</div>`;
    }
    
    if (card.evolvesFrom) {
        output += `<div style="margin-bottom: 10px;"><strong>Evolves From:</strong> ${card.evolvesFrom}</div>`;
    }
    
    if (card.evolvesTo && card.evolvesTo.length > 0) {
        output += `<div style="margin-bottom: 10px;"><strong>Evolves To:</strong> ${card.evolvesTo.join(', ')}</div>`;
    }
    
    // Show abilities if present
    if (card.abilities && card.abilities.length > 0) {
        output += `<div style="margin-top: 12px; margin-bottom: 10px;"><strong>Abilities:</strong></div>`;
        for (const ability of card.abilities) {
            output += `<div style="margin-left: 10px; margin-bottom: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px;">`;
            output += `<strong style="color: #d32f2f;">${ability.type}: ${ability.name}</strong><br>`;
            output += `<span style="font-size: 0.9em;">${ability.text}</span>`;
            output += `</div>`;
        }
    }
    
    // Show special rules if present (EX, MEGA, ex, etc.)
    if (card.rules && card.rules.length > 0) {
        output += `<div style="margin-top: 12px; padding: 8px; background: #fff3cd; border-left: 3px solid #ffc107; font-size: 0.9em;">`;
        for (const rule of card.rules) {
            output += `${rule}<br>`;
        }
        output += `</div>`;
    }
    
    if (card.artist) {
        output += `<div style="margin-top: 10px; font-size: 0.9em;"><strong>Artist:</strong> ${card.artist}</div>`;
    }
    
    if (card.regulationMark) {
        output += `<div style="margin-top: 10px; font-size: 0.9em;"><strong>Regulation Mark:</strong> ${card.regulationMark}</div>`;
    }
    
    const subtypeBonus = getSubtypeBonus(card);
    output += `<div style="margin-top: 16px; font-size: 1.1em;"><strong>Points:</strong> ${points}`;
    if (subtypeBonus > 0) {
        output += ` <span style="color: #4caf50;">(+${subtypeBonus})</span>`;
    }
    output += `</div>`;
    output += `</td></tr></table></div>`;
    
    return output;
}output += `<div style="margin-bottom: 10px;"><strong>HP:</strong> ${card.hp}</div>`;
    }
    
    if (card.evolvesFrom) {
        output += `<div style="margin-bottom: 10px;"><strong>Evolves From:</strong> ${card.evolvesFrom}</div>`;
    }
    
    if (card.artist) {
        output += `<div style="margin-bottom: 10px;"><strong>Artist:</strong> ${card.artist}</div>`;
    }
    
    const subtypeBonus = getSubtypeBonus(card);
    output += `<div style="margin-top: 16px; font-size: 1.1em;"><strong>Points:</strong> ${points}`;
    if (subtypeBonus > 0) {
        output += ` <span style="color: #4caf50;">(+${subtypeBonus})</span>`;
    }
    output += `</div>`;
    output += `</td></tr></table></div>`;
    
    return output;
}

// ================ Import Functions ================
async function importCardsFromAPI(jsonData: Card[], setId: string): Promise<{ added: number; updated: number; skipped: number }> {
    const allCards = await getAllCards();
    let added = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const apiCard of jsonData) {
        if (!apiCard.id || !apiCard.name) {
            skipped++;
            continue;
        }
        
        // Use API's ID format directly
        const cardId = apiCard.id;
        
        if (allCards[cardId]) {
            updated++;
        } else {
            added++;
        }
        
        allCards[cardId] = apiCard;
    }
    
    await saveAllCards(allCards);
    return { added, updated, skipped };
}

// ================ COMMANDS ================
export const commands: Chat.Commands = {
    psgo: {
        async show(target, room, user) {
            if (!this.runBroadcast()) return;
            if (!target) return this.parse('/help psgo show');
            
            const result = await getCardFromInput(target);
            if (!result) return this.errorReply('Card not found. Use format: cardId or setId-cardName');
            
            if (Array.isArray(result)) {
                let output = '<div style="padding: 10px;">';
                output += `<h3>Multiple cards found for "${target}"</h3>`;
                output += '<p>Please select one:</p>';
                for (const card of result) {
                    output += `<div style="margin: 5px 0;">`;
                    output += `<button class="button" name="send" value="/psgo show ${card.id}">${card.name} - ${card.set.name} #${card.number}</button>`;
                    output += `</div>`;
                }
                output += '</div>';
                return this.sendReplyBox(output);
            }
            
            return this.sendReplyBox(displayCard(result));
        },
        
        showhelp: ['/psgo show [cardId|setId-cardName] - Show card details'],
        
        confirmgive: 'give',
        async give(target, room, user, connection, cmd) {
            const isManagerUser = await isManager(user.id);
            if (!isManagerUser) this.checkCan('bypassall');
            
            if (!target) return this.parse('/help psgo give');
            const parts = target.split(',').map(x => x.trim());
            
            let targetName: string, cardInput: string;
            if (parts.length === 2) {
                const [part1, part2] = parts;
                if (part1.includes('-')) {
                    cardInput = part1;
                    targetName = part2;
                } else {
                    targetName = part1;
                    cardInput = part2;
                }
            } else {
                return this.errorReply('Usage: /psgo give [user], [card] OR /psgo give [card], [user]');
            }
            
            const targetUser = Users.get(targetName);
            if (!targetUser) return this.errorReply(`User "${targetName}" not found.`);
            if (!targetUser.named) return this.errorReply('Guests cannot receive cards.');
            
            const result = await getCardFromInput(cardInput);
            if (!result) return this.errorReply('Card not found.');
            
            if (Array.isArray(result)) {
                let output = '<div style="padding: 10px;">';
                output += `<h3>Multiple cards found for "${cardInput}"</h3>`;
                output += '<p>Please specify using the full ID:</p>';
                for (const c of result) {
                    output += `<div style="margin: 5px 0;">${c.name} - ${c.set.name} #${c.number} (ID: ${c.id})</div>`;
                }
                output += '</div>';
                return this.sendReplyBox(output);
            }
            
            const card = result;
            await giveCard(targetUser.id, card.id);
            if (targetUser.connected) {
                targetUser.popup(`|html|${Chat.escapeHTML(user.name)} transferred <b>${card.name}</b> to you!`);
            }
            this.modlog('PSGO TRANSFER', targetUser, `from: ${user.id}, card: ${card.id}`);
            return this.sendReply(`You transferred ${card.name} to ${targetUser.name}.`);
        },
        
        transferhelp: ['/psgo transfer [user], [card] - Transfer your card to another user'],
        
        async collection(target, room, user) {
            if (!this.runBroadcast()) return;
            
            const [targetName, pageStr, sortStr] = target ? target.split(',').map(x => x.trim()) : [];
            const targetUser = targetName ? toID(targetName) : user.id;
            const page = parseInt(pageStr) || 1;
            const cardsPerPage = 100;
            
            const cards = await getUserCards(targetUser);
            if (!cards.length) {
                return this.sendReplyBox(`${Impulse.nameColor(targetUser, true, true)} has no cards.`);
            }
            
            const settings = await userSettings.getIn(user.id);
            const sortType = sortStr || settings?.showcaseSort || 'rarity';
            
            const sortedCards = [...cards];
            switch (sortType) {
                case 'points':
                    sortedCards.sort((a, b) => getCardPoints(b) - getCardPoints(a));
                    break;
                case 'types':
                    sortedCards.sort((a, b) => {
                        const aType = (a.types && a.types[0]) || a.supertype;
                        const bType = (b.types && b.types[0]) || b.supertype;
                        return aType.localeCompare(bType);
                    });
                    break;
                case 'name':
                    sortedCards.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                case 'date':
                    sortedCards.sort((a, b) => (b.obtainedAt || 0) - (a.obtainedAt || 0));
                    break;
                default:
                    const rarityOrder = ['Mythic', 'Legendary', 'Ultra Rare', 'Rare', 'Uncommon', 'Common'];
                    sortedCards.sort((a, b) => {
                        const aNorm = normalizeRarity(a.rarity);
                        const bNorm = normalizeRarity(b.rarity);
                        const aIdx = rarityOrder.indexOf(aNorm);
                        const bIdx = rarityOrder.indexOf(bNorm);
                        return aIdx - bIdx;
                    });
            }
            
            const broadcasting = this.broadcasting;
            const startIdx = (page - 1) * cardsPerPage;
            const endIdx = Math.min(startIdx + cardsPerPage, sortedCards.length);
            const totalPages = Math.ceil(sortedCards.length / cardsPerPage);
            const displayCards = broadcasting ? sortedCards.slice(0, cardsPerPage) : sortedCards.slice(startIdx, endIdx);
            
            const cardsHTML = displayCards.map(card => {
                const specialSubtype = card.subtypes?.find(st => SPECIAL_SUBTYPES[st]);
                const buttonStyle = specialSubtype
                    ? `padding: 0; border: 2px solid ${SPECIAL_SUBTYPES[specialSubtype].color}; box-shadow: 0 0 8px ${SPECIAL_SUBTYPES[specialSubtype].color}40;`
                    : 'padding: 0;';
                return `<button class="button" name="send" value="/psgo show ${card.id}" style="margin: 2px; ${buttonStyle}">` +
                    `<img src="${card.images.small}" height="120" width="86" title="${card.name}"></button>`;
            }).join('');
            
            let pagination = '';
            if (!broadcasting && totalPages > 1) {
                pagination = '<div style="text-align: center; margin-top: 10px;">';
                if (page > 1) {
                    pagination += `<button class="button" name="send" value="/psgo collection ${targetUser}, ${page - 1}">Previous</button> `;
                }
                pagination += `Page ${page} of ${totalPages}`;
                if (page < totalPages) {
                    pagination += ` <button class="button" name="send" value="/psgo collection ${targetUser}, ${page + 1}">Next</button>`;
                }
                pagination += '</div>';
            }
            
            return this.sendReplyBox(
                `<div style="max-height: 300px; overflow-y: auto;">${cardsHTML}</div>` +
                pagination +
                `<div style="text-align: center; margin-top: 10px; font-weight: bold;">` +
                `${Impulse.nameColor(targetUser, true, true)} has ${cards.length} card${cards.length === 1 ? '' : 's'} (Sort: ${sortType})` +
                `</div>`
            );
        },
        collectionhelp: ['/psgo collection [user], [page], [sort] - View card collection (sort: rarity/points/types/name/date)'],
        
        async ladder(target, room, user) {
            if (!this.runBroadcast()) return;
            const allData = await userCards.get();
            const userPoints: Array<{ name: string; points: number; cards: number }> = [];
            
            for (const userid in allData) {
                const cards = (allData as any)[userid] || [];
                let points = 0;
                for (const card of cards) points += getCardPoints(card);
                if (points > 0) userPoints.push({ name: userid, points, cards: cards.length });
            }
            
            userPoints.sort((a, b) => b.points - a.points);
            const top100 = userPoints.slice(0, 100);
            if (!top100.length) return this.sendReplyBox('No users have any cards yet.');
            
            const data = top100.map((entry, index) => {
                let rankDisplay = (index + 1).toString();
                if (index === 0) rankDisplay = '🥇 1';
                else if (index === 1) rankDisplay = '🥈 2';
                else if (index === 2) rankDisplay = '🥉 3';
                return [rankDisplay, Impulse.nameColor(entry.name, true, true), entry.points.toLocaleString(), entry.cards.toString()];
            });
            
            const tableHTML = Impulse.generateThemedTable('PSGO Card Ladder', ['Rank', 'User', 'Points', 'Cards'], data);
            return this.sendReplyBox(tableHTML);
        },
        ladderhelp: ['/psgo ladder - View points leaderboard'],
        
        async cards(target, room, user) {
            if (!this.runBroadcast()) return;
            
            const allCards = await getAllCards();
            const cardList = Object.values(allCards).filter(c => c.id && c.name);
            
            if (!cardList.length) {
                return this.sendReplyBox('No cards in database.');
            }
            
            const filters = target.split(',').map(x => x.trim().toLowerCase());
            let filteredCards = [...cardList];
            
            for (const filter of filters) {
                if (!filter) continue;
                
                if (filter.startsWith('set:')) {
                    const setId = filter.substring(4);
                    filteredCards = filteredCards.filter(c => c.set.id.toLowerCase().includes(setId));
                } else if (filter.startsWith('rarity:')) {
                    const rarity = filter.substring(7);
                    filteredCards = filteredCards.filter(c => c.rarity.toLowerCase().includes(rarity));
                } else if (filter.startsWith('type:')) {
                    const type = filter.substring(5);
                    filteredCards = filteredCards.filter(c => 
                        c.types?.some(t => t.toLowerCase().includes(type)) ||
                        c.supertype.toLowerCase().includes(type)
                    );
                } else {
                    filteredCards = filteredCards.filter(c => c.name.toLowerCase().includes(filter));
                }
            }
            
            if (!filteredCards.length) {
                return this.sendReplyBox('No cards found matching your filters.');
            }
            
            filteredCards.sort((a, b) => {
                if (a.set.id !== b.set.id) return a.set.id.localeCompare(b.set.id);
                return parseInt(a.number) - parseInt(b.number);
            });
            
            const rows = filteredCards.map(card => {
                const normalizedRarity = normalizeRarity(card.rarity);
                const rarityColor = RARITY_COLORS[card.rarity] || RARITY_COLORS[normalizedRarity] || '#cc0000';
                const typeDisplay = card.types ? card.types.join('/') : card.supertype;
                return [
                    `<button class="button" name="send" value="/psgo show ${card.id}">${card.id}</button>`,
                    card.name,
                    card.set.name,
                    `<span style="color: ${rarityColor}; font-weight: bold;">${card.rarity}</span>`,
                    typeDisplay
                ];
            });
            
            const tableHTML = Impulse.generateThemedTable(
                `All Cards (${filteredCards.length} total)`,
                ['ID', 'Name', 'Set', 'Rarity', 'Type'],
                rows
            );
            
            return this.sendReplyBox(
                `<div style="max-height: 360px; overflow-y: auto;">` +
                tableHTML +
                `</div>` +
                `<div style="margin-top: 10px; font-size: 0.9em;">` +
                `<strong>Filters:</strong> set:base1, rarity:holo, type:fire, or search by name<br>` +
                `<strong>Example:</strong> /psgo cards set:base1, rarity:rare` +
                `</div>`
            );
        },
        
        cardshelp: ['/psgo cards [filters] - List all cards. Filters: set:id, rarity:name, type:fire, or card name'],
        
        async shop(target, room, user) {
            if (!this.runBroadcast()) return;
            const allPacks = await getAllPacks();
            const shopPacks = Object.values(allPacks).filter(p => p.inShop);
            if (!shopPacks.length) return this.sendReplyBox('The pack shop is currently empty.');
            
            const packsHTML = shopPacks.map(pack =>
                `<tr><td style="padding: 10px;"><button class="button" name="send" value="/psgo buy ${pack.code}">${pack.name}</button></td>` +
                `<td style="padding: 10px;">${pack.price} ${CURRENCY}</td>` +
                `<td style="padding: 10px;">${pack.series}</td></tr>`
            ).join('');
            
            return this.sendReplyBox(
                `<div style="max-height: 300px; overflow-y: auto;"><table style="width: 100%; border-collapse: collapse;">` +
                `<thead><tr><th colspan="3" style="padding: 10px; font-size: 1.2em;">Pack Shop</th></tr>` +
                `<tr><th style="padding: 5px;">Pack</th><th style="padding: 5px;">Price</th><th style="padding: 5px;">Series</th></tr></thead>` +
                `<tbody>${packsHTML}</tbody></table></div>`
            );
        },
        shophelp: ['/psgo shop - View pack shop'],
        
        async buy(target, room, user) {
            if (!target) return this.parse('/help psgo buy');
            const packCode = await toPackCode(target);
            const allPacks = await getAllPacks();
            const pack = allPacks[packCode];
            if (!pack) return this.errorReply('Pack not found.');
            if (!pack.inShop && !pack.creditPack) return this.errorReply('Pack not available.');
            
            if (pack.creditPack) {
                const credits = await getPackCredits(user.id);
                if (credits < 1) return this.errorReply('You need 1 pack credit to buy this pack.');
                const success = await takePackCredits(user.id, 1);
                if (!success) return this.errorReply('Failed to use pack credit.');
                await addUserPack(user.id, packCode);
                return this.sendReplyBox(
                    `You used 1 pack credit to buy <b>${pack.name}</b>!<br>` +
                    `Remaining credits: ${credits - 1}<br>` +
                    `<button class="button" name="send" value="/psgo open ${packCode}">Open Pack</button>`
                );
            }
            
            const userMoney = Economy.readMoney(user.id);
            if (userMoney < pack.price) {
                return this.errorReply(`You need ${pack.price} ${CURRENCY} to buy this pack!`);
            }
            Economy.takeMoney(user.id, pack.price, `Purchased ${pack.name} pack`, 'system');
            await addUserPack(user.id, packCode);
            return this.sendReplyBox(
                `You bought <b>${pack.name}</b> for ${pack.price} ${CURRENCY}!<br>` +
                `<button class="button" name="send" value="/psgo packs">View Your Packs</button>`
            );
        },
        buyhelp: ['/psgo buy [pack] - Buy pack (with coins or credits)'],
        
        async open(target, room, user) {
            if (!this.runBroadcast()) return;
            if (!target) return this.parse('/help psgo open');
            const packCode = await toPackCode(target);
            const userPacksList = await getUserPacks(user.id);
            if (!userPacksList.includes(packCode)) {
                return this.errorReply(`You don't have a ${packCode} pack.`);
            }
            
            await removeUserPack(user.id, packCode);
            const cards = await makePack(packCode);
            if (!cards.length) return this.errorReply(`No cards available for pack ${packCode}.`);
            
            const currentCards = await getUserCards(user.id);
            const updatedCards = [...currentCards, ...cards];
            await userCards.setIn(user.id, updatedCards);
            
            const allPacks = await getAllPacks();
            const packInfo = allPacks[packCode];
            const packName = packInfo ? packInfo.name : packCode;
            const cardsHTML = cards.map(card =>
                `<button class="button" name="send" value="/psgo show ${card.id}" style="margin: 2px;">` +
                `<img src="${card.images.small}" title="${card.name}" height="100" width="72"></button>`
            ).join('');
            
            return this.sendReplyBox(
                `<div style="margin-bottom: 10px;">You opened <b>${packName}</b> and got ${cards.length} cards:</div>` +
                `<div>${cardsHTML}</div>`
            );
        },
        openhelp: ['/psgo open [pack] - Open pack'],
        
        async packs(target, room, user) {
            const userPacksList = await getUserPacks(user.id);
            if (!userPacksList.length) return this.errorReply('You have no packs.');
            
            const packCounts: Record<string, number> = {};
            for (const pack of userPacksList) packCounts[pack] = (packCounts[pack] || 0) + 1;
            
            const allPacks = await getAllPacks();
            const packsHTML = Object.entries(packCounts).map(([code, count]) => {
                const pack = allPacks[code];
                const packName = pack ? pack.name : code;
                return `<div style="margin: 5px 0;">` +
                    `<button class="button" name="send" value="/psgo open ${code}">Open ${packName}</button> (${count} remaining)` +
                    `</div>`;
            }).join('');
            
            const credits = await getPackCredits(user.id);
            return this.sendReplyBox(
                `<div style="font-weight: bold; margin-bottom: 10px;">Your Unopened Packs</div>` +
                `${packsHTML}<div style="margin-top: 10px;">Pack Credits: ${credits}</div>`
            );
        },
        packshelp: ['/psgo packs - View your unopened packs'],
        
        async import(target, room, user) {
            const isManagerUser = await isManager(user.id);
            if (!isManagerUser) this.checkCan('roomowner');
            if (!target) return this.parse('/help psgo import');
            
            const parts = target.split(',').map(x => x.trim());
            if (parts.length < 2) {
                return this.errorReply('Usage: /psgo import [setId], [url], [packPrice], [packFlags]');
            }
            
            const [setId, url, priceStr, flags] = parts;
            const price = parseInt(priceStr) || 100;
            const inShop = flags?.includes('shop') ?? true;
            const creditPack = flags?.includes('credit') ?? false;
            
            try {
                this.sendReply('Fetching card data from URL...');
                
                // Fetch the JSON data
                const response = await fetch(url);
                if (!response.ok) {
                    return this.errorReply(`Failed to fetch data: ${response.status} ${response.statusText}`);
                }
                
                const jsonData = await response.json();
                if (!Array.isArray(jsonData)) {
                    return this.errorReply('Invalid JSON format. Expected an array of cards.');
                }
                
                // Import cards
                const result = await importCardsFromAPI(jsonData, setId);
                
                // Create pack definition if it doesn't exist
                const allPacks = await getAllPacks();
                if (!allPacks[setId] && jsonData.length > 0) {
                    const firstCard = jsonData[0];
                    allPacks[setId] = {
                        code: setId,
                        name: firstCard.set?.name || setId,
                        series: firstCard.set?.series || 'Unknown',
                        releaseDate: firstCard.set?.releaseDate || '2000-01-01',
                        price,
                        inShop,
                        creditPack
                    };
                    await saveAllPacks(allPacks);
                }
                
                this.modlog('PSGO IMPORT', null, `${setId}: ${result.added} added, ${result.updated} updated`);
                return this.sendReply(
                    `Import complete! Added: ${result.added}, Updated: ${result.updated}, Skipped: ${result.skipped} cards. ` +
                    `Pack "${setId}" ${allPacks[setId] ? 'updated' : 'created'}.`
                );
            } catch (e) {
                return this.errorReply(`Import failed: ${(e as Error).message}`);
            }
        },
        importhelp: [
            '/psgo import [setId], [url], [price], [flags] - Import cards from Pokemon TCG API JSON',
            'Example: /psgo import base1, https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/refs/heads/master/cards/en/base1.json, 100, shop'
        ],
        
        async addpack(target, room, user) {
            const isManagerUser = await isManager(user.id);
            if (!isManagerUser) this.checkCan('roomowner');
            if (!target) return this.parse('/help psgo addpack');
            
            const parts = target.split(',').map(x => x.trim());
            if (parts.length < 5) {
                return this.errorReply('Usage: /psgo addpack [code], [name], [series], [date], [price], [flags]');
            }
            
            const [code, name, series, releaseDate, priceStr, flags] = parts;
            const packCode = toID(code);
            const allPacks = await getAllPacks();
            
            if (allPacks[packCode]) return this.errorReply(`Pack ${packCode} already exists!`);
            
            const inShop = flags?.includes('shop') ?? false;
            const creditPack = flags?.includes('credit') ?? false;
            
            allPacks[packCode] = {
                code: packCode,
                name,
                series,
                releaseDate,
                price: parseInt(priceStr) || 0,
                inShop,
                creditPack
            };
            await saveAllPacks(allPacks);
            this.modlog('PSGO ADD PACK', null, packCode);
            return this.sendReply(`Added pack: ${name} (${packCode})`);
        },
        addpackhelp: ['/psgo addpack [code], [name], [series], [date], [price], [flags] - Add pack definition'],
        
        async editpack(target, room, user) {
            const isManagerUser = await isManager(user.id);
            if (!isManagerUser) this.checkCan('roomowner');
            if (!target) return this.parse('/help psgo editpack');
            
            const parts = target.split(',').map(x => x.trim());
            if (parts.length < 6) {
                return this.errorReply('Usage: /psgo editpack [code], [name], [series], [date], [price], [flags]');
            }
            
            const [code, name, series, releaseDate, priceStr, flags] = parts;
            const packCode = toID(code);
            const allPacks = await getAllPacks();
            const pack = allPacks[packCode];
            
            if (!pack) return this.errorReply(`Pack ${packCode} not found!`);
            
            allPacks[packCode] = {
                code: packCode,
                name,
                series,
                releaseDate,
                price: parseInt(priceStr) || 0,
                inShop: flags?.includes('shop') ?? false,
                creditPack: flags?.includes('credit') ?? false
            };
            await saveAllPacks(allPacks);
            this.modlog('PSGO EDIT PACK', null, packCode);
            return this.sendReply(`Edited pack: ${name}`);
        },
        editpackhelp: ['/psgo editpack [code], [name], [series], [date], [price], [flags] - Edit pack'],
        
        async deletepack(target, room, user) {
            const isManagerUser = await isManager(user.id);
            if (!isManagerUser) this.checkCan('roomowner');
            if (!target) return this.parse('/help psgo deletepack');
            
            const packCode = toID(target);
            const allPacks = await getAllPacks();
            if (!allPacks[packCode]) return this.errorReply('Pack not found.');
            
            const packName = allPacks[packCode].name;
            delete allPacks[packCode];
            await saveAllPacks(allPacks);
            this.modlog('PSGO DELETE PACK', null, packCode);
            return this.sendReply(`Deleted pack: ${packName}`);
        },
        deletepackhelp: ['/psgo deletepack [code] - Delete pack'],
        
        async delete(target, room, user) {
            const isManagerUser = await isManager(user.id);
            if (!isManagerUser) this.checkCan('roomowner');
            if (!target) return this.parse('/help psgo delete');
            
            const result = await getCardFromInput(target);
            if (!result) return this.errorReply('Card not found.');
            
            if (Array.isArray(result)) {
                let output = 'Multiple cards found. Please specify using full ID:\n';
                for (const c of result) {
                    output += `${c.name} - ${c.set.name} #${c.number} (ID: ${c.id})\n`;
                }
                return this.sendReply(output);
            }
            
            const card = result;
            const allCards = await getAllCards();
            delete allCards[card.id];
            await saveAllCards(allCards);
            this.modlog('PSGO DELETE CARD', null, card.id);
            return this.sendReply(`Deleted card: ${card.name}`);
        },
        deletehelp: ['/psgo delete [id] - Delete card'],
        
        async cleanup(target, room, user) {
            const isManagerUser = await isManager(user.id);
            if (!isManagerUser) this.checkCan('roomowner');
            
            const allCards = await getAllCards();
            const allPacks = await getAllPacks();
            
            let removedCards = 0;
            let removedPacks = 0;
            
            for (const cardId in allCards) {
                const card = allCards[cardId];
                if (!card.id || !card.name || card.id === 'undefined') {
                    delete allCards[cardId];
                    removedCards++;
                    this.sendReply(`Removed invalid card: ${cardId}`);
                }
            }
            
            for (const packCode in allPacks) {
                const pack = allPacks[packCode];
                if (!pack.code || !pack.name || pack.code === 'undefined') {
                    delete allPacks[packCode];
                    removedPacks++;
                    this.sendReply(`Removed invalid pack: ${packCode}`);
                }
            }
            
            if (removedCards > 0) await saveAllCards(allCards);
            if (removedPacks > 0) await saveAllPacks(allPacks);
            
            if (removedCards === 0 && removedPacks === 0) {
                return this.sendReply('No invalid entries found.');
            }
            
            this.modlog('PSGO CLEANUP', null, `${removedCards} cards, ${removedPacks} packs`);
            return this.sendReply(`Cleanup complete! Removed ${removedCards} invalid cards and ${removedPacks} invalid packs.`);
        },
        cleanuphelp: ['/psgo cleanup - Remove invalid/corrupted entries (requires manager or #)'],
        
        async manage(target, room, user) {
            if (!target) return this.parse('/help psgo manage');
            const [action, targetName, amountStr] = target.split(',').map(x => x.trim());
            
            switch (action.toLowerCase()) {
                case 'add':
                case 'addmanager':
                    this.checkCan('roomowner');
                    const addUser = Users.get(targetName);
                    if (!addUser) return this.errorReply(`User "${targetName}" not found.`);
                    const managersData = await managers.get() as any;
                    const managerList = managersData?.managers || [];
                    if (managerList.includes(addUser.id)) {
                        return this.errorReply(`${addUser.name} is already a manager.`);
                    }
                    managerList.push(addUser.id);
                    await managers.clear(true);
                    await managers.insert({ managers: managerList });
                    if (addUser.connected) addUser.popup(`You are now a PSGO manager!`);
                    this.modlog('PSGO MANAGER ADD', addUser);
                    return this.sendReply(`${addUser.name} is now a manager.`);
                    
                case 'remove':
                case 'removemanager':
                    this.checkCan('roomowner');
                    const managersData2 = await managers.get() as any;
                    const managerList2 = managersData2?.managers || [];
                    const idx = managerList2.indexOf(toID(targetName));
                    if (idx === -1) return this.errorReply(`${targetName} is not a manager.`);
                    managerList2.splice(idx, 1);
                    await managers.clear(true);
                    await managers.insert({ managers: managerList2 });
                    const removeUser = Users.get(targetName);
                    if (removeUser?.connected) removeUser.popup(`Your PSGO manager privileges were removed.`);
                    this.modlog('PSGO MANAGER REMOVE', removeUser || targetName as any);
                    return this.sendReply(`Removed ${targetName} as manager.`);
                    
                case 'list':
                case 'listmanagers':
                    if (!this.runBroadcast()) return;
                    const managersData3 = await managers.get() as any;
                    const managerList3 = managersData3?.managers || [];
                    if (!managerList3.length) return this.sendReplyBox('No managers.');
                    const managersHTML = managerList3.map((id: string) => Impulse.nameColor(id, true, true)).join(', ');
                    return this.sendReplyBox(`<b>PSGO Managers:</b><br>${managersHTML}`);
                    
                case 'credits':
                case 'addcredits':
                    const isManagerUser = await isManager(user.id);
                    if (!isManagerUser) this.checkCan('bypassall');
                    const credUser = Users.get(targetName);
                    if (!credUser) return this.errorReply(`User "${targetName}" not found.`);
                    const amount = parseInt(amountStr);
                    if (isNaN(amount) || amount <= 0) return this.errorReply('Invalid amount.');
                    await addPackCredits(credUser.id, amount);
                    if (credUser.connected) credUser.popup(`You received ${amount} pack credits!`);
                    this.modlog('PSGO CREDITS GIVE', credUser, `${amount} credits`);
                    return this.sendReply(`Gave ${amount} credits to ${credUser.name}.`);
                    
                case 'take':
                case 'takecard':
                    const isManagerUser2 = await isManager(user.id);
                    if (!isManagerUser2) this.checkCan('bypassall');
                    const takeUser = Users.get(targetName) || { name: targetName, id: toID(targetName), connected: false } as any;
                    const result = await getCardFromInput(amountStr || '');
                    if (!result) return this.errorReply('Card not found.');
                    
                    if (Array.isArray(result)) {
                        let output = 'Multiple cards found. Please specify using full ID:\n';
                        for (const c of result) {
                            output += `${c.name} - ${c.set.name} #${c.number} (ID: ${c.id})\n`;
                        }
                        return this.sendReply(output);
                    }
                    
                    const takeCardObj = result;
                    const success = await takeCard(takeUser.id, takeCardObj.id);
                    if (!success) return this.errorReply(`${takeUser.name} doesn't have that card.`);
                    if (takeUser.connected) takeUser.popup(`Your ${takeCardObj.name} was taken by an admin.`);
                    this.modlog('PSGO TAKE', takeUser as any, `card: ${takeCardObj.id}`);
                    return this.sendReply(`Took ${takeCardObj.name} from ${takeUser.name}.`);
                    
                default:
                    return this.errorReply('Usage: /psgo manage [add|remove|list|credits|take], [user], [amount/card]');
            }
        },
        managehelp: [
            '/psgo manage add, [user] - Add manager (requires ~, &)',
            '/psgo manage remove, [user] - Remove manager (requires ~, &)',
            '/psgo manage list - List managers',
            '/psgo manage credits, [user], [amount] - Give credits (requires manager)',
            '/psgo manage take, [user], [card] - Take card (requires manager)'
        ],
        
        async set(target, room, user) {
            if (!target) return this.parse('/help psgo set');
            const [setting, value] = target.split(',').map(x => x.trim());
            const settings = await userSettings.getIn(user.id, {});
            
            switch (setting.toLowerCase()) {
                case 'transfers':
                    const enabled = toID(value) === 'on';
                    settings.transfersEnabled = enabled;
                    await userSettings.setIn(user.id, settings);
                    return this.sendReply(`Card transfers ${enabled ? 'enabled' : 'disabled'}.`);
                    
                case 'sort':
                case 'sorting':
                    const validSorts = ['rarity', 'points', 'types', 'name', 'date'];
                    const sortType = toID(value);
                    if (!validSorts.includes(sortType)) {
                        return this.errorReply(`Invalid sort. Valid: ${validSorts.join(', ')}`);
                    }
                    settings.showcaseSort = sortType as any;
                    await userSettings.setIn(user.id, settings);
                    return this.sendReply(`Collection sort set to ${sortType}.`);
                    
                default:
                    return this.errorReply('Available settings: transfers [on/off], sort [rarity/points/types/name/date]');
            }
        },
        sethelp: ['/psgo set [setting], [value] - Configure transfers, sorting, etc.'],
        
        help(target, room, user) {
            if (!this.runBroadcast()) return;
            const page = toID(target) || 'main';
            
            let output = '';
            switch (page) {
                case 'main':
                case '':
                    output = `<div class="ladder pad"><h2>PSGO Card System Help (Pokemon TCG API)</h2>` +
                        `<p><strong>Navigation:</strong></p>` +
                        `<button class="button" name="send" value="/psgo help user">User Commands</button>` +
                        `<button class="button" name="send" value="/psgo help admin">Admin Commands</button>` +
                        `<button class="button" name="send" value="/psgo help import">Import Guide</button>` +
                        `<button class="button" name="send" value="/psgo help settings">Settings</button>` +
                        `<hr>` +
                        `<p><strong>Quick Start:</strong></p>` +
                        `<ul>` +
                        `<li>Use <code>/psgo shop</code> to browse packs</li>` +
                        `<li>Use <code>/psgo buy [pack]</code> to purchase packs</li>` +
                        `<li>Use <code>/psgo open [pack]</code> to open packs</li>` +
                        `<li>Use <code>/psgo collection</code> to view your cards</li>` +
                        `<li>Use <code>/psgo transfer [user], [card]</code> to trade cards</li>` +
                        `</ul>` +
                        `<p><strong>New in this version:</strong> Uses official Pokemon TCG API data format with enhanced card details!</p>` +
                        `</div>`;
                    break;
                    
                case 'user':
                case '1':
                    output = `<div class="ladder pad"><h2>PSGO Card System Help</h2>` +
                        `<h3>User Commands</h3>` +
                        `<table style="width: 100%; border-collapse: collapse;">` +
                        `<tr><th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Command</th>` +
                        `<th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Usage</th></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo show</code></td>` +
                        `<td style="padding: 8px;">/psgo show base1-4<br>/psgo show base1-charizard</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo transfer</code></td>` +
                        `<td style="padding: 8px;">/psgo transfer username, base1-4<br>/psgo transfer base1-4, username</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo collection</code></td>` +
                        `<td style="padding: 8px;">/psgo collection<br>/psgo collection username<br>/psgo collection username, 2, points</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo ladder</code></td>` +
                        `<td style="padding: 8px;">View points leaderboard</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo cards</code></td>` +
                        `<td style="padding: 8px;">/psgo cards<br>/psgo cards set:base1<br>/psgo cards rarity:holo<br>/psgo cards charizard</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo shop</code></td>` +
                        `<td style="padding: 8px;">View available packs</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo buy</code></td>` +
                        `<td style="padding: 8px;">/psgo buy base1</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo open</code></td>` +
                        `<td style="padding: 8px;">/psgo open base1</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo packs</code></td>` +
                        `<td style="padding: 8px;">View your unopened packs</td></tr>` +
                        `</table>` +
                        `<p><button class="button" name="send" value="/psgo help">Back to Main</button></p>` +
                        `</div>`;
                    break;
                    
                case 'admin':
                case '2':
                    output = `<div class="ladder pad"><h2>PSGO Card System Help</h2>` +
                        `<h3>Admin Commands</h3>` +
                        `<table style="width: 100%; border-collapse: collapse;">` +
                        `<tr><th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Command</th>` +
                        `<th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Usage</th></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo give</code></td>` +
                        `<td style="padding: 8px;">/psgo give username, base1-4<br>/psgo give base1-4, username</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo import</code></td>` +
                        `<td style="padding: 8px;">/psgo import base1, [url], 100, shop<br>Import cards from Pokemon TCG API JSON</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo addpack</code></td>` +
                        `<td style="padding: 8px;">/psgo addpack base1, Base Set, Gen 1, 1999-01-09, 100, shop</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo editpack</code></td>` +
                        `<td style="padding: 8px;">/psgo editpack base1, Base Set, Gen 1, 1999-01-09, 150, shop</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo deletepack</code></td>` +
                        `<td style="padding: 8px;">/psgo deletepack base1</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo delete</code></td>` +
                        `<td style="padding: 8px;">/psgo delete base1-4<br>Delete individual card</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo cleanup</code></td>` +
                        `<td style="padding: 8px;">Remove invalid/corrupted entries</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo manage</code></td>` +
                        `<td style="padding: 8px;">/psgo manage add, username<br>/psgo manage remove, username<br>/psgo manage list<br>/psgo manage credits, username, 5<br>/psgo manage take, username, base1-4</td></tr>` +
                        `</table>` +
                        `<p><button class="button" name="send" value="/psgo help">Back to Main</button></p>` +
                        `</div>`;
                    break;
                    
                case 'import':
                case '3':
                    output = `<div class="ladder pad"><h2>PSGO Card System - Import Guide</h2>` +
                        `<h3>Importing from Pokemon TCG API</h3>` +
                        `<p>This system uses the official Pokemon TCG API data format from:</p>` +
                        `<p><code>https://github.com/PokemonTCG/pokemon-tcg-data</code></p>` +
                        `<h4>Step-by-Step Import:</h4>` +
                        `<ol>` +
                        `<li>Find the set you want at: <code>https://github.com/PokemonTCG/pokemon-tcg-data/tree/master/cards/en</code></li>` +
                        `<li>Get the raw JSON URL (e.g., <code>https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/refs/heads/master/cards/en/base1.json</code>)</li>` +
                        `<li>Use the import command: <code>/psgo import base1, [url], 100, shop</code></li>` +
                        `</ol>` +
                        `<h4>Import Examples:</h4>` +
                        `<pre>/psgo import base1, https://raw.githubusercontent.com/.../base1.json, 100, shop</pre>` +
                        `<pre>/psgo import jungle, https://raw.githubusercontent.com/.../jungle.json, 150, shop,credit</pre>` +
                        `<h4>Pack Flags:</h4>` +
                        `<ul>` +
                        `<li><code>shop</code> - Available for purchase with coins</li>` +
                        `<li><code>credit</code> - Available for purchase with pack credits</li>` +
                        `<li><code>shop,credit</code> - Available for both</li>` +
                        `</ul>` +
                        `<h4>What Gets Imported:</h4>` +
                        `<ul>` +
                        `<li>Card ID, name, HP, types, attacks</li>` +
                        `<li>Rarity, set info, card number</li>` +
                        `<li>Images (small and large)</li>` +
                        `<li>Subtypes (EX, GX, VMAX, etc.)</li>` +
                        `<li>Artist, flavor text, Pokedex numbers</li>` +
                        `</ul>` +
                        `<h4>Rarity Conversion:</h4>` +
                        `<p>API rarities are automatically converted:</p>` +
                        `<ul>` +
                        `<li><strong>Common</strong> → Common (1 pt)</li>` +
                        `<li><strong>Uncommon</strong> → Uncommon (3 pts)</li>` +
                        `<li><strong>Rare/Rare Holo</strong> → Rare (6-8 pts)</li>` +
                        `<li><strong>Rare Holo VMAX/VSTAR</strong> → Ultra Rare (15 pts)</li>` +
                        `<li><strong>Amazing/Radiant/Shining</strong> → Legendary (14 pts)</li>` +
                        `<li><strong>Secret/Rainbow/Ultra</strong> → Mythic (18 pts)</li>` +
                        `</ul>` +
                        `<p><button class="button" name="send" value="/psgo help">Back to Main</button></p>` +
                        `</div>`;
                    break;
                    
                case 'settings':
                case '4':
                    output = `<div class="ladder pad"><h2>PSGO Card System Help</h2>` +
                        `<h3>Settings Commands</h3>` +
                        `<table style="width: 100%; border-collapse: collapse;">` +
                        `<tr><th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Command</th>` +
                        `<th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Usage</th></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo set transfers</code></td>` +
                        `<td style="padding: 8px;">/psgo set transfers, on<br>/psgo set transfers, off</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo set sort</code></td>` +
                        `<td style="padding: 8px;">/psgo set sort, rarity<br>/psgo set sort, points<br>/psgo set sort, types<br>/psgo set sort, name<br>/psgo set sort, date</td></tr>` +
                        `</table>` +
                        `<p><button class="button" name="send" value="/psgo help">Back to Main</button></p>` +
                        `</div>`;
                    break;
                    
                default:
                    output = `<div class="ladder pad"><h2>PSGO Card System Help</h2>` +
                        `<p>Invalid help page. Use <code>/psgo help</code> to see available sections.</p>` +
                        `<p><button class="button" name="send" value="/psgo help">Back to Main</button></p>` +
                        `</div>`;
            }
            return this.sendReplyBox(output);
        },
    },
    
    showcase(target, room, user) {
        if (!this.runBroadcast()) return;
        return this.parse(`/psgo collection ${target}`);
    },
    showcasehelp: ['/showcase [user] - View card collection'],
    
    cardladder(target, room, user) {
        if (!this.runBroadcast()) return;
        return this.parse('/psgo ladder');
    },
    cardladderhelp: ['/cardladder - View points leaderboard'],
    
    openpack(target, room, user) {
        if (!this.runBroadcast()) return;
        return this.parse(`/psgo open ${target}`);
    },
    openpackhelp: ['/openpack [pack] - Open pack'],
};
