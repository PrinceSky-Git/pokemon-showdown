/**
 * PSGO Collectable Pokemon Cards System
 * Enhanced version with per-set unique composite keys - FULLY FIXED
 * Original by HoeenHero and Volco
 * Refactored by CarkJ338 with Pokemon-authentic subtypes
 * Fixed: TypeError in getSubtypeBonus and pack generation issues
 */

import { FS } from '../../lib/fs';

// ================ Configuration ================
const CARDS_PER_PACK = 10;
const CURRENCY = Impulse.currency || 'coins';
const PACK_PRICE = 5;
const CARDSEARCH_MAX_VALUE = 500;

// ================ Data Paths ================
const CARDS_DATA_PATH = 'config/psgo/user-cards.json';
const PACKS_DATA_PATH = 'config/psgo/user-packs.json';
const PACK_CREDITS_PATH = 'config/psgo/pack-credits.json';
const MANAGERS_PATH = 'config/psgo/managers.json';
const SETTINGS_PATH = 'config/psgo/user-settings.json';
const CARD_DEFINITIONS_PATH = 'config/psgo/card-definitions.json';
const PACK_DEFINITIONS_PATH = 'config/psgo/pack-definitions.json';

// ================ Interfaces ================
interface Card {
    id: string;       // composite: setId-cardNumber (unique card id)
    name: string;
    nameId: string;   // composite: setId-nameId (unique card name id per set)
    image: string;
    rarity: string;
    set: string;
    setId: string;
    cardNumber: string;
    types: string; // Format: "Fire/Bug - GX" or "Water - VMAX" or "Psychic"
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

interface UserCardsData {
    [userid: string]: CardInstance[];
}

interface UserPacksData {
    [userid: string]: string[];
}

interface PackCreditsData {
    [userid: string]: number;
}

interface ManagersData {
    managers: string[];
}

interface UserSettings {
    [userid: string]: {
        transfersEnabled?: boolean;
        showcaseSort?: 'rarity' | 'points' | 'types' | 'name' | 'date';
    };
}

type CardRarity = 'Common' | 'Uncommon' | 'Rare' | 'Ultra Rare' | 'Legendary' | 'Mythic';

// ================ Load Card Data ================
let cardDefinitions: Record<string, Card> = {};
let packDefinitions: Record<string, PackDefinition> = {};
let cardNameToId: Record<string, string> = {}; // Map nameId to cardId

try {
    cardDefinitions = JSON.parse(FS(CARD_DEFINITIONS_PATH).readIfExistsSync() || '{}');
} catch (e) {
    console.error('Error loading card definitions:', e);
}

try {
    packDefinitions = JSON.parse(FS(PACK_DEFINITIONS_PATH).readIfExistsSync() || '{}');
} catch (e) {
    console.error('Error loading pack definitions:', e);
}

// Rebuild name to ID map on startup
function rebuildCardNameToId() {
    cardNameToId = {};
    for (const cardId in cardDefinitions) {
        const card = cardDefinitions[cardId];
        cardNameToId[card.nameId] = cardId;
    }
}
rebuildCardNameToId();

function saveCardDefinitions(): void {
    FS(CARD_DEFINITIONS_PATH).writeUpdate(() => JSON.stringify(cardDefinitions, null, 2));
}

function savePackDefinitions(): void {
    FS(PACK_DEFINITIONS_PATH).writeUpdate(() => JSON.stringify(packDefinitions, null, 2));
}

// ================ Pack Configuration ================
const PACK_MAKING_DATA: Record<CardRarity, { chance: number; limits: [number, number] }> = {
    Common: { chance: 50, limits: [4, 7] },
    Uncommon: { chance: 20, limits: [2, 4] },
    Rare: { chance: 15, limits: [1, 2] },
    'Ultra Rare': { chance: 9, limits: [0, 1] },
    Legendary: { chance: 5, limits: [0, 1] },
    Mythic: { chance: 1, limits: [0, 1] },
};

const RARITY_COLORS: Record<CardRarity, string> = {
    Common: '#0066ff',
    Uncommon: '#008000',
    Rare: '#cc0000',
    'Ultra Rare': '#800080',
    Legendary: '#c0c0c0',
    Mythic: '#998200',
};

const RARITY_POINTS: Record<CardRarity, number> = {
    Common: 1,
    Uncommon: 3,
    Rare: 6,
    'Ultra Rare': 10,
    Legendary: 15,
    Mythic: 20,
};

// Pokemon-specific subtype colors and styling
const SPECIAL_SUBTYPES: Record<string, { color: string; glow: boolean }> = {
    'EX': { color: '#FFD700', glow: true },
    'GX': { color: '#FF6B35', glow: true },
    'V': { color: '#00D4AA', glow: true },
    'VMAX': { color: '#FF1493', glow: true },
    'VSTAR': { color: '#9932CC', glow: true },
    'Legend': { color: '#B8860B', glow: true },
    'Prime': { color: '#32CD32', glow: true },
    'Break': { color: '#FF4500', glow: true },
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

function parseCardId(cardId: string): { setId: string; cardNumber: string } {
    const [setId, cardNumber] = cardId.split('-');
    return { setId, cardNumber };
}

function getCardById(cardId: string): Card | null {
    return cardDefinitions[cardId] || null;
}

function getCardByNameId(nameId: string): Card | null {
    const cardId = cardNameToId[nameId];
    if (!cardId) return null;
    return getCardById(cardId);
}

function getCardFromInput(input: string): Card | null {
    if (!input) return null;
    if (input.includes('-')) {
        // Try as cardId first
        let card = getCardById(input);
        if (card) return card;
        // Try as nameId
        card = getCardByNameId(input);
        if (card) return card;
    }
    return null;
}

function toPackCode(packInput: string): string {
    const packId = toID(packInput);
    for (const code in packDefinitions) {
        if (toID(code) === packId || toID(packDefinitions[code].name) === packId) {
            return code;
        }
    }
    return packInput;
}

function isManager(userid: string): boolean {
    const managers = loadManagersSync();
    return managers.managers.includes(userid);
}

function loadManagersSync(): ManagersData {
    try {
        const data = FS(MANAGERS_PATH).readIfExistsSync();
        return data ? JSON.parse(data) : { managers: [] };
    } catch (e) {
        return { managers: [] };
    }
}

function genCard(setId?: string): Card | null {
    const validCards = Object.values(cardDefinitions).filter(card => {
        if (setId && card.setId !== setId) return false;
        return true;
    });
    if (!validCards.length) return null;
    return validCards[Math.floor(Math.random() * validCards.length)];
}

// FIXED: Pack generation logic
function makePack(setId: string): CardInstance[] {
    const out: CardInstance[] = [];
    const packCards = Object.values(cardDefinitions).filter(c => c.setId === setId);
    
    if (!packCards.length) {
        console.warn(`No cards found for setId: ${setId}`);
        return out;
    }

    // Generate cards by randomly selecting from available cards in the set
    // If there are fewer cards in set than CARDS_PER_PACK, some will be duplicated
    for (let i = 0; i < CARDS_PER_PACK; i++) {
        const randomCard = packCards[Math.floor(Math.random() * packCards.length)];
        out.push({ ...randomCard, obtainedAt: Date.now() });
    }
    
    return out;
}

function getCardPoints(card: Card): number {
    let basePoints = RARITY_POINTS[card.rarity as CardRarity] || 1;
    
    // Bonus points for special Pokemon subtypes
    const subtypeBonus = getSubtypeBonus(card.types);
    return basePoints + subtypeBonus;
}

// FIXED: Added null/undefined check for types
function getSubtypeBonus(types: string): number {
    if (!types) return 0; // Add null/undefined check
    
    const upperTypes = types.toUpperCase();
    
    if (upperTypes.includes('VMAX') || upperTypes.includes('VSTAR')) return 5;
    if (upperTypes.includes('GX') || upperTypes.includes('EX') || upperTypes.includes('V ')) return 3;
    if (upperTypes.includes('LEGEND') || upperTypes.includes('PRIME')) return 4;
    if (upperTypes.includes('TAG TEAM')) return 6;
    if (upperTypes.includes('BREAK')) return 2;
    
    return 0;
}

function parseCardTypes(types: string): { baseTypes: string; subtype: string | null } {
    if (!types) return { baseTypes: '', subtype: null }; // Add null check
    
    const parts = types.split(' - ');
    return {
        baseTypes: parts[0] || types,
        subtype: parts[1] || null
    };
}

function formatCardTypes(types: string): string {
    if (!types) return 'Unknown'; // Add null check
    
    const { baseTypes, subtype } = parseCardTypes(types);
    
    if (!subtype) return baseTypes;
    
    const subtypeConfig = SPECIAL_SUBTYPES[subtype];
    if (subtypeConfig) {
        const style = `color: ${subtypeConfig.color}; font-weight: bold;${subtypeConfig.glow ? ' text-shadow: 0 0 8px ' + subtypeConfig.color + '80;' : ''}`;
        return `${baseTypes} - <span style="${style}">${subtype}</span>`;
    }
    
    return `${baseTypes} - <span style="font-weight: bold;">${subtype}</span>`;
}

// ================ Data Storage Functions ================
async function loadUserCards(): Promise<UserCardsData> {
    try {
        const data = await FS(CARDS_DATA_PATH).readIfExists();
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error('Error loading user cards:', e);
        return {};
    }
}

function loadUserCardsSync(): UserCardsData {
    try {
        const data = FS(CARDS_DATA_PATH).readIfExistsSync();
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error('Error loading user cards:', e);
        return {};
    }
}

async function saveUserCards(data: UserCardsData): Promise<void> {
    await FS(CARDS_DATA_PATH).parentDir().mkdirp();
    FS(CARDS_DATA_PATH).writeUpdate(() => JSON.stringify(data, null, 2), { throttle: 1000 });
}

async function loadUserPacks(): Promise<UserPacksData> {
    try {
        const data = await FS(PACKS_DATA_PATH).readIfExists();
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error('Error loading user packs:', e);
        return {};
    }
}

async function saveUserPacks(data: UserPacksData): Promise<void> {
    await FS(PACKS_DATA_PATH).parentDir().mkdirp();
    FS(PACKS_DATA_PATH).writeUpdate(() => JSON.stringify(data, null, 2), { throttle: 1000 });
}

async function loadPackCredits(): Promise<PackCreditsData> {
    try {
        const data = await FS(PACK_CREDITS_PATH).readIfExists();
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error('Error loading pack credits:', e);
        return {};
    }
}

async function savePackCredits(data: PackCreditsData): Promise<void> {
    await FS(PACK_CREDITS_PATH).parentDir().mkdirp();
    FS(PACK_CREDITS_PATH).writeUpdate(() => JSON.stringify(data, null, 2), { throttle: 1000 });
}

async function loadManagers(): Promise<ManagersData> {
    try {
        const data = await FS(MANAGERS_PATH).readIfExists();
        return data ? JSON.parse(data) : { managers: [] };
    } catch (e) {
        console.error('Error loading managers:', e);
        return { managers: [] };
    }
}

async function saveManagers(data: ManagersData): Promise<void> {
    await FS(MANAGERS_PATH).parentDir().mkdirp();
    FS(MANAGERS_PATH).writeUpdate(() => JSON.stringify(data, null, 2));
}

async function loadUserSettings(): Promise<UserSettings> {
    try {
        const data = await FS(SETTINGS_PATH).readIfExists();
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error('Error loading user settings:', e);
        return {};
    }
}

async function saveUserSettings(data: UserSettings): Promise<void> {
    await FS(SETTINGS_PATH).parentDir().mkdirp();
    FS(SETTINGS_PATH).writeUpdate(() => JSON.stringify(data, null, 2));
}

// ================ Card Management Functions ================
async function getUserCards(userid: string): Promise<CardInstance[]> {
    const allData = await loadUserCards();
    return allData[userid] || [];
}

function getUserCardsSync(userid: string): CardInstance[] {
    const allData = loadUserCardsSync();
    return allData[userid] || [];
}

async function giveCard(userid: string, cardId: string): Promise<boolean> {
    if (!cardDefinitions[cardId]) return false;
    const card: CardInstance = { ...cardDefinitions[cardId], obtainedAt: Date.now() };
    const allData = await loadUserCards();
    if (!allData[userid]) {
        allData[userid] = [];
    }
    allData[userid].push(card);
    await saveUserCards(allData);
    return true;
}

async function hasCard(userid: string, cardId: string): Promise<boolean> {
    const userCards = await getUserCards(userid);
    return userCards.some(card => card.id === cardId);
}

async function takeCard(userid: string, cardId: string): Promise<boolean> {
    const allData = await loadUserCards();
    if (!allData[userid]) return false;
    const cards = allData[userid];
    const idx = cards.findIndex((card: CardInstance) => card.id === cardId);
    if (idx === -1) return false;
    cards.splice(idx, 1);
    await saveUserCards(allData);
    return true;
}

async function getUserPacks(userid: string): Promise<string[]> {
    const allData = await loadUserPacks();
    return allData[userid] || [];
}

async function addUserPack(userid: string, pack: string): Promise<void> {
    const allData = await loadUserPacks();
    if (!allData[userid]) {
        allData[userid] = [];
    }
    allData[userid].push(pack);
    await saveUserPacks(allData);
}

async function removeUserPack(userid: string, pack: string): Promise<boolean> {
    const allData = await loadUserPacks();
    if (!allData[userid]) return false;
    const packs = allData[userid];
    const idx = packs.indexOf(pack);
    if (idx === -1) return false;
    packs.splice(idx, 1);
    await saveUserPacks(allData);
    return true;
}

async function getPackCredits(userid: string): Promise<number> {
    const allData = await loadPackCredits();
    return allData[userid] || 0;
}

async function addPackCredits(userid: string, amount: number): Promise<void> {
    const allData = await loadPackCredits();
    allData[userid] = (allData[userid] || 0) + amount;
    await savePackCredits(allData);
}

async function takePackCredits(userid: string, amount: number): Promise<boolean> {
    const allData = await loadPackCredits();
    const current = allData[userid] || 0;
    if (current < amount) return false;
    allData[userid] = current - amount;
    await savePackCredits(allData);
    return true;
}

function displayCard(card: Card): string {
    const points = getCardPoints(card);
    const formattedTypes = formatCardTypes(card.types);
    const { subtype } = parseCardTypes(card.types);
    
    // Add special styling for cards with special subtypes
    const cardBorder = subtype && SPECIAL_SUBTYPES[subtype] 
        ? `border: 2px solid ${SPECIAL_SUBTYPES[subtype].color}; box-shadow: 0 0 12px ${SPECIAL_SUBTYPES[subtype].color}40;`
        : '';
    
    return `<div style="display: flex; gap: 20px; flex-wrap: wrap; ${cardBorder} border-radius: 8px; padding: 10px;">` +
        `<div style="flex: 0 0 254px;"><img src="${card.image}" alt="${card.name}" width="254" height="342" style="border-radius: 6px;"></div>` +
        `<div style="flex: 1; min-width: 250px;">` +
        `<div style="font-size: 2em; font-weight: bold; margin-bottom: 10px;">${card.name}</div>` +
        `<div style="color: #666; margin-bottom: 10px;">(ID: ${card.id}) (Set: ${card.set})</div>` +
        `<div style="font-size: 1.5em; font-weight: bold; color: ${RARITY_COLORS[card.rarity as CardRarity] || '#cc0000'}; margin-bottom: 15px;">${card.rarity}</div>` +
        `<div style="margin-bottom: 8px;"><strong>Types:</strong> ${formattedTypes}</div>` +
        `<div style="margin-bottom: 8px;"><strong>Card Number:</strong> ${card.cardNumber}</div>` +
        `<div><strong>Points:</strong> ${points}${getSubtypeBonus(card.types) > 0 ? ` (+${getSubtypeBonus(card.types)} bonus)` : ''}</div>` +
        `</div></div>`;
}

// ================ Commands ================
export const commands: Chat.Commands = {
    psgo: {
        card: {
            show(target, room, user) {
                if (!this.runBroadcast()) return;
                if (!target) return this.parse('/help psgo card show');
                const card = getCardFromInput(target);
                if (!card) return this.errorReply('That card does not exist.');
                return this.sendReplyBox(displayCard(card));
            },
            showhelp: ['/psgo card show [setId-cardNumber|setId-cardName] - Displays the details of a card.'],

            confirmtransfer: 'transfer',
            async transfer(target, room, user, connection, cmd) {
                if (!target) return this.parse('/help psgo card transfer');
                const [targetName, cardInput] = target.split(',').map(x => x.trim());
                const targetUser = Users.get(targetName);
                if (!targetUser) return this.errorReply(`User "${targetName}" not found.`);
                if (!targetUser.named) return this.errorReply('Guests cannot receive cards.');
                if (targetUser.id === user.id) return this.errorReply('You cannot transfer cards to yourself.');

                // Check if target user accepts transfers
                const settings = await loadUserSettings();
                if (settings[targetUser.id]?.transfersEnabled === false) {
                    return this.errorReply(`${targetUser.name} has disabled card transfers.`);
                }

                const card = getCardFromInput(cardInput);
                if (!card) return this.errorReply('That card does not exist.');
                const userHasCard = await hasCard(user.id, card.id);
                if (!userHasCard) return this.errorReply('You do not have that card.');

                if (cmd !== 'confirmtransfer') {
                    return this.popupReply(
                        `|html|` +
                        `<center><button class="button" name="send" value="/psgo card confirmtransfer ${targetUser.id}, ${card.id}" style="padding: 15px 30px; font-size: 14px; border-radius: 8px;">` +
                        `Confirm transfer to<br><b style="color: ${Impulse.hashColor(targetUser.id)}">${Chat.escapeHTML(targetUser.name)}</b>` +
                        `</button></center>`
                    );
                }

                const success = await takeCard(user.id, card.id);
                if (!success) return this.errorReply('Transfer failed. Please try again.');
                await giveCard(targetUser.id, card.id);

                if (targetUser.connected) {
                    targetUser.popup(
                        `|html|${Chat.escapeHTML(user.name)} has given you a card!<br>` +
                        `<button class="button" name="send" value="/psgo card show ${card.id}">View Card</button>`
                    );
                }

                return this.sendReply(`You have successfully transferred ${card.name} to ${targetUser.name}.`);
            },
            transferhelp: ['/psgo card transfer [user], [setId-cardNumber|setId-cardName] - Transfer a specified card to another user.'],

            confirmtransferall: 'transferall',
            async transferall(target, room, user, connection, cmd) {
                if (!target) return this.parse('/help psgo card transferall');
                const targetUser = Users.get(target);
                if (!targetUser) return this.errorReply(`User "${target}" not found.`);
                if (!targetUser.named) return this.errorReply('Guests cannot receive cards.');
                if (targetUser.id === user.id) return this.errorReply('You cannot transfer cards to yourself.');

                // Check if target user accepts transfers
                const settings = await loadUserSettings();
                if (settings[targetUser.id]?.transfersEnabled === false) {
                    return this.errorReply(`${targetUser.name} has disabled card transfers.`);
                }

                const userCards = await getUserCards(user.id);
                if (!userCards.length) return this.errorReply('You do not have any cards to transfer.');

                if (cmd !== 'confirmtransferall') {
                    return this.popupReply(
                        `|html|` +
                        `<center><p>Are you sure you want to transfer ALL ${userCards.length} cards to ${targetUser.name}?</p>` +
                        `<button class="button" name="send" value="/psgo card confirmtransferall ${targetUser.id}" style="padding: 15px 30px; font-size: 14px; border-radius: 8px;">` +
                        `Confirm Transfer All Cards` +
                        `</button></center>`
                    );
                }

                const allData = await loadUserCards();
                if (!allData[targetUser.id]) {
                    allData[targetUser.id] = [];
                }
                allData[targetUser.id].push(...userCards);
                allData[user.id] = [];
                await saveUserCards(allData);

                if (targetUser.connected) {
                    targetUser.popup(`|html|${Chat.escapeHTML(user.name)} has transferred ${userCards.length} cards to you!`);
                }

                return this.sendReply(`You have successfully transferred all ${userCards.length} cards to ${targetUser.name}.`);
            },
            transferallhelp: ['/psgo card transferall [user] - Transfers all your cards to another user.'],

            async ladder(target, room, user) {
                if (!this.runBroadcast()) return;
                const allData = await loadUserCards();
                const userPoints: Array<{ name: string; points: number; cards: number }> = [];

                for (const userid in allData) {
                    const cards = allData[userid] || [];
                    let points = 0;
                    for (const card of cards) {
                        points += getCardPoints(card);
                    }
                    if (points > 0) {
                        userPoints.push({
                            name: userid,
                            points,
                            cards: cards.length,
                        });
                    }
                }

                userPoints.sort((a, b) => b.points - a.points);
                const top100 = userPoints.slice(0, 100);

                if (!top100.length) {
                    return this.sendReplyBox('No users have any cards yet.');
                }

                const data = top100.map((entry, index) => {
                    let rankDisplay = (index + 1).toString();
                    if (index === 0) rankDisplay = '🥇 1';
                    else if (index === 1) rankDisplay = '🥈 2';
                    else if (index === 2) rankDisplay = '🥉 3';

                    return [
                        rankDisplay,
                        Impulse.nameColor(entry.name, true, true),
                        entry.points.toLocaleString(),
                        entry.cards.toString(),
                    ];
                });

                const tableHTML = Impulse.generateThemedTable(
                    'PSGO Card Ladder',
                    ['Rank', 'User', 'Points', 'Cards'],
                    data
                );

                return this.sendReplyBox(tableHTML);
            },
            ladderhelp: ['/psgo card ladder - Shows the leaderboard of the users with the most card points.'],

            async transfers(target, room, user) {
                if (!target) return this.parse('/help psgo card transfers');
                const enabled = toID(target) === 'on';
                const settings = await loadUserSettings();
                if (!settings[user.id]) {
                    settings[user.id] = {};
                }
                settings[user.id].transfersEnabled = enabled;
                await saveUserSettings(settings);
                return this.sendReply(`Card transfers have been ${enabled ? 'enabled' : 'disabled'}.`);
            },
            transfershelp: ['/psgo card transfers [on/off] - Enables/disables other users from transferring cards to you.'],

            search(target, room, user) {
                if (!this.runBroadcast()) return;
                return this.sendReplyBox(
                    `<a href="https://psgo.cardjockey.com/cards" target="_blank">` +
                    `<button class="button">Open Card Database</button></a>`
                );
            },
            searchhelp: ['/psgo card search - Shows a link to the card database.'],

            add(target, room, user) {
                if (!isManager(user.id)) this.checkCan('roomowner');
                if (!target) return this.parse('/help psgo card add');
                
                const [setId, cardNumber, name, image, rarity, set, types] =
                    target.split(',').map(x => x.trim());
                
                if (!types) return this.parse('/help psgo card add');
                
                const cardId = makeCardId(setId, cardNumber);
                const nameId = makeCardNameId(setId, name);
                
                if (cardDefinitions[cardId]) return this.errorReply(`The card ${cardId} already exists!`);
                if (cardNameToId[nameId]) return this.errorReply(`A card with name ${name} already exists in set ${setId}.`);
                
                cardDefinitions[cardId] = {
                    id: cardId,
                    name,
                    nameId,
                    image,
                    rarity,
                    set,
                    setId,
                    cardNumber,
                    types,
                };
                
                cardNameToId[nameId] = cardId;
                saveCardDefinitions();
                this.modlog('PSGO CARD ADD', null, cardId);
                return this.sendReply(`Card ${name} (${cardId}) has been added.`);
            },
            addhelp: [
                '/psgo card add [setId], [cardNumber], [name], [image], [rarity], [set], [types] - Adds a card. Requires: Manager or #',
                'Types format examples: "Fire", "Water/Psychic", "Fire - GX", "Psychic/Dark - VMAX"',
                'Special subtypes: EX, GX, V, VMAX, VSTAR, Legend, Prime, Break, Tag Team (get bonus points!)'
            ],

            edit(target, room, user) {
                if (!isManager(user.id)) this.checkCan('roomowner');
                if (!target) return this.parse('/help psgo card edit');
                
                const [setId, cardNumber, name, image, rarity, set, types] =
                    target.split(',').map(x => x.trim());
                
                if (!types) return this.parse('/help psgo card edit');
                
                const cardId = makeCardId(setId, cardNumber);
                if (!cardDefinitions[cardId]) return this.errorReply(`The card ${cardId} does not exist.`);
                
                const newNameId = makeCardNameId(setId, name);
                const oldNameId = cardDefinitions[cardId].nameId;
                
                // Check if name changed and if new name conflicts
                if (newNameId !== oldNameId) {
                    if (cardNameToId[newNameId]) {
                        return this.errorReply(`A card with name ${name} already exists in set ${setId}.`);
                    }
                    // Update name mapping
                    delete cardNameToId[oldNameId];
                    cardNameToId[newNameId] = cardId;
                }
                
                cardDefinitions[cardId] = {
                    id: cardId,
                    name,
                    nameId: newNameId,
                    image,
                    rarity,
                    set,
                    setId,
                    cardNumber,
                    types,
                };
                
                saveCardDefinitions();
                this.modlog('PSGO CARD EDIT', null, cardId);
                return this.sendReply(`Card ${name} (${cardId}) has been updated.`);
            },
            edithelp: ['/psgo card edit [setId], [cardNumber], [name], [image], [rarity], [set], [types] - Edits a card. Requires: Manager or #'],

            delete(target, room, user) {
                if (!isManager(user.id)) this.checkCan('roomowner');
                if (!target) return this.parse('/help psgo card delete');
                const card = getCardFromInput(target);
                if (!card) {
                    return this.errorReply('That card does not exist.');
                }
                delete cardNameToId[card.nameId];
                delete cardDefinitions[card.id];
                saveCardDefinitions();
                this.modlog('PSGO CARD DELETE', null, card.id);
                return this.sendReply(`${card.name} (${card.id}) has been removed from the card database.`);
            },
            deletehelp: ['/psgo card delete [setId-cardNumber|setId-cardName] - Deletes a card. Requires: Manager or #'],

            async give(target, room, user) {
                if (!isManager(user.id)) this.checkCan('globalban');
                if (!target) return this.parse('/help psgo card give');
                const [targetName, cardInput] = target.split(',').map(x => x.trim());
                const targetUser = Users.get(targetName);
                if (!targetUser) return this.errorReply(`User "${targetName}" not found.`);
                if (!targetUser.named) return this.errorReply('Guests cannot receive cards.');
                const card = getCardFromInput(cardInput);
                if (!card) return this.errorReply('That card does not exist.');
                await giveCard(targetUser.id, card.id);
                if (targetUser.connected) {
                    targetUser.popup(`|html|You have received <b>${card.name}</b>!`);
                }
                this.modlog('PSGO CARD GIVE', targetUser, `card: ${card.id}`);
                return this.sendReply(`${targetUser.name} has received ${card.name}.`);
            },
            givehelp: ['/psgo card give [user], [setId-cardNumber|setId-cardName] - Gives the user the specified card. Requires: Manager or @ ~'],

            confirmtakeall: 'take',
            takeall: 'take',
            async take(target, room, user, connection, cmd) {
                if (!isManager(user.id)) this.checkCan('globalban');
                if (!target) return this.parse('/help psgo card take');
                const [targetName, cardInput] = target.split(',').map(x => x.trim());
                let targetUser = Users.get(targetName);
                if (!targetUser) {
                    targetUser = { name: targetName, id: toID(targetName), connected: false } as any;
                }
                const card = getCardFromInput(cardInput);
                if (!card) return this.errorReply('That card does not exist.');
                const success = await takeCard(targetUser.id, card.id);
                if (success) {
                    if (targetUser.connected) {
                        targetUser.popup(`|html|The card <b>${card.name}</b> has been taken from you.`);
                    }
                    this.modlog('PSGO CARD TAKE', targetUser as any, `card: ${card.id}`);
                    return this.sendReply(`${card.name} has been taken from ${targetUser.name}.`);
                }
                return this.errorReply(`${targetUser.name} does not have that card.`);
            },
            takehelp: ['/psgo card take [user], [setId-cardNumber|setId-cardName] - Takes the specified card from the user. Requires: Manager or @ ~'],
        },

        pack: {
            shop(target, room, user) {
                if (!this.runBroadcast()) return;
                const shopPacks = Object.values(packDefinitions).filter(p => p.inShop);
                if (!shopPacks.length) {
                    return this.sendReplyBox('The pack shop is currently empty.');
                }

                const packsHTML = shopPacks.map(pack =>
                    `<tr>` +
                    `<td style="padding: 10px;"><button class="button" name="send" value="/psgo pack buy ${pack.code}">${pack.name}</button></td>` +
                    `<td style="padding: 10px;">${pack.price} ${CURRENCY}</td>` +
                    `<td style="padding: 10px;">${pack.series}</td>` +
                    `</tr>`
                ).join('');

                return this.sendReplyBox(
                    `<div style="max-height: 300px; overflow-y: auto;">` +
                    `<table style="width: 100%; border-collapse: collapse;">` +
                    `<thead><tr><th colspan="3" style="padding: 10px; font-size: 1.2em;">Pack Shop</th></tr>` +
                    `<tr><th style="padding: 5px;">Pack</th><th style="padding: 5px;">Price</th><th style="padding: 5px;">Series</th></tr></thead>` +
                    `<tbody>${packsHTML}</tbody>` +
                    `</table></div>`
                );
            },
            shophelp: ['/psgo pack shop - Shows the shop for buying packs. Use /psgo pack buy [pack] to purchase.'],

            async buy(target, room, user) {
                if (!target) return this.parse('/help psgo pack buy');
                const packCode = toPackCode(target);
                const pack = packDefinitions[packCode];
                if (!pack) return this.errorReply('That pack does not exist.');
                if (!pack.inShop) return this.errorReply('That pack is not available in the shop.');
                const userMoney = Economy.readMoney(user.id);
                if (userMoney < pack.price) {
                    return this.errorReply(`You need at least ${pack.price} ${CURRENCY} to buy this pack!`);
                }
                Economy.takeMoney(user.id, pack.price, `Purchased ${pack.name} pack`, 'system');
                await addUserPack(user.id, packCode);
                return this.sendReplyBox(
                    `You have purchased a <b>${pack.name}</b> pack for ${pack.price} ${CURRENCY}!<br>` +
                    `<button class="button" name="send" value="/psgo packs">View Your Packs</button>`
                );
            },
            buyhelp: ['/psgo pack buy [pack] - Buy a pack from the shop.'],

            async open(target, room, user) {
                if (!this.runBroadcast()) return;
                if (!target) return this.parse('/help psgo pack open');
                const packCode = toPackCode(target);
                const userPacks = await getUserPacks(user.id);
                if (!userPacks.includes(packCode)) {
                    return this.errorReply(`You do not have a ${packCode} pack.`);
                }

                await removeUserPack(user.id, packCode);
                const cards = makePack(packCode);

                if (!cards.length) {
                    return this.errorReply(`No cards available for pack ${packCode}. Please contact an admin.`);
                }

                const allData = await loadUserCards();
                if (!allData[user.id]) {
                    allData[user.id] = [];
                }
                allData[user.id].push(...cards);
                await saveUserCards(allData);

                const packInfo = packDefinitions[packCode];
                const packName = packInfo ? packInfo.name : packCode;

                const cardsHTML = cards.map(card =>
                    `<button class="button" name="send" value="/psgo card show ${card.id}" style="margin: 2px;">` +
                    `<img src="${card.image}" title="${card.name}" height="100" width="80"></button>`
                ).join('');

                return this.sendReplyBox(
                    `<div style="margin-bottom: 10px;">You opened a <b>${packName}</b> pack and received ${cards.length} cards:</div>` +
                    `<div>${cardsHTML}</div>`
                );
            },
            openhelp: ['/psgo pack open [set code] - Opens the specified card pack.'],

            async usecredit(target, room, user) {
                if (!target) return this.parse('/help psgo pack usecredit');
                const packCode = toPackCode(target);
                const pack = packDefinitions[packCode];
                if (!pack) return this.errorReply('That pack does not exist.');
                if (!pack.creditPack) return this.errorReply('That pack is not available for pack credits.');
                const credits = await getPackCredits(user.id);
                if (credits < 1) {
                    return this.errorReply('You do not have any pack credits.');
                }
                const success = await takePackCredits(user.id, 1);
                if (!success) return this.errorReply('Failed to use pack credit.');
                await addUserPack(user.id, packCode);
                return this.sendReplyBox(
                    `You have used 1 pack credit to purchase a <b>${pack.name}</b> pack!<br>` +
                    `Remaining credits: ${credits - 1}<br>` +
                    `<button class="button" name="send" value="/psgo pack open ${packCode}">Open Pack</button>`
                );
            },
            usecredithelp: ['/psgo pack usecredit [id] - Uses 1 pack credit to buy the pack.'],

            confirmtransfer: 'transfer',
            async transfer(target, room, user, connection, cmd) {
                if (!target) return this.parse('/help psgo pack transfer');
                const [targetName, packCode] = target.split(',').map(x => x.trim());
                const targetUser = Users.get(targetName);
                if (!targetUser) return this.errorReply(`User "${targetName}" not found.`);
                if (!targetUser.named) return this.errorReply('Guests cannot receive packs.');
                if (targetUser.id === user.id) return this.errorReply('You cannot transfer packs to yourself.');

                const code = toPackCode(packCode);
                const pack = packDefinitions[code];
                if (!pack) return this.errorReply('That pack does not exist.');

                const userPacks = await getUserPacks(user.id);
                if (!userPacks.includes(code)) {
                    return this.errorReply('You do not have that pack.');
                }

                if (cmd !== 'confirmtransfer') {
                    return this.popupReply(
                        `|html|` +
                        `<center><button class="button" name="send" value="/psgo pack confirmtransfer ${targetUser.id}, ${code}" style="padding: 15px 30px; font-size: 14px; border-radius: 8px;">` +
                        `Confirm transfer ${pack.name} pack to<br><b style="color: ${Impulse.hashColor(targetUser.id)}">${Chat.escapeHTML(targetUser.name)}</b>` +
                        `</button></center>`
                    );
                }

                const success = await removeUserPack(user.id, code);
                if (!success) return this.errorReply('Transfer failed. Please try again.');
                await addUserPack(targetUser.id, code);

                if (targetUser.connected) {
                    targetUser.popup(
                        `|html|${Chat.escapeHTML(user.name)} has given you a ${pack.name} pack!<br>` +
                        `<button class="button" name="send" value="/psgo pack open ${code}">Open Pack</button>`
                    );
                }

                return this.sendReply(`You have successfully transferred a ${pack.name} pack to ${targetUser.name}.`);
            },
            transferhelp: ['/psgo pack transfer [user], [set code] - Transfer a specified pack to another user.'],

            add(target, room, user) {
                if (!isManager(user.id)) this.checkCan('roomowner');
                if (!target) return this.parse('/help psgo pack add');
                const [code, name, series, releaseDate, priceStr, inShopStr, creditPackStr] =
                    target.split(',').map(x => x.trim());
                if (!creditPackStr) return this.parse('/help psgo pack add');
                const packCode = toID(code);
                if (packDefinitions[packCode]) return this.errorReply(`The pack ${packCode} already exists!`);

                packDefinitions[packCode] = {
                    code: packCode,
                    name,
                    series,
                    releaseDate,
                    price: parseInt(priceStr) || 0,
                    inShop: inShopStr === 'true',
                    creditPack: creditPackStr === 'true',
                };

                savePackDefinitions();
                this.modlog('PSGO PACK ADD', null, packCode);
                return this.sendReply(`Pack ${packCode} has been added.`);
            },
            addhelp: ['/psgo pack add [code], [name], [series], [releaseDate], [price], [inShop], [creditPack] - Adds a pack. Requires: Manager or #'],

            edit(target, room, user) {
                if (!isManager(user.id)) this.checkCan('roomowner');
                if (!target) return this.parse('/help psgo pack edit');
                const [code, name, series, releaseDate, priceStr, inShopStr, creditPackStr] =
                    target.split(',').map(x => x.trim());
                if (!creditPackStr) return this.parse('/help psgo pack edit');
                const packCode = toID(code);
                if (!packDefinitions[packCode]) return this.errorReply(`The pack ${packCode} does not exist.`);

                packDefinitions[packCode] = {
                    code: packCode,
                    name,
                    series,
                    releaseDate,
                    price: parseInt(priceStr) || 0,
                    inShop: inShopStr === 'true',
                    creditPack: creditPackStr === 'true',
                };

                savePackDefinitions();
                this.modlog('PSGO PACK EDIT', null, packCode);
                return this.sendReply(`Pack ${packCode} has been updated.`);
            },
            edithelp: ['/psgo pack edit [code], [name], [series], [releaseDate], [price], [inShop], [creditPack] - Edits a pack. Requires: Manager or #'],

            delete(target, room, user) {
                if (!isManager(user.id)) this.checkCan('roomowner');
                if (!target) return this.parse('/help psgo pack delete');
                const packCode = toID(target);
                if (!packDefinitions[packCode]) {
                    return this.errorReply('That pack does not exist.');
                }
                delete packDefinitions[packCode];
                savePackDefinitions();
                this.modlog('PSGO PACK DELETE', null, packCode);
                return this.sendReply(`${packCode} has been removed from the pack database.`);
            },
            deletehelp: ['/psgo pack delete [id] - Deletes a pack. Requires: Manager or #'],

            async give(target, room, user) {
                if (!isManager(user.id)) this.checkCan('globalban');
                if (!target) return this.parse('/help psgo pack give');
                const [targetName, packCode] = target.split(',').map(x => x.trim());
                const targetUser = Users.get(targetName);
                if (!targetUser) return this.errorReply(`User "${targetName}" not found.`);
                const code = toPackCode(packCode);
                const pack = packDefinitions[code];
                if (!pack) return this.errorReply(`The pack "${packCode}" does not exist.`);
                await addUserPack(targetUser.id, code);
                if (targetUser.connected) {
                    targetUser.popup(`|html|You have received a <b>${pack.name}</b> pack!`);
                }
                this.modlog('PSGO PACK GIVE', targetUser, code);
                return this.sendReply(`${targetUser.name} has received a ${pack.name} pack.`);
            },
            givehelp: ['/psgo pack give [user], [set code] - Gives the user the specified pack. Requires: Manager or @ ~'],

            async take(target, room, user) {
                if (!isManager(user.id)) this.checkCan('globalban');
                if (!target) return this.parse('/help psgo pack take');
                const [targetName, packCode] = target.split(',').map(x => x.trim());
                let targetUser = Users.get(targetName);
                if (!targetUser) {
                    targetUser = { name: targetName, id: toID(targetName), connected: false } as any;
                }
                const code = toPackCode(packCode);
                const pack = packDefinitions[code];
                if (!pack) return this.errorReply(`"${packCode}" is not a valid pack.`);
                const success = await removeUserPack(targetUser.id, code);
                if (!success) return this.errorReply(`${targetUser.name} does not have any ${pack.name} packs.`);
                if (targetUser.connected) {
                    targetUser.popup(`|html|A <b>${pack.name}</b> pack has been taken from you.`);
                }
                this.modlog('PSGO PACK TAKE', targetUser as any, code);
                return this.sendReply(`A ${pack.name} pack has been taken from ${targetUser.name}.`);
            },
            takehelp: ['/psgo pack take [user], [set code] - Takes the specified pack from the user. Requires: Manager or @ ~'],

            credit: {
                async give(target, room, user) {
                    if (!isManager(user.id)) this.checkCan('globalban');
                    if (!target) return this.parse('/help psgo pack credit give');
                    const [targetName, amountStr] = target.split(',').map(x => x.trim());
                    const targetUser = Users.get(targetName);
                    if (!targetUser) return this.errorReply(`User "${targetName}" not found.`);
                    const amount = parseInt(amountStr);
                    if (isNaN(amount) || amount <= 0) {
                        return this.errorReply('Invalid amount. Must be a positive number.');
                    }
                    await addPackCredits(targetUser.id, amount);
                    if (targetUser.connected) {
                        targetUser.popup(`|html|You have received <b>${amount}</b> pack credit${amount === 1 ? '' : 's'}!`);
                    }
                    this.modlog('PSGO PACK CREDIT GIVE', targetUser, `${amount} credits`);
                    return this.sendReply(`${targetUser.name} has received ${amount} pack credit${amount === 1 ? '' : 's'}.`);
                },
                givehelp: ['/psgo pack credit give [user], [amount] - Gives the user the specified amount of pack credits. Requires: Manager or @ ~'],

                async take(target, room, user) {
                    if (!isManager(user.id)) this.checkCan('globalban');
                    if (!target) return this.parse('/help psgo pack credit take');
                    const [targetName, amountStr] = target.split(',').map(x => x.trim());
                    let targetUser = Users.get(targetName);
                    if (!targetUser) {
                        targetUser = { name: targetName, id: toID(targetName), connected: false } as any;
                    }
                    const amount = parseInt(amountStr);
                    if (isNaN(amount) || amount <= 0) {
                        return this.errorReply('Invalid amount. Must be a positive number.');
                    }
                    const success = await takePackCredits(targetUser.id, amount);
                    if (!success) {
                        return this.errorReply(`${targetUser.name} does not have enough pack credits.`);
                    }
                    if (targetUser.connected) {
                        targetUser.popup(`|html|<b>${amount}</b> pack credit${amount === 1 ? '' : 's'} ha${amount === 1 ? 's' : 've'} been taken from you.`);
                    }
                    this.modlog('PSGO PACK CREDIT TAKE', targetUser as any, `${amount} credits`);
                    return this.sendReply(`${amount} pack credit${amount === 1 ? '' : 's'} ha${amount === 1 ? 's' : 've'} been taken from ${targetUser.name}.`);
                },
                takehelp: ['/psgo pack credit take [user], [amount] - Takes the specified amount of pack credits from the user. Requires: Manager or @ ~'],
            },
        },

        async packs(target, room, user) {
            const userPacks = await getUserPacks(user.id);
            if (!userPacks.length) {
                return this.errorReply('You do not have any packs.');
            }

            const packCounts: Record<string, number> = {};
            for (const pack of userPacks) {
                packCounts[pack] = (packCounts[pack] || 0) + 1;
            }

            const packsHTML = Object.entries(packCounts).map(([code, count]) => {
                const pack = packDefinitions[code];
                const packName = pack ? pack.name : code;
                return `<div style="margin: 5px 0;">` +
                    `<button class="button" name="send" value="/psgo pack open ${code}">Open ${packName} Pack</button> ` +
                    `(${count} remaining)` +
                    `</div>`;
            }).join('');

            const credits = await getPackCredits(user.id);

            return this.sendReplyBox(
                `<div style="font-weight: bold; margin-bottom: 10px;">Your Unopened Packs</div>` +
                `${packsHTML}` +
                `<div style="margin-top: 10px;">Pack Credits: ${credits}</div>`
            );
        },
        packshelp: ['/psgo packs - Shows all the packs you currently have.'],

        trade(target, room, user) {
            if (!this.runBroadcast()) return;
            return this.sendReplyBox(
                `<a href="https://psgo.cardjockey.com/trade" target="_blank">` +
                `<button class="button">Open Trade Market</button></a>`
            );
        },
        tradehelp: ['/psgo trade - Shows a link to the trade market.'],

        async showcase(target, room, user) {
            if (!this.runBroadcast()) return;
            
            const [targetName, pageStr] = target.split(',').map(x => x.trim());
            const targetUser = targetName ? toID(targetName) : user.id;
            const page = parseInt(pageStr) || 1;
            const cardsPerPage = 100;
            
            const cards = await getUserCards(targetUser);
            if (!cards.length) {
                return this.sendReplyBox(`${Impulse.nameColor(targetUser, true, true)} has no cards.`);
            }
            
            const settings = await loadUserSettings();
            const sortType = settings[user.id]?.showcaseSort || 'rarity';
            
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
                default: // rarity
                    const rarityOrder = ['Mythic', 'Legendary', 'Ultra Rare', 'Rare', 'Uncommon', 'Common'];
                    sortedCards.sort((a, b) => {
                        const aIdx = rarityOrder.indexOf(a.rarity);
                        const bIdx = rarityOrder.indexOf(b.rarity);
                        return aIdx - bIdx;
                    });
            }
            
            const broadcasting = this.broadcasting;
            const startIdx = (page - 1) * cardsPerPage;
            const endIdx = Math.min(startIdx + cardsPerPage, sortedCards.length);
            const totalPages = Math.ceil(sortedCards.length / cardsPerPage);
            const displayCards = broadcasting ? sortedCards.slice(0, cardsPerPage) : sortedCards.slice(startIdx, endIdx);
            
            const cardsHTML = displayCards.map(card => {
                return `<button class="button" name="send" value="/psgo card show ${card.id}" style="margin: 2px;">` +
                    `<img src="${card.image}" height="120" width="100" title="${card.name}"></button>`;
            }).join('');
            
            let pagination = '';
            if (!broadcasting && totalPages > 1) {
                pagination = '<div style="text-align: center; margin-top: 10px;">';
                if (page > 1) {
                    pagination += `<button class="button" name="send" value="/psgo showcase ${targetUser}, ${page - 1}">Previous</button> `;
                }
                pagination += `Page ${page} of ${totalPages}`;
                if (page < totalPages) {
                    pagination += ` <button class="button" name="send" value="/psgo showcase ${targetUser}, ${page + 1}">Next</button>`;
                }
                pagination += '</div>';
            }
            
            return this.sendReplyBox(
                `<div style="max-height: 300px; overflow-y: auto;">${cardsHTML}</div>` +
                pagination +
                `<div style="text-align: center; margin-top: 10px; font-weight: bold;">` +
                `${Impulse.nameColor(targetUser, true, true)} has ${cards.length} card${cards.length === 1 ? '' : 's'}` +
                `${!broadcasting && user.id === targetUser ? ` (Sorted by: ${sortType})` : ''}` +
                `</div>`
            );
        },
        showcasehelp: ['/psgo showcase [user], [page] - Displays a list of all cards a user has.'],

        async sortshowcase(target, room, user) {
            if (!target) return this.parse('/help psgo sortshowcase');
            
            const validTypes = ['rarity', 'points', 'types', 'name', 'date'];
            const sortType = toID(target);
            
            if (!validTypes.includes(sortType)) {
                return this.errorReply(`Invalid sort type. Valid types: ${validTypes.join(', ')}`);
            }
            
            const settings = await loadUserSettings();
            if (!settings[user.id]) {
                settings[user.id] = {};
            }
            
            settings[user.id].showcaseSort = sortType as any;
            await saveUserSettings(settings);
            
            return this.sendReply(`Your showcase is now sorted by ${sortType}.`);
        },
        sortshowcasehelp: ['/psgo sortshowcase [type] - Changes the order of how cards are displayed in your showcase. Types: rarity, points, types, name, date'],

        manager: {
            async add(target, room, user) {
                this.checkCan('roomowner');
                if (!target) return this.parse('/help psgo manager add');
                const targetUser = Users.get(target);
                if (!targetUser) return this.errorReply(`User "${target}" not found.`);
                const managers = await loadManagers();
                if (managers.managers.includes(targetUser.id)) {
                    return this.errorReply(`${targetUser.name} is already a card manager.`);
                }
                managers.managers.push(targetUser.id);
                await saveManagers(managers);
                if (targetUser.connected) {
                    targetUser.popup(`|html|You have been given card manager privileges!`);
                }
                this.modlog('PSGO MANAGER ADD', targetUser);
                return this.sendReply(`${targetUser.name} has been given card manager privileges.`);
            },
            addhelp: ['/psgo manager add [user] - Gives the user card manager privileges. Requires: #'],

            async remove(target, room, user) {
                this.checkCan('roomowner');
                if (!target) return this.parse('/help psgo manager remove');
                const targetUserId = toID(target);
                const managers = await loadManagers();
                const idx = managers.managers.indexOf(targetUserId);
                if (idx === -1) {
                    return this.errorReply(`${target} is not a card manager.`);
                }
                managers.managers.splice(idx, 1);
                await saveManagers(managers);
                const targetUser = Users.get(targetUserId);
                if (targetUser?.connected) {
                    targetUser.popup(`|html|Your card manager privileges have been removed.`);
                }
                this.modlog('PSGO MANAGER REMOVE', targetUser || targetUserId as any);
                return this.sendReply(`${target}'s card manager privileges have been removed.`);
            },
            removehelp: ['/psgo manager remove [user] - Takes manager privileges from the user. Requires: #'],

            async list(target, room, user) {
                if (!this.runBroadcast()) return;
                const managers = await loadManagers();
                if (!managers.managers.length) {
                    return this.sendReplyBox('There are no card managers.');
                }
                const managersHTML = managers.managers.map(id =>
                    Impulse.nameColor(id, true, true)
                ).join(', ');
                return this.sendReplyBox(`<div style="font-weight: bold; margin-bottom: 10px;">Card Managers:</div>${managersHTML}`);
            },
            listhelp: ['/psgo manager list - Shows all card managers.'],
        },

        '': 'help',
        help(target, room, user) {
            if (!this.runBroadcast()) return;
            return this.parse('/help psgo');
        },
    },

    psgohelp: [
        'User Commands:',
        '/psgo card show [setId-cardNumber|setId-cardName] - Displays the details of a card.',
        '/psgo card transfer [user], [setId-cardNumber|setId-cardName] - Transfer a specified card to another user.',
        '/psgo card transferall [user] - Transfers all your cards to another user.',
        '/psgo card ladder - Shows the leaderboard of the users with the most card points.',
        '/psgo card transfers [on/off] - Enables/disables other users from transferring cards to you.',
        '/psgo card search - Shows a link to the card database.',
        '/psgo pack shop - Shows the shop for buying packs.',
        '/psgo packs - Shows all the packs you currently have.',
        '/psgo pack open [set code] - Opens the specified card pack.',
        '/psgo pack usecredit [id] - Uses 1 pack credit to buy the pack.',
        '/psgo pack transfer [user], [set code] - Transfer a specified pack to another user.',
        '/psgo trade - Shows a link to the trade market.',
        '/psgo showcase [user], [page] - Displays a list of all cards a user has.',
        '/psgo sortshowcase [type] - Changes the order of how cards are displayed in your showcase.',
        '',
        'Administrator Commands:',
        '/psgo card add [setId], [cardNumber], [name], [image], [rarity], [set], [types] - Adds a card. Requires: Manager or #',
        '• Types format: "Fire", "Water/Psychic", "Fire - GX", "Psychic/Dark - VMAX"',
        '• Special subtypes get bonus points: EX, GX, V, VMAX, VSTAR, Legend, Prime, Break, Tag Team',
        '/psgo card edit [setId], [cardNumber], [name], [image], [rarity], [set], [types] - Edits a card. Requires: Manager or #',
        '/psgo card delete [setId-cardNumber|setId-cardName] - Deletes a card. Requires: Manager or #',
        '/psgo pack add [code], [name], [series], [releaseDate], [price], [inShop], [creditPack] - Adds a pack. Requires: Manager or #',
        '/psgo pack edit [code], [name], [series], [releaseDate], [price], [inShop], [creditPack] - Edits a pack. Requires: Manager or #',
        '/psgo pack delete [id] - Deletes a pack. Requires: Manager or #',
        '/psgo card give [user], [setId-cardNumber|setId-cardName] - Gives the user the specified card. Requires: Manager or @ ~',
        '/psgo card take [user], [setId-cardNumber|setId-cardName] - Takes the specified card from the user. Requires: Manager or @ ~',
        '/psgo pack give [user], [set code] - Gives the user the specified pack. Requires: Manager or @ ~',
        '/psgo pack take [user], [set code] - Takes the specified pack from the user. Requires: Manager or @ ~',
        '/psgo pack credit give [user], [amount] - Gives the user the specified amount of pack credits. Requires: Manager or @ ~',
        '/psgo pack credit take [user], [amount] - Takes the specified amount of pack credits from the user. Requires: Manager or @ ~',
        '/psgo manager add [user] - Gives the user card manager privileges. Requires: #',
        '/psgo manager remove [user] - Takes manager privileges from the user. Requires: #',
    ],

    // Shortcut commands
    showcase(target, room, user) {
        if (!this.runBroadcast()) return;
        return this.parse(`/psgo showcase ${target}`);
    },
    showcasehelp: ['/showcase [user], [page] - Displays a list of all cards a user has.'],

    cardsearch(target, room, user) {
        return this.parse('/psgo card search');
    },
    cardsearchhelp: ['/cardsearch - Search for cards.'],

    cardladder(target, room, user) {
        if (!this.runBroadcast()) return;
        return this.parse('/psgo card ladder');
    },
    cardladderhelp: ['/cardladder - Display the PSGO points leaderboard.'],

    checkpacks(target, room, user) {
        return this.parse('/psgo packs');
    },
    checkpackshelp: ['/checkpacks - View your unopened packs.'],

    openpack(target, room, user) {
        if (!this.runBroadcast()) return;
        return this.parse(`/psgo pack open ${target}`);
    },
    openpackhelp: ['/openpack [set code] - Open one of your packs.'],
};

// ================ Page Handlers ================
export const pages: Chat.PageTable = {
    async psgo(args, user) {
        const [action, ...params] = args;

        if (action === 'collection') {
            const targetUser = params[0] ? toID(params[0]) : user.id;
            const cards = await getUserCards(targetUser);

            if (!cards.length) {
                return `<div class="pad"><h2>${Impulse.nameColor(targetUser, true, true)} has no cards.</h2></div>`;
            }

            // Group cards by rarity
            const cardsByRarity: Record<string, CardInstance[]> = {};
            for (const card of cards) {
                if (!cardsByRarity[card.rarity]) cardsByRarity[card.rarity] = [];
                cardsByRarity[card.rarity].push(card);
            }

            let output = '<div class="pad">';
            output += `<h2>${Impulse.nameColor(targetUser, true, true)}'s Card Collection (${cards.length} cards)</h2>`;

            const rarityOrder: CardRarity[] = ['Mythic', 'Legendary', 'Ultra Rare', 'Rare', 'Uncommon', 'Common'];
            for (const rarity of rarityOrder) {
                if (!cardsByRarity[rarity]) continue;

                output += `<h3 style="color: ${RARITY_COLORS[rarity]}">${rarity} (${cardsByRarity[rarity].length})</h3>`;
                output += '<div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 20px;">';

                for (const card of cardsByRarity[rarity]) {
                    const { subtype } = parseCardTypes(card.types);
                    const buttonStyle = subtype && SPECIAL_SUBTYPES[subtype] 
                        ? `padding: 0; border: 2px solid ${SPECIAL_SUBTYPES[subtype].color}; box-shadow: 0 0 8px ${SPECIAL_SUBTYPES[subtype].color}40;`
                        : 'padding: 0;';
                    
                    output += `<button class="button" name="send" value="/psgo card show ${card.id}" style="${buttonStyle}">` +
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