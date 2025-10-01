/**
 * Pokemon Showdown
 * PSGO Collectable Pokemon Cards System
 * Complete Implementation - Base Set (1999) to Scarlet & Violet (2025)
 * Supports all official Pokemon TCG rarities and mechanics
 * @license MIT
 */

// ================ Configuration ================
const CARDS_PER_PACK = 10;
const CURRENCY = Impulse.currency || 'coins';

// ================ Type Definitions ================

// Complete rarity system covering all TCG eras
type CardRarity = 
    // Base rarities (1999-present)
    | 'Common'
    | 'Uncommon'
    | 'Rare'
    | 'Rare Holo'
    
    // EX Era rarities (2003-2007)
    | 'Rare Holo EX'
    | 'Rare Holo Star'
    | 'Rare Holo LV.X'
    
    // Prime/Legend Era rarities (2009-2011)
    | 'Rare Prime'
    | 'Rare LEGEND'
    
    // BW/XY Era rarities (2011-2016)
    | 'Rare ACE'
    | 'Rare BREAK'
    | 'Rare Holo GX'
    | 'Rare Secret'
    | 'Rare Ultra'
    | 'Rare Rainbow'
    
    // Sun & Moon additions (2017-2019)
    | 'Rare Shiny'
    | 'Rare Shiny GX'
    
    // Sword & Shield Era rarities (2020-2023)
    | 'Rare Holo V'
    | 'Rare Holo VMAX'
    | 'Rare Holo VSTAR'
    | 'Amazing Rare'
    | 'Radiant Rare'
    | 'Trainer Gallery Rare Holo'
    
    // Scarlet & Violet Era rarities (2023-present)
    | 'Illustration Rare'
    | 'Special Illustration Rare'
    | 'Hyper Rare'
    | 'Ultra Rare'
    | 'Double Rare'
    
    // Special/Promo rarities
    | 'Promo'
    | 'Rare Shining'
    | 'Classic';

interface Card {
    id: string;
    name: string;
    nameId: string;
    image: string;
    rarity: CardRarity;
    set: string;
    setId: string;
    cardNumber: string;
    types: string;
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

// ================ Database Collections ================
const userCards = DB.userCards;
const userPacks = DB.userPacks;
const packCredits = DB.packCredits;
const managers = DB.managers;
const userSettings = DB.userSettings;
const cardDefinitions = DB.cached.cardDefinitions;
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

// ================ Rarity & Point System ================

const RARITY_POINTS: Record<CardRarity, number> = {
    // Common tier (1 point)
    'Common': 1,
    
    // Uncommon tier (3 points)
    'Uncommon': 3,
    
    // Rare tier (5-6 points)
    'Rare': 5,
    'Rare Holo': 6,
    'Promo': 5,
    
    // Special Rare tier (7-8 points)
    'Rare ACE': 7,
    'Rare BREAK': 7,
    'Rare Prime': 8,
    
    // EX/GX tier (9-11 points)
    'Rare Holo EX': 9,
    'Rare Holo GX': 10,
    'Rare Holo LV.X': 9,
    
    // V/VMAX tier (10-12 points)
    'Rare Holo V': 10,
    'Rare Holo VMAX': 12,
    'Rare Holo VSTAR': 12,
    'Double Rare': 10,
    
    // Ultra Rare tier (13-15 points)
    'Rare Ultra': 13,
    'Ultra Rare': 13,
    'Rare Secret': 14,
    'Rare Rainbow': 15,
    
    // Amazing/Radiant tier (16-17 points)
    'Amazing Rare': 16,
    'Radiant Rare': 16,
    'Trainer Gallery Rare Holo': 15,
    
    // Illustration tier (17-18 points)
    'Illustration Rare': 17,
    'Special Illustration Rare': 18,
    
    // Legendary tier (19-20 points)
    'Rare Holo Star': 19,
    'Rare LEGEND': 19,
    'Rare Shining': 20,
    'Rare Shiny': 18,
    'Rare Shiny GX': 20,
    
    // Hyper/Mythic tier (21-25 points)
    'Hyper Rare': 22,
    'Classic': 25,
};

const RARITY_COLORS: Record<CardRarity, string> = {
    // Common tier
    'Common': '#6B7280',
    
    // Uncommon tier
    'Uncommon': '#10B981',
    
    // Rare tier
    'Rare': '#3B82F6',
    'Rare Holo': '#6366F1',
    'Promo': '#8B5CF6',
    
    // Special Rare tier
    'Rare ACE': '#EC4899',
    'Rare BREAK': '#F59E0B',
    'Rare Prime': '#10B981',
    
    // EX/GX tier
    'Rare Holo EX': '#F59E0B',
    'Rare Holo GX': '#EF4444',
    'Rare Holo LV.X': '#DC2626',
    
    // V/VMAX tier
    'Rare Holo V': '#06B6D4',
    'Rare Holo VMAX': '#8B5CF6',
    'Rare Holo VSTAR': '#A855F7',
    'Double Rare': '#14B8A6',
    
    // Ultra Rare tier
    'Rare Ultra': '#7C3AED',
    'Ultra Rare': '#7C3AED',
    'Rare Secret': '#4F46E5',
    'Rare Rainbow': '#EC4899',
    
    // Amazing/Radiant tier
    'Amazing Rare': '#F59E0B',
    'Radiant Rare': '#EAB308',
    'Trainer Gallery Rare Holo': '#06B6D4',
    
    // Illustration tier
    'Illustration Rare': '#F97316',
    'Special Illustration Rare': '#EA580C',
    
    // Legendary tier
    'Rare Holo Star': '#FFD700',
    'Rare LEGEND': '#D97706',
    'Rare Shining': '#C0C0C0',
    'Rare Shiny': '#E5E7EB',
    'Rare Shiny GX': '#F3F4F6',
    
    // Hyper/Mythic tier
    'Hyper Rare': '#FF1493',
    'Classic': '#FFD700',
};

const SPECIAL_SUBTYPES: Record<string, { color: string; glow: boolean }> = {
    // +2 Point Subtypes
    'Break': { color: '#FF4500', glow: true },
    
    // +3 Point Subtypes
    'EX': { color: '#FFD700', glow: true },
    'GX': { color: '#FF6B35', glow: true },
    'V': { color: '#00D4AA', glow: true },
    'ex': { color: '#FFB347', glow: true },
    'MEGA': { color: '#8B008B', glow: true },
    'LV.X': { color: '#DC143C', glow: true },
    'Radiant': { color: '#FF1493', glow: true },
    'Amazing': { color: '#FFD700', glow: true },
    
    // +4 Point Subtypes
    'Legend': { color: '#B8860B', glow: true },
    'Prime': { color: '#32CD32', glow: true },
    'Shining': { color: '#C0C0C0', glow: true },
    '★': { color: '#FFD700', glow: true },
    
    // +5 Point Subtypes
    'VMAX': { color: '#FF1493', glow: true },
    'VSTAR': { color: '#9932CC', glow: true },
    
    // +6 Point Subtypes
    'Tag Team': { color: '#4169E1', glow: true },
};

// ================ Utility Functions ================

function toID(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function makeCardId(setId: string, cardNumber: string): string {
    return `${setId}-${cardNumber}`;
}

function makeCardNameId(setId: string, cardName: string): string {
    return `${setId}-${toID(cardName)}`;
}

function getSubtypeBonus(types: string): number {
    if (!types) return 0;
    const t = types.toUpperCase();
    
    // Check in order of specificity
    if (t.includes('TAG TEAM')) return 6;
    if (t.includes('VMAX')) return 5;
    if (t.includes('VSTAR')) return 5;
    if (t.includes('LEGEND')) return 4;
    if (t.includes('PRIME')) return 4;
    if (t.includes('SHINING')) return 4;
    if (t.includes('★')) return 4;
    if (t.includes('GX')) return 3;
    if (t.includes('EX') || t.includes(' EX')) return 3;
    if (t.includes('V ') || t.endsWith(' V')) return 3;
    if (t.includes('MEGA') || t.startsWith('M ')) return 3;
    if (t.includes('LV.X')) return 3;
    if (t.includes('RADIANT')) return 3;
    if (t.includes('AMAZING')) return 3;
    if (t.includes('BREAK')) return 2;
    
    return 0;
}

function getCardPoints(card: Card): number {
    const base = RARITY_POINTS[card.rarity] || 5;
    return base + getSubtypeBonus(card.types);
}

function parseCardTypes(types: string): { baseTypes: string; subtype: string | null } {
    if (!types) return { baseTypes: '', subtype: null };
    const parts = types.split(' - ');
    return { baseTypes: parts[0] || types, subtype: parts[1] || null };
}

function formatCardTypes(types: string): string {
    if (!types) return 'Unknown';
    const { baseTypes, subtype } = parseCardTypes(types);
    if (!subtype) return baseTypes;
    const conf = SPECIAL_SUBTYPES[subtype];
    if (conf) {
        const style = `color: ${conf.color}; font-weight: bold;${conf.glow ? ' text-shadow: 0 0 8px ' + conf.color + '80;' : ''}`;
        return `${baseTypes} - <span style="${style}">${subtype}</span>`;
    }
    return `${baseTypes} - <span style="font-weight: bold;">${subtype}</span>`;
}

function getRarityTier(rarity: CardRarity): string {
    const points = RARITY_POINTS[rarity];
    if (points >= 22) return 'Hyper';
    if (points >= 19) return 'Legendary';
    if (points >= 17) return 'Illustration';
    if (points >= 16) return 'Amazing';
    if (points >= 13) return 'Ultra Rare';
    if (points >= 10) return 'V Series';
    if (points >= 9) return 'EX/GX';
    if (points >= 7) return 'Special Rare';
    if (points >= 5) return 'Rare';
    if (points >= 3) return 'Uncommon';
    return 'Common';
}

// ================ Card Lookup Functions ================

async function getCardById(cardId: string): Promise<Card | null> {
    const allCards = await getAllCards();
    return allCards[cardId] || null;
}

function getCardByIdSync(cardId: string): Card | null {
    const allCards = getAllCardsSync();
    return allCards[cardId] || null;
}

async function getCardByNameId(nameId: string): Promise<Card[]> {
    const allCards = await getAllCards();
    const matches: Card[] = [];
    for (const cardId in allCards) {
        if (allCards[cardId].nameId === nameId) {
            matches.push(allCards[cardId]);
        }
    }
    return matches;
}

function getCardByNameIdSync(nameId: string): Card[] {
    const allCards = getAllCardsSync();
    const matches: Card[] = [];
    for (const cardId in allCards) {
        if (allCards[cardId].nameId === nameId) {
            matches.push(allCards[cardId]);
        }
    }
    return matches;
}

async function getCardFromInput(input: string): Promise<Card | Card[] | null> {
    if (!input || !input.includes('-')) return null;
    const byId = await getCardById(input);
    if (byId) return byId;
    const byNameId = await getCardByNameId(input);
    return byNameId.length > 0 ? (byNameId.length === 1 ? byNameId[0] : byNameId) : null;
}

function getCardFromInputSync(input: string): Card | Card[] | null {
    if (!input || !input.includes('-')) return null;
    const byId = getCardByIdSync(input);
    if (byId) return byId;
    const byNameId = getCardByNameIdSync(input);
    return byNameId.length > 0 ? (byNameId.length === 1 ? byNameId[0] : byNameId) : null;
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

// ================ Pack Opening System ================

async function makePack(setId: string): Promise<CardInstance[]> {
    const out: CardInstance[] = [];
    const allCards = await getAllCards();
    const packCards = Object.values(allCards).filter(c => c.setId === setId);
    if (!packCards.length) return out;

    // Separate cards by rarity tier for realistic distribution
    const cardsByRarity: Record<string, Card[]> = {};
    
    // Group by general rarity tiers
    const commonTier = ['Common'];
    const uncommonTier = ['Uncommon'];
    const rareTier = ['Rare', 'Rare Holo', 'Promo'];
    const specialRareTier = ['Rare ACE', 'Rare BREAK', 'Rare Prime'];
    const exGxTier = ['Rare Holo EX', 'Rare Holo GX', 'Rare Holo LV.X'];
    const vTier = ['Rare Holo V', 'Rare Holo VMAX', 'Rare Holo VSTAR', 'Double Rare'];
    const ultraRareTier = ['Rare Ultra', 'Ultra Rare', 'Rare Secret', 'Rare Rainbow'];
    const amazingTier = ['Amazing Rare', 'Radiant Rare', 'Trainer Gallery Rare Holo'];
    const illustrationTier = ['Illustration Rare', 'Special Illustration Rare'];
    const legendaryTier = ['Rare Holo Star', 'Rare LEGEND', 'Rare Shining', 'Rare Shiny', 'Rare Shiny GX'];
    const hyperTier = ['Hyper Rare', 'Classic'];
    
    cardsByRarity['Common'] = packCards.filter(c => commonTier.includes(c.rarity));
    cardsByRarity['Uncommon'] = packCards.filter(c => uncommonTier.includes(c.rarity));
    cardsByRarity['Rare'] = packCards.filter(c => rareTier.includes(c.rarity));
    cardsByRarity['Special Rare'] = packCards.filter(c => specialRareTier.includes(c.rarity));
    cardsByRarity['EX/GX'] = packCards.filter(c => exGxTier.includes(c.rarity));
    cardsByRarity['V Series'] = packCards.filter(c => vTier.includes(c.rarity));
    cardsByRarity['Ultra Rare'] = packCards.filter(c => ultraRareTier.includes(c.rarity));
    cardsByRarity['Amazing'] = packCards.filter(c => amazingTier.includes(c.rarity));
    cardsByRarity['Illustration'] = packCards.filter(c => illustrationTier.includes(c.rarity));
    cardsByRarity['Legendary'] = packCards.filter(c => legendaryTier.includes(c.rarity));
    cardsByRarity['Hyper'] = packCards.filter(c => hyperTier.includes(c.rarity));

    // Standard pack: 6 Commons, 3 Uncommons, 1 Rare or better
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

    // Rare slot with weighted distribution
    // Rare: 65%, Special Rare: 12%, EX/GX/V: 10%, Ultra: 7%, Amazing/Illustration: 3%, Legendary: 2%, Hyper: 1%
    const rareRoll = Math.random() * 100;
    let selectedTier: string;
    
    if (rareRoll < 1) {
        selectedTier = 'Hyper';
    } else if (rareRoll < 3) {
        selectedTier = 'Legendary';
    } else if (rareRoll < 6) {
        selectedTier = Math.random() < 0.5 ? 'Amazing' : 'Illustration';
    } else if (rareRoll < 13) {
        selectedTier = 'Ultra Rare';
    } else if (rareRoll < 23) {
        selectedTier = Math.random() < 0.5 ? 'EX/GX' : 'V Series';
    } else if (rareRoll < 35) {
        selectedTier = 'Special Rare';
    } else {
        selectedTier = 'Rare';
    }

    // Try selected tier, fall back to next available
    const tierFallback = ['Hyper', 'Legendary', 'Illustration', 'Amazing', 'Ultra Rare', 'V Series', 'EX/GX', 'Special Rare', 'Rare', 'Uncommon', 'Common'];
    const startIdx = tierFallback.indexOf(selectedTier);
    
    for (let i = startIdx; i < tierFallback.length; i++) {
        if (cardsByRarity[tierFallback[i]].length > 0) {
            const randomCard = cardsByRarity[tierFallback[i]][Math.floor(Math.random() * cardsByRarity[tierFallback[i]].length)];
            out.push({ ...randomCard, obtainedAt: Date.now() });
            break;
        }
    }

    return out;
}

// ================ User Data Functions ================

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

/*
* For Tournament To Give Card
*/
function randomGiveCardWeightedSync(userid: string, isWinner: boolean = false): { success: boolean; packName?: string; cardName?: string } {
    const allCards = getAllCardsSync();
    const allPacks = getAllPacksSync();
    const availableCards = Object.values(allCards);
    
    if (availableCards.length === 0) {
        return { success: false };
    }
    
    let selectedCard: Card;
    
    if (isWinner) {
        // Winner gets much better chances at rare cards
        const rareCards = availableCards.filter(card => getCardPoints(card) >= 13); // Ultra Rare and above
        const goodCards = availableCards.filter(card => getCardPoints(card) >= 9 && getCardPoints(card) < 13); // EX/GX/V tier
        const commonCards = availableCards.filter(card => getCardPoints(card) < 9);
        
        const roll = Math.random() * 100;
        if (roll < 25 && rareCards.length > 0) {
            // 25% chance for Ultra Rare+ (13+ points)
            selectedCard = rareCards[Math.floor(Math.random() * rareCards.length)];
        } else if (roll < 60 && goodCards.length > 0) {
            // 35% chance for EX/GX/V tier (9-12 points)
            selectedCard = goodCards[Math.floor(Math.random() * goodCards.length)];
        } else {
            // 40% chance for common cards
            selectedCard = commonCards.length > 0 ? 
                commonCards[Math.floor(Math.random() * commonCards.length)] :
                availableCards[Math.floor(Math.random() * availableCards.length)];
        }
    } else {
        // Runner-up gets slightly better chances than completely random
        const rareCards = availableCards.filter(card => getCardPoints(card) >= 13);
        const goodCards = availableCards.filter(card => getCardPoints(card) >= 9 && getCardPoints(card) < 13);
        const commonCards = availableCards.filter(card => getCardPoints(card) < 9);
        
        const roll = Math.random() * 100;
        if (roll < 8 && rareCards.length > 0) {
            // 8% chance for Ultra Rare+ (13+ points)
            selectedCard = rareCards[Math.floor(Math.random() * rareCards.length)];
        } else if (roll < 25 && goodCards.length > 0) {
            // 17% chance for EX/GX/V tier (9-12 points)
            selectedCard = goodCards[Math.floor(Math.random() * goodCards.length)];
        } else {
            // 75% chance for common cards
            selectedCard = commonCards.length > 0 ? 
                commonCards[Math.floor(Math.random() * commonCards.length)] :
                availableCards[Math.floor(Math.random() * availableCards.length)];
        }
    }
    
    const cardInstance: CardInstance = { ...selectedCard, obtainedAt: Date.now() };
    userCards.pushInSync(userid, cardInstance);
    
    // Get pack name
    const packInfo = allPacks[selectedCard.setId];
    const packName = packInfo ? packInfo.name : selectedCard.set;
    
    return { 
        success: true, 
        packName: packName,
        cardName: selectedCard.name 
    };
}

Impulse.randomGiveCardWeightedSync = randomGiveCardWeightedSync;

/*
* Tournament Ends
*/

// ================ Display Functions ================

function displayCard(card: Card): string {
    const points = getCardPoints(card);
    const formattedTypes = formatCardTypes(card.types);
    const { subtype } = parseCardTypes(card.types);
    const rarityColor = RARITY_COLORS[card.rarity] || '#6366F1';
    
    const borderColor = (subtype && SPECIAL_SUBTYPES[subtype]) ? SPECIAL_SUBTYPES[subtype].color : rarityColor;
    const glowEffect = (subtype && SPECIAL_SUBTYPES[subtype]?.glow) ? `box-shadow: 0 0 12px ${borderColor}50;` : '';
    
    return `<div style="border: 2px solid ${borderColor}; ${glowEffect} border-radius: 8px; padding: 16px; overflow: hidden;">` +
        `<table style="width: 100%; border-collapse: collapse;"><tr>` +
        `<td style="width: 210px; vertical-align: top; padding-right: 24px;">` +
        `<img src="${card.image}" alt="${card.name}" width="200" style="display: block; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">` +
        `</td>` +
        `<td style="vertical-align: top; line-height: 1.7;">` +
        `<div style="font-size: 2em; font-weight: bold; margin-bottom: 8px;">${card.name}</div>` +
        `<div style="color: ${rarityColor}; font-weight: bold; font-size: 1.2em; margin-bottom: 20px;">${card.rarity}</div>` +
        `<div style="margin-bottom: 10px;"><strong>Set:</strong> ${card.set} #${card.cardNumber}</div>` +
        `<div style="margin-bottom: 10px;"><strong>ID:</strong> ${card.id}</div>` +
        `<div style="margin-bottom: 10px;"><strong>Types:</strong> ${formattedTypes}</div>` +
        `<div style="margin-top: 16px; font-size: 1.1em;"><strong>Points:</strong> ${points}${getSubtypeBonus(card.types) > 0 ? ` <span style="color: #4caf50;">(+${getSubtypeBonus(card.types)})</span>` : ''}</div>` +
        `</td>` +
        `</tr></table>` +
        `</div>`;
}

// ================ COMMANDS ================
export const commands: Chat.Commands = {
    psgo: {
        async show(target, room, user) {
            if (!this.runBroadcast()) return;
            if (!target) return this.parse('/help psgo show');
            const result = await getCardFromInput(target);
            if (!result) return this.errorReply('Card not found. Use format: setId-cardNumber or setId-cardName');
    
            if (Array.isArray(result)) {
                // Multiple cards found with same name
                let output = '<div style="padding: 10px;">';
                output += `<h3>Multiple cards found for "${target}"</h3>`;
                output += '<p>Please select one:</p>';
                for (const card of result) {
                    output += `<div style="margin: 5px 0;">`;
                    output += `<button class="button" name="send" value="/psgo show ${card.id}">${card.name} - ${card.set} #${card.cardNumber}</button>`;
                    output += `</div>`;
                }
                output += '</div>';
                return this.sendReplyBox(output);
            }
            return this.sendReplyBox(displayCard(result));
        },
        
        showhelp: ['/psgo show [setId-cardNumber|setId-cardName] - Show card details'],
        
        confirmgive: 'give',
        async give(target, room, user, connection, cmd) {
            // ADMIN/MANAGER ONLY - Give any card to any user
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
            if (!result) return this.errorReply('Card not found. Use format: setId-cardNumber or setId-cardName');
            
            if (Array.isArray(result)) {
                let output = '<div style="padding: 10px;">';
                output += `<h3>Multiple cards found for "${cardInput}"</h3>`;
                output += '<p>Please specify using the full ID (setId-cardNumber):</p>';
                for (const c of result) {
                    output += `<div style="margin: 5px 0;">${c.name} - ${c.set} #${c.cardNumber} (ID: ${c.id})</div>`;
                }
                output += '</div>';
                return this.sendReplyBox(output);
            }
            
            const card = result;

            await giveCard(targetUser.id, card.id);
            if (targetUser.connected) {
                targetUser.popup(`|html|You received <b>${card.name}</b> from ${user.name}!`);
            }
            this.modlog('PSGO GIVE', targetUser, `card: ${card.id}`);
            return this.sendReply(`Gave ${card.name} to ${targetUser.name}.`);
        },
        
        givehelp: ['/psgo give [user], [card] - Give any card to user (requires manager or &)'],

        confirmtransfer: 'transfer',
        async transfer(target, room, user, connection, cmd) {
            // REGULAR USERS - Transfer owned cards
            if (!target) return this.parse('/help psgo transfer');
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
                return this.errorReply('Usage: /psgo transfer [user], [card] OR /psgo transfer [card], [user]');
            }
            
            const targetUser = Users.get(targetName);
            if (!targetUser) return this.errorReply(`User "${targetName}" not found.`);
            if (!targetUser.named) return this.errorReply('Guests cannot receive cards.');
            if (targetUser.id === user.id) return this.errorReply('You cannot transfer cards to yourself.');

            // Check if target allows transfers
            const settings = await userSettings.getIn(targetUser.id);
            if (settings?.transfersEnabled === false) {
                return this.errorReply(`${targetUser.name} has disabled card transfers.`);
            }

            const result = await getCardFromInput(cardInput);
            if (!result) return this.errorReply('Card not found. Use format: setId-cardNumber or setId-cardName');

            if (Array.isArray(result)) {
                let output = '<div style="padding: 10px;">';
                output += `<h3>Multiple cards found for "${cardInput}"</h3>`;
                output += '<p>Please specify using the full ID (setId-cardNumber):</p>';
                for (const c of result) {
                    output += `<div style="margin: 5px 0;">${c.name} - ${c.set} #${c.cardNumber} (ID: ${c.id})</div>`;
                }
                output += '</div>';
                return this.sendReplyBox(output);
            }

            const card = result;

            // Check if user owns the card
            const userHasCard = await hasCard(user.id, card.id);
            if (!userHasCard) return this.errorReply('You do not have that card.');

            // Confirmation step
            if (cmd !== 'confirmtransfer') {
                return this.popupReply(
                    `|html|<center><button class="button" name="send" value="/psgo confirmtransfer ${targetUser.id}, ${card.id}" style="padding: 15px 30px; font-size: 14px; border-radius: 8px;">` +
                    `Confirm transfer ${card.name} to<br><b style="color: ${Impulse.hashColor(targetUser.id)}">${Chat.escapeHTML(targetUser.name)}</b>` +
                    `</button></center>`
                );
            }

            // Execute transfer
            const success = await takeCard(user.id, card.id);
            if (!success) return this.errorReply('Transfer failed. Please try again.');
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
                    sortedCards.sort((a, b) => (a.types || '').localeCompare(b.types || ''));
                    break;
                case 'name':
                    sortedCards.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                case 'date':
                    sortedCards.sort((a, b) => (b.obtainedAt || 0) - (a.obtainedAt || 0));
                    break;
                default: // rarity - sort by points (which reflects rarity tier)
                    sortedCards.sort((a, b) => {
                        const aPoints = getCardPoints(a);
                        const bPoints = getCardPoints(b);
                        if (bPoints !== aPoints) return bPoints - aPoints;
                        // If same points, sort by name
                        return a.name.localeCompare(b.name);
                    });
            }
            
            const broadcasting = this.broadcasting;
            const startIdx = (page - 1) * cardsPerPage;
            const endIdx = Math.min(startIdx + cardsPerPage, sortedCards.length);
            const totalPages = Math.ceil(sortedCards.length / cardsPerPage);
            const displayCards = broadcasting ? sortedCards.slice(0, cardsPerPage) : sortedCards.slice(startIdx, endIdx);
            
            const cardsHTML = displayCards.map(card => {
                const { subtype } = parseCardTypes(card.types);
                const buttonStyle = subtype && SPECIAL_SUBTYPES[subtype] 
                    ? `padding: 0; border: 2px solid ${SPECIAL_SUBTYPES[subtype].color}; box-shadow: 0 0 8px ${SPECIAL_SUBTYPES[subtype].color}40;`
                    : 'padding: 0;';
                return `<button class="button" name="send" value="/psgo show ${card.id}" style="margin: 2px; ${buttonStyle}">` +
                    `<img src="${card.image}" height="120" width="100" title="${card.name}"></button>`;
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
            const cardList = Object.values(allCards).filter(c => c.id && c.name && c.setId);
    
            if (!cardList.length) {
                return this.sendReplyBox('No cards in database.');
            }
            
            // Parse filters
            const filters = target.split(',').map(x => x.trim().toLowerCase());
            let filteredCards = [...cardList];
    
            // Apply filters
            for (const filter of filters) {
                if (!filter) continue;
        
                if (filter.startsWith('set:')) {
                    const setId = filter.substring(4);
                    filteredCards = filteredCards.filter(c => c.setId.toLowerCase().includes(setId));
                } else if (filter.startsWith('rarity:')) {
                    const rarity = filter.substring(7);
                    filteredCards = filteredCards.filter(c => c.rarity.toLowerCase().includes(rarity));
                } else if (filter.startsWith('type:')) {
                    const type = filter.substring(5);
                    filteredCards = filteredCards.filter(c => c.types.toLowerCase().includes(type));
                } else {
                    // Search in name
                    filteredCards = filteredCards.filter(c => c.name.toLowerCase().includes(filter));
                }
            }
    
            if (!filteredCards.length) {
                return this.sendReplyBox('No cards found matching your filters.');
            }
    
            // Sort by set and card number
            filteredCards.sort((a, b) => {
                if (a.setId !== b.setId) return a.setId.localeCompare(b.setId);
                return parseInt(a.cardNumber) - parseInt(b.cardNumber);
            });
    
            // Build table rows for ALL filtered cards (no pagination)
            const rows = filteredCards.map(card => {
                const rarityColor = RARITY_COLORS[card.rarity] || '#6366F1';
                return [
                    `<button class="button" name="send" value="/psgo show ${card.id}">${card.id}</button>`,
                    card.name,
                    card.set,
                    `<span style="color: ${rarityColor}; font-weight: bold;">${card.rarity}</span>`,
                    card.types || 'None'
                ];
            });
    
            const tableHTML = Impulse.generateThemedTable(
                `All Cards (${filteredCards.length} total)`,
                ['ID', 'Name', 'Set', 'Rarity', 'Types'],
                rows
            );
    
            return this.sendReplyBox(
                `<div style="max-height: 360px; overflow-y: auto;">` +
                tableHTML +
                `</div>` +
                `<div style="margin-top: 10px; font-size: 0.9em;">` +
                `<strong>Filters:</strong> set:base1, rarity:mythic, type:fire, or search by name<br>` +
                `<strong>Example:</strong> /psgo cards set:base1, rarity:rare` +
                `</div>`
            );
        },
        
        cardshelp: ['/psgo cards [filters] - List all cards in database. Filters: set:id, rarity:name, type:fire, or card name'],

        async rarities(target, room, user) {
            if (!this.runBroadcast()) return;
            
            // Group rarities by point tiers
            const tiers: Record<string, CardRarity[]> = {
                'Common (1 pt)': ['Common'],
                'Uncommon (3 pts)': ['Uncommon'],
                'Rare (5-6 pts)': ['Rare', 'Rare Holo', 'Promo'],
                'Special Rare (7-8 pts)': ['Rare ACE', 'Rare BREAK', 'Rare Prime'],
                'EX/GX Era (9-11 pts)': ['Rare Holo EX', 'Rare Holo GX', 'Rare Holo LV.X'],
                'V Era (10-12 pts)': ['Rare Holo V', 'Rare Holo VMAX', 'Rare Holo VSTAR', 'Double Rare'],
                'Ultra Rare (13-15 pts)': ['Rare Ultra', 'Ultra Rare', 'Rare Secret', 'Rare Rainbow', 'Trainer Gallery Rare Holo'],
                'Amazing/Radiant (16 pts)': ['Amazing Rare', 'Radiant Rare'],
                'Illustration (17-18 pts)': ['Illustration Rare', 'Special Illustration Rare'],
                'Legendary (18-20 pts)': ['Rare Holo Star', 'Rare LEGEND', 'Rare Shining', 'Rare Shiny', 'Rare Shiny GX'],
                'Hyper/Mythic (22-25 pts)': ['Hyper Rare', 'Classic'],
            };
            
            let output = '<div style="padding: 10px;"><h3>PSGO Rarity System</h3>';
            output += '<p>All official Pokemon TCG rarities from Base Set (1999) to Scarlet & Violet (2025)</p>';
            
            for (const [tierName, rarities] of Object.entries(tiers)) {
                output += `<h4>${tierName}</h4><ul style="margin: 5px 0;">`;
                for (const rarity of rarities) {
                    const color = RARITY_COLORS[rarity];
                    const points = RARITY_POINTS[rarity];
                    output += `<li><span style="color: ${color}; font-weight: bold;">${rarity}</span> (${points} pts)</li>`;
                }
                output += '</ul>';
            }
            
            output += '<h4 style="margin-top: 15px;">Special Subtypes (Bonus Points)</h4>';
            output += '<ul style="margin: 5px 0;">';
            output += '<li>+2 pts: BREAK</li>';
            output += '<li>+3 pts: EX, GX, V, ex, MEGA, LV.X, RADIANT, AMAZING</li>';
            output += '<li>+4 pts: LEGEND, PRIME, SHINING, ★</li>';
            output += '<li>+5 pts: VMAX, VSTAR</li>';
            output += '<li>+6 pts: TAG TEAM</li>';
            output += '</ul>';
            output += '<p style="margin-top: 10px;"><em>Subtypes add bonus points to base rarity. Example: "Fire - GX" = Base Rarity + 3 pts</em></p>';
            output += '</div>';
            
            return this.sendReplyBox(output);
        },
        
        raritieshelp: ['/psgo rarities - View all card rarities and their point values'],

        async cleanup(target, room, user) {
            const isManagerUser = await isManager(user.id);
            if (!isManagerUser) this.checkCan('roomowner');
    
            const allCards = await getAllCards();
            const allPacks = await getAllPacks();
    
            let removedCards = 0;
            let removedPacks = 0;
    
            // Remove invalid cards
            for (const cardId in allCards) {
                const card = allCards[cardId];
                if (!card.id || !card.name || !card.setId || card.id === 'undefined') {
                    delete allCards[cardId];
                    removedCards++;
                    this.sendReply(`Removed invalid card: ${cardId}`);
                }
            }
    
            // Remove invalid packs
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
        
        cleanuphelp: ['/psgo cleanup - Remove invalid/corrupted cards and packs from database (requires manager or #)'],

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
                `<img src="${card.image}" title="${card.name}" height="100" width="80"></button>`
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

        async add(target, room, user) {
            const isManagerUser = await isManager(user.id);
            if (!isManagerUser) this.checkCan('roomowner');
            if (!target) return this.parse('/help psgo add');

            const parts = target.split(',').map(x => x.trim());

            if (parts.length === 7) {
                const [setId, cardNumber, name, image, rarity, set, types] = parts;
                const cardId = makeCardId(setId, cardNumber);
                const nameId = makeCardNameId(setId, name);

                const allCards = await getAllCards();
        
                if (allCards[cardId]) return this.errorReply(`Card ${cardId} already exists!`);
                
                // Validate rarity
                if (!RARITY_POINTS[rarity as CardRarity]) {
                    return this.errorReply(`Invalid rarity "${rarity}". Use /psgo rarities to see valid rarities.`);
                }
                
                // Just warn if similar name exists, don't block
                for (const existingCardId in allCards) {
                    if (allCards[existingCardId].nameId === nameId && existingCardId !== cardId) {
                        this.sendReply(`⚠️ Warning: Similar card name exists: ${existingCardId}`);
                    }
                }
                
                allCards[cardId] = { 
                    id: cardId, 
                    name, 
                    nameId, 
                    image, 
                    rarity: rarity as CardRarity, 
                    set, 
                    setId, 
                    cardNumber, 
                    types 
                };
                await saveAllCards(allCards);
                this.modlog('PSGO ADD CARD', null, cardId);
                return this.sendReply(`Added card: ${name} (${cardId}) - ${rarity} (${getCardPoints(allCards[cardId])} pts)`);

            } else if (parts.length === 6) {
                const [code, name, series, releaseDate, priceStr, flags] = parts;
                const packCode = toID(code);
                const allPacks = await getAllPacks();
        
                if (allPacks[packCode]) return this.errorReply(`Pack ${packCode} already exists!`);

                const inShop = flags.includes('shop');
                const creditPack = flags.includes('credit');

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
            }

            return this.errorReply('Usage: /psgo add [setId], [cardNumber], [name], [image], [rarity], [set], [types] OR /psgo add [code], [name], [series], [date], [price], [shop|credit]');
        },
        
        addhelp: [
            '/psgo add [setId], [cardNumber], [name], [image], [rarity], [set], [types] - Add card',
            '/psgo add [code], [name], [series], [date], [price], [shop|credit] - Add pack',
            'Types: "Fire", "Fire - GX", "Water/Psychic - VMAX". Subtypes get bonus points!',
            'Use /psgo rarities to see all valid rarity values'
        ],
        
        async edit(target, room, user) {
            const isManagerUser = await isManager(user.id);
            if (!isManagerUser) this.checkCan('roomowner');
            if (!target) return this.parse('/help psgo edit');

            const parts = target.split(',').map(x => x.trim());
            const id = parts[0];

            // Try to edit as card first
            const result = await getCardFromInput(id);
            if (result && !Array.isArray(result) && parts.length === 6) {
                const card = result;
                const [, name, image, rarity, set, types] = parts;
                
                // Validate rarity
                if (!RARITY_POINTS[rarity as CardRarity]) {
                    return this.errorReply(`Invalid rarity "${rarity}". Use /psgo rarities to see valid rarities.`);
                }
                
                const newNameId = makeCardNameId(card.setId, name);
                const allCards = await getAllCards();
        
                // Just warn if similar name exists, don't block
                if (newNameId !== card.nameId) {
                    for (const existingCardId in allCards) {
                        if (allCards[existingCardId].nameId === newNameId && existingCardId !== card.id) {
                            this.sendReply(`⚠️ Warning: Similar card name exists: ${existingCardId}`);
                        }
                    }
                }
                allCards[card.id] = {
                    id: card.id,
                    name,
                    nameId: newNameId,
                    image,
                    rarity: rarity as CardRarity,
                    set,
                    setId: card.setId,
                    cardNumber: card.cardNumber,
                    types
                };
                await saveAllCards(allCards);
                this.modlog('PSGO EDIT CARD', null, card.id);
                return this.sendReply(`Edited card: ${name} - ${rarity} (${getCardPoints(allCards[card.id])} pts)`);
            }
            
            if (result && Array.isArray(result)) {
                let output = 'Multiple cards found. Please specify using full ID (setId-cardNumber):\n';
                for (const c of result) {
                    output += `${c.name} - ${c.set} #${c.cardNumber} (ID: ${c.id})\n`;
                }
                return this.sendReply(output);
            }
    
            // Try to edit as pack
            const packCode = toID(id);
            const allPacks = await getAllPacks();
            const pack = allPacks[packCode];
            if (pack && parts.length === 6) {
                const [, name, series, releaseDate, priceStr, flags] = parts;
                allPacks[packCode] = {
                    code: packCode,
                    name,
                    series,
                    releaseDate,
                    price: parseInt(priceStr) || 0,
                    inShop: flags.includes('shop'),
                    creditPack: flags.includes('credit')
                };
                await saveAllPacks(allPacks);
                this.modlog('PSGO EDIT PACK', null, packCode);
                return this.sendReply(`Edited pack: ${name}`);
            }
            return this.errorReply('ID not found or wrong parameter count.');
        },

        edithelp: ['/psgo edit [id], [params...] - Edit card or pack (same params as add)'],

        async delete(target, room, user) {
            const isManagerUser = await isManager(user.id);
            if (!isManagerUser) this.checkCan('roomowner');
            if (!target) return this.parse('/help psgo delete');
    
            const result = await getCardFromInput(target);
            if (result) {
                if (Array.isArray(result)) {
                    let output = 'Multiple cards found. Please specify using full ID (setId-cardNumber):\n';
                    for (const c of result) {
                        output += `${c.name} - ${c.set} #${c.cardNumber} (ID: ${c.id})\n`;
                    }
                    return this.sendReply(output);
                }
                const card = result;
                const allCards = await getAllCards();
                delete allCards[card.id];
                await saveAllCards(allCards);
                this.modlog('PSGO DELETE CARD', null, card.id);
                return this.sendReply(`Deleted card: ${card.name}`);
            }
    
            const packCode = toID(target);
            const allPacks = await getAllPacks();
            if (allPacks[packCode]) {
                const packName = allPacks[packCode].name;
                delete allPacks[packCode];
                await saveAllPacks(allPacks);
                this.modlog('PSGO DELETE PACK', null, packCode);
                return this.sendReply(`Deleted pack: ${packName}`);
            }
    
            return this.errorReply('Card or pack not found.');
        },
        
        deletehelp: ['/psgo delete [id] - Delete card or pack'],
        
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
                        let output = 'Multiple cards found. Please specify using full ID (setId-cardNumber):\n';
                        for (const c of result) {
                            output += `${c.name} - ${c.set} #${c.cardNumber} (ID: ${c.id})\n`;
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
                    output = `<div class="ladder pad"><h2>PSGO Card System Help</h2>` +
                        `<p><strong>Navigation:</strong></p>` +
                        `<button class="button" name="send" value="/psgo help user">User Commands</button>` +
                        `<button class="button" name="send" value="/psgo help admin">Admin Commands</button>` +
                        `<button class="button" name="send" value="/psgo help settings">Settings</button>` +
                        `<button class="button" name="send" value="/psgo help examples">Examples</button>` +
                        `<hr>` +
                        `<p><strong>Quick Start:</strong></p>` +
                        `<ul>` +
                        `<li>Use <code>/psgo shop</code> to browse packs</li>` +
                        `<li>Use <code>/psgo buy [pack]</code> to purchase packs</li>` +
                        `<li>Use <code>/psgo open [pack]</code> to open packs</li>` +
                        `<li>Use <code>/psgo collection</code> to view your cards</li>` +
                        `<li>Use <code>/psgo rarities</code> to see all rarities</li>` +
                        `<li>Use <code>/psgo transfer [user], [card]</code> to trade cards</li>` +
                        `</ul>` +
                        `<p><strong>Rarity System:</strong> Supports all 32 official Pokemon TCG rarities from Base Set (1999) to Scarlet & Violet (2025)</p>` +
                        `<p><strong>Important Note:</strong> If multiple cards share the same name, use the full ID format (setId-cardNumber) instead of setId-cardName</p>` +
                        `</div>`;
                    break;
                case 'user':
                case '1':
                    output = `<div class="ladder pad"><h2>PSGO Card System Help</h2>` +
                        `<h3>User Commands</h3>` +
                        `<table style="width: 100%; border-collapse: collapse;">` +
                        `<tr><th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Command</th>` +
                        `<th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Usage</th>` +
                        `<th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Permission</th></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo show</code></td>` +
                        `<td style="padding: 8px;">/psgo show base1-25<br>/psgo show base1-charizard<br>(If multiple cards match, you'll see a list)</td>` +
                        `<td style="padding: 8px;">Everyone</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo rarities</code></td>` +
                        `<td style="padding: 8px;">/psgo rarities<br>(View all 32 official rarities and point values)</td>` +
                        `<td style="padding: 8px;">Everyone</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo transfer</code></td>` +
                        `<td style="padding: 8px;">/psgo transfer username, base1-25<br>/psgo transfer base1-25, username<br>(Transfers YOUR card to another user)</td>` +
                        `<td style="padding: 8px;">Card owner</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo collection</code></td>` +
                        `<td style="padding: 8px;">/psgo collection<br>/psgo collection username<br>/psgo collection username, 2, points</td>` +
                        `<td style="padding: 8px;">Everyone</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo ladder</code></td>` +
                        `<td style="padding: 8px;">/psgo ladder</td>` +
                        `<td style="padding: 8px;">Everyone</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo cards</code></td>` +
                        `<td style="padding: 8px;">/psgo cards<br>/psgo cards set:base1<br>/psgo cards rarity:hyper<br>/psgo cards charizard</td>` +
                        `<td style="padding: 8px;">Everyone</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo shop</code></td>` +
                        `<td style="padding: 8px;">/psgo shop</td>` +
                        `<td style="padding: 8px;">Everyone</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo buy</code></td>` +
                        `<td style="padding: 8px;">/psgo buy base1<br>/psgo buy Base Set</td>` +
                        `<td style="padding: 8px;">Everyone</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo open</code></td>` +
                        `<td style="padding: 8px;">/psgo open base1</td>` +
                        `<td style="padding: 8px;">Pack owner</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo packs</code></td>` +
                        `<td style="padding: 8px;">/psgo packs</td>` +
                        `<td style="padding: 8px;">Everyone</td></tr>` +
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
                        `<th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Usage</th>` +
                        `<th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Permission</th></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo give</code></td>` +
                        `<td style="padding: 8px;">/psgo give username, base1-25<br>/psgo give base1-25, username<br>(Gives ANY card to user, no ownership required)</td>` +
                        `<td style="padding: 8px;">Manager or ~, &</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo add</code></td>` +
                        `<td style="padding: 8px;"><strong>Card:</strong><br>/psgo add base1, 25, Charizard, [url], Rare Holo, Base Set, Fire<br><br>` +
                        `<strong>Pack:</strong><br>/psgo add base1, Base Set, Generation 1, 1999-01-09, 100, shop<br><br>` +
                        `<em>Use /psgo rarities to see all 32 valid rarity values</em></td>` +
                        `<td style="padding: 8px;">Manager or ~, &</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo edit</code></td>` +
                        `<td style="padding: 8px;"><strong>Card:</strong><br>/psgo edit base1-25, Charizard, [url], Hyper Rare, Base Set, Fire - GX<br><br>` +
                        `<strong>Pack:</strong><br>/psgo edit base1, Base Set, Gen 1, 1999-01-09, 150, shop<br><br>` +
                        `<em>Note: Use full ID (setId-cardNumber) if multiple cards share a name</em></td>` +
                        `<td style="padding: 8px;">Manager or ~, &</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo delete</code></td>` +
                        `<td style="padding: 8px;">/psgo delete base1-25<br>/psgo delete base1<br><br>` +
                        `<em>Note: Use full ID (setId-cardNumber) if multiple cards share a name</em></td>` +
                        `<td style="padding: 8px;">Manager or ~, &</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo cleanup</code></td>` +
                        `<td style="padding: 8px;">/psgo cleanup<br>(Removes invalid/corrupted entries)</td>` +
                        `<td style="padding: 8px;">Manager or ~, &</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo manage</code></td>` +
                        `<td style="padding: 8px;"><strong>Add manager:</strong> /psgo manage add, username<br>` +
                        `<strong>Remove:</strong> /psgo manage remove, username<br>` +
                        `<strong>List:</strong> /psgo manage list<br>` +
                        `<strong>Credits:</strong> /psgo manage credits, username, 5<br>` +
                        `<strong>Take card:</strong> /psgo manage take, username, base1-25</td>` +
                        `<td style="padding: 8px;">Manager or ~, &</td></tr>` +
                        `</table>` +
                        `<p><button class="button" name="send" value="/psgo help">Back to Main</button></p>` +
                        `</div>`;
                    break;
                case 'settings':
                case '3':
                    output = `<div class="ladder pad"><h2>PSGO Card System Help</h2>` +
                        `<h3>Settings Commands</h3>` +
                        `<table style="width: 100%; border-collapse: collapse;">` +
                        `<tr><th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Command</th>` +
                        `<th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Usage</th>` +
                        `<th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Permission</th></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo set transfers</code></td>` +
                        `<td style="padding: 8px;">/psgo set transfers, on<br>/psgo set transfers, off<br>(Controls if others can transfer cards to you)</td>` +
                        `<td style="padding: 8px;">Self</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo set sort</code></td>` +
                        `<td style="padding: 8px;">/psgo set sort, rarity<br>/psgo set sort, points<br>/psgo set sort, types<br>/psgo set sort, name<br>/psgo set sort, date</td>` +
                        `<td style="padding: 8px;">Self</td></tr>` +
                        `</table>` +
                        `<p><button class="button" name="send" value="/psgo help">Back to Main</button></p>` +
                        `</div>`;
                    break;
                case 'examples':
                case '4':
                    output = `<div class="ladder pad"><h2>PSGO Card System Help</h2>` +
                        `<h3>Usage Examples</h3>` +
                        `<p><strong>Card Format:</strong></p>` +
                        `<ul>` +
                        `<li><code>setId-cardNumber</code> → base1-25 (ALWAYS unique)</li>` +
                        `<li><code>setId-cardname</code> → base1-charizard (may match multiple cards)</li>` +
                        `</ul>` +
                        `<p><strong>Handling Duplicate Names:</strong></p>` +
                        `<ul>` +
                        `<li>If you use <code>/psgo show base1-pikachu</code> and multiple "Pikachu" cards exist in base1, you'll see a list</li>` +
                        `<li>Click the button or use the full ID: <code>/psgo show base1-25</code></li>` +
                        `<li>For give/transfer/edit/delete commands, always use full ID (setId-cardNumber) when duplicates exist</li>` +
                        `</ul>` +
                        `<p><strong>Transfer vs Give:</strong></p>` +
                        `<ul>` +
                        `<li><code>/psgo transfer</code> - Regular users transfer THEIR OWN cards</li>` +
                        `<li><code>/psgo give</code> - Admins/Managers give ANY card (doesn't need to own it)</li>` +
                        `</ul>` +
                        `<p><strong>Rarity Examples:</strong></p>` +
                        `<ul>` +
                        `<li>Base Set Era: <code>Common</code>, <code>Uncommon</code>, <code>Rare</code>, <code>Rare Holo</code></li>` +
                        `<li>EX Era: <code>Rare Holo EX</code>, <code>Rare Holo Star</code>, <code>Rare Holo LV.X</code></li>` +
                        `<li>BW/XY Era: <code>Rare BREAK</code>, <code>Rare Holo GX</code></li>` +
                        `<li>SwSh Era: <code>Rare Holo V</code>, <code>Rare Holo VMAX</code>, <code>Rare Holo VSTAR</code>, <code>Amazing Rare</code></li>` +
                        `<li>SV Era: <code>Illustration Rare</code>, <code>Special Illustration Rare</code>, <code>Hyper Rare</code></li>` +
                        `<li>Use <code>/psgo rarities</code> to see all 32 rarities!</li>` +
                        `</ul>` +
                        `<p><strong>Types Format:</strong></p>` +
                        `<ul>` +
                        `<li>Basic: <code>Fire</code>, <code>Water</code>, <code>Grass</code></li>` +
                        `<li>Dual: <code>Fire/Flying</code>, <code>Water/Psychic</code></li>` +
                        `<li>Special: <code>Fire - GX</code>, <code>Water - VMAX</code>, <code>Psychic - ex</code></li>` +
                        `</ul>` +
                        `<p><strong>Special Subtypes (Bonus Points):</strong></p>` +
                        `<ul>` +
                        `<li>+2: BREAK</li>` +
                        `<li>+3: EX, GX, V, ex, MEGA, LV.X, RADIANT, AMAZING</li>` +
                        `<li>+4: LEGEND, PRIME, SHINING, ★</li>` +
                        `<li>+5: VMAX, VSTAR</li>` +
                        `<li>+6: TAG TEAM</li>` +
                        `</ul>` +
                        `<p><strong>Pack Flags:</strong></p>` +
                        `<ul>` +
                        `<li><code>shop</code> - Available in shop for coins</li>` +
                        `<li><code>credit</code> - Available for pack credits</li>` +
                        `<li><code>shop,credit</code> - Available for both</li>` +
                        `</ul>` +
                        `<p><strong>Common Workflows:</strong></p>` +
                        `<ol>` +
                        `<li>Add pack → <code>/psgo add base1, Base Set, Gen 1, 1999-01-09, 100, shop</code></li>` +
                        `<li>Add cards → <code>/psgo add base1, 1, Bulbasaur, [url], Common, Base Set, Grass</code></li>` +
                        `<li>Add rare card → <code>/psgo add base1, 4, Charizard, [url], Rare Holo, Base Set, Fire</code></li>` +
                        `<li>Add modern card → <code>/psgo add swsh1, 25, Pikachu VMAX, [url], Rare Holo VMAX, Sword & Shield Base, Electric - VMAX</code></li>` +
                        `<li>User buys → <code>/psgo buy base1</code></li>` +
                        `<li>User opens → <code>/psgo open base1</code></li>` +
                        `<li>View collection → <code>/psgo collection</code></li>` +
                        `<li>Show specific card → <code>/psgo show base1-25</code> or <code>/psgo show base1-charizard</code></li>` +
                        `<li>Transfer card → <code>/psgo transfer friendname, base1-25</code></li>` +
                        `<li>Admin give card → <code>/psgo give newuser, base1-25</code></li>` +
                        `</ol>` +
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

export const pages: Chat.PageTable = {
    async psgo(args, user) {
        const [action, ...params] = args;
        
        if (action === 'collection') {
            const targetUser = params[0] ? toID(params[0]) : user.id;
            const cards = await getUserCards(targetUser);
            if (!cards.length) {
                return `<div class="pad"><h2>${Impulse.nameColor(targetUser, true, true)} has no cards.</h2></div>`;
            }

            // Group cards by rarity and sort by points
            const cardsByRarity: Record<string, CardInstance[]> = {};
            for (const card of cards) {
                if (!cardsByRarity[card.rarity]) cardsByRarity[card.rarity] = [];
                cardsByRarity[card.rarity].push(card);
            }

            let output = '<div class="pad">';
            output += `<h2>${Impulse.nameColor(targetUser, true, true)}'s Collection (${cards.length} cards)</h2>`;

            // Sort rarities by their point value (highest to lowest)
            const sortedRarities = Object.keys(cardsByRarity).sort((a, b) => {
                const aPoints = RARITY_POINTS[a as CardRarity] || 0;
                const bPoints = RARITY_POINTS[b as CardRarity] || 0;
                return bPoints - aPoints;
            });

            for (const rarity of sortedRarities) {
                const rarityCards = cardsByRarity[rarity];
                output += `<h3 style="color: ${RARITY_COLORS[rarity as CardRarity]}">${rarity} (${rarityCards.length})</h3>`;
                output += '<div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 20px;">';
                
                for (const card of rarityCards) {
                    const { subtype } = parseCardTypes(card.types);
                    const buttonStyle = subtype && SPECIAL_SUBTYPES[subtype] 
                        ? `padding: 0; border: 2px solid ${SPECIAL_SUBTYPES[subtype].color}; box-shadow: 0 0 8px ${SPECIAL_SUBTYPES[subtype].color}40;`
                        : 'padding: 0;';
                    output += `<button class="button" name="send" value="/psgo show ${card.id}" style="${buttonStyle}">` +
                        `<img src="${card.image}" height="120" width="100" title="${card.name}"></button>`;
                }
                output += '</div>';
            }
            output += '</div>';
            return output;
        }
        
        return '<div class="pad"><h2>Invalid PSGO page.</h2></div>';
    },
};
