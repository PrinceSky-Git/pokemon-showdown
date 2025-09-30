/**
 * Pokemon Showdown
 * PSGO Collectable Pokemon Cards System
 * Refactor By ClarkJ338 - Cache-Free Version
 * @license MIT
 */

// ================ Configuration ================
const CARDS_PER_PACK = 10;
const CURRENCY = Impulse.currency || 'coins';

// ================ Interfaces ================
interface Card {
    id: string;
    name: string;
    nameId: string;
    image: string;
    rarity: string;
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
    await cardDefinitions.clear(true); // Clear as object
    await cardDefinitions.insert(cards);
}

async function saveAllPacks(packs: Record<string, PackDefinition>): Promise<void> {
    await packDefinitions.clear(true); // Clear as object
    await packDefinitions.insert(packs);
}

// ================ Constants ================
const RARITY_POINTS: Record<CardRarity, number> = {
    Common: 1, Uncommon: 3, Rare: 6, 'Ultra Rare': 10, Legendary: 15, Mythic: 20,
};

const RARITY_COLORS: Record<CardRarity, string> = {
    Common: '#0066ff', Uncommon: '#008000', Rare: '#cc0000', 'Ultra Rare': '#800080',
    Legendary: '#c0c0c0', Mythic: '#998200',
};

const SPECIAL_SUBTYPES: Record<string, { color: string; glow: boolean }> = {
    EX: { color: '#FFD700', glow: true }, GX: { color: '#FF6B35', glow: true },
    V: { color: '#00D4AA', glow: true }, VMAX: { color: '#FF1493', glow: true },
    VSTAR: { color: '#9932CC', glow: true }, Legend: { color: '#B8860B', glow: true },
    Prime: { color: '#32CD32', glow: true }, Break: { color: '#FF4500', glow: true },
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

async function getCardById(cardId: string): Promise<Card | null> {
    const allCards = await getAllCards();
    return allCards[cardId] || null;
}

function getCardByIdSync(cardId: string): Card | null {
    const allCards = getAllCardsSync();
    return allCards[cardId] || null;
}

async function getCardByNameId(nameId: string): Promise<Card | null> {
    const allCards = await getAllCards();
    // Build nameId lookup on the fly
    for (const cardId in allCards) {
        if (allCards[cardId].nameId === nameId) {
            return allCards[cardId];
        }
    }
    return null;
}

function getCardByNameIdSync(nameId: string): Card | null {
    const allCards = getAllCardsSync();
    // Build nameId lookup on the fly
    for (const cardId in allCards) {
        if (allCards[cardId].nameId === nameId) {
            return allCards[cardId];
        }
    }
    return null;
}

async function getCardFromInput(input: string): Promise<Card | null> {
    if (!input || !input.includes('-')) return null;
    const byId = await getCardById(input);
    if (byId) return byId;
    return await getCardByNameId(input);
}

function getCardFromInputSync(input: string): Card | null {
    if (!input || !input.includes('-')) return null;
    const byId = getCardByIdSync(input);
    if (byId) return byId;
    return getCardByNameIdSync(input);
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

function getSubtypeBonus(types: string): number {
    if (!types) return 0;
    const t = types.toUpperCase();
    if (t.includes('VMAX') || t.includes('VSTAR')) return 5;
    if (t.includes('GX') || t.includes('EX') || t.includes('V ')) return 3;
    if (t.includes('LEGEND') || t.includes('PRIME')) return 4;
    if (t.includes('TAG TEAM')) return 6;
    if (t.includes('BREAK')) return 2;
    return 0;
}

function getCardPoints(card: Card): number {
    const base = RARITY_POINTS[card.rarity as CardRarity] || 1;
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

async function makePack(setId: string): Promise<CardInstance[]> {
    const out: CardInstance[] = [];
    const allCards = await getAllCards();
    const packCards = Object.values(allCards).filter(c => c.setId === setId);
    if (!packCards.length) return out;
    for (let i = 0; i < CARDS_PER_PACK; i++) {
        const randomCard = packCards[Math.floor(Math.random() * packCards.length)];
        out.push({ ...randomCard, obtainedAt: Date.now() });
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
    const formattedTypes = formatCardTypes(card.types);
    const { subtype } = parseCardTypes(card.types);
    const rarityColor = RARITY_COLORS[card.rarity as CardRarity] || '#cc0000';
    
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
            const card = await getCardFromInput(target);
            if (!card) return this.errorReply('Card not found. Use format: setId-cardNumber or setId-cardName');
            return this.sendReplyBox(displayCard(card));
        },
        showhelp: ['/psgo show [setId-cardNumber|setId-cardName] - Show card details'],

        confirmgive: 'give',
        async give(target, room, user, connection, cmd) {
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
            if (targetUser.id === user.id) return this.errorReply('You cannot transfer cards to yourself.');

            const settings = await userSettings.getIn(targetUser.id);
            if (settings?.transfersEnabled === false) {
                return this.errorReply(`${targetUser.name} has disabled card transfers.`);
            }

            const card = await getCardFromInput(cardInput);
            if (!card) return this.errorReply('Card not found. Use format: setId-cardNumber or setId-cardName');
            
            const isAdminOrManager = await isManager(user.id) || this.can('globalban', null, room);
            
            if (isAdminOrManager) {
                await giveCard(targetUser.id, card.id);
                if (targetUser.connected) {
                    targetUser.popup(`|html|You received <b>${card.name}</b> from ${user.name}!`);
                }
                this.modlog('PSGO GIVE', targetUser, `card: ${card.id}`);
                return this.sendReply(`Gave ${card.name} to ${targetUser.name}.`);
            }

            const userHasCard = await hasCard(user.id, card.id);
            if (!userHasCard) return this.errorReply('You do not have that card.');

            if (cmd !== 'confirmgive') {
                return this.popupReply(
                    `|html|<center><button class="button" name="send" value="/psgo confirmgive ${targetUser.id}, ${card.id}" style="padding: 15px 30px; font-size: 14px; border-radius: 8px;">` +
                    `Confirm give ${card.name} to<br><b style="color: ${Impulse.hashColor(targetUser.id)}">${Chat.escapeHTML(targetUser.name)}</b>` +
                    `</button></center>`
                );
            }

            const success = await takeCard(user.id, card.id);
            if (!success) return this.errorReply('Transfer failed. Please try again.');
            await giveCard(targetUser.id, card.id);

            if (targetUser.connected) {
                targetUser.popup(`|html|${Chat.escapeHTML(user.name)} gave you <b>${card.name}</b>!`);
            }
            return this.sendReply(`You gave ${card.name} to ${targetUser.name}.`);
        },
        givehelp: ['/psgo give [user], [card] - Transfer card to user (admins can give any card)'],

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
                default:
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
			 // Filter out invalid cards
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
				 const rarityColor = RARITY_COLORS[card.rarity as CardRarity] || '#cc0000';
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
				 
				 // Just warn if similar name exists, don't block
				 for (const existingCardId in allCards) {
					 if (allCards[existingCardId].nameId === nameId && existingCardId !== cardId) {
						 this.sendReply(`⚠️ Warning: Similar card name exists: ${existingCardId}`);
					 }
				 }
				 
				 allCards[cardId] = { id: cardId, name, nameId, image, rarity, set, setId, cardNumber, types };
				 await saveAllCards(allCards);
				 this.modlog('PSGO ADD CARD', null, cardId);
				 return this.sendReply(`Added card: ${name} (${cardId})`);

			 } else if (parts.length === 6) {
				 const [code, name, series, releaseDate, priceStr, flags] = parts;
				 const packCode = toID(code);
				 const allPacks = await getAllPacks();
        
				 if (allPacks[packCode]) return this.errorReply(`Pack ${packCode} already exists!`);

				 const inShop = flags.includes('shop');
				 const creditPack = flags.includes('credit');

				 allPacks[packCode] = {
					 code: packCode, name, series, releaseDate,
					 price: parseInt(priceStr) || 0, inShop, creditPack
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
			 'Types: "Fire", "Fire - GX", "Water/Psychic - VMAX". Subtypes get bonus points!'
		 ],
		 
		 async edit(target, room, user) {
			 const isManagerUser = await isManager(user.id);
			 if (!isManagerUser) this.checkCan('roomowner');
			 if (!target) return this.parse('/help psgo edit');

			 const parts = target.split(',').map(x => x.trim());
			 const id = parts[0];

			 // Try to edit as card first
			 const card = await getCardFromInput(id);
			 if (card && parts.length === 6) {
				 const [, name, image, rarity, set, types] = parts;
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
					 rarity,
					 set,
					 setId: card.setId,
					 cardNumber: card.cardNumber,
					 types
				 };
				 await saveAllCards(allCards);
				 this.modlog('PSGO EDIT CARD', null, card.id);
				 return this.sendReply(`Edited card: ${name}`);
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
            

			 const card = await getCardFromInput(target);
			 if (card) {
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
                    if (!isManagerUser) this.checkCan('globalban');
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
                    if (!isManagerUser2) this.checkCan('globalban');
                    const takeUser = Users.get(targetName) || { name: targetName, id: toID(targetName), connected: false } as any;
                    const takeCardObj = await getCardFromInput(amountStr || '');
                    if (!takeCardObj) return this.errorReply('Card not found.');
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
            '/psgo manage add, [user] - Add manager (requires #)',
            '/psgo manage remove, [user] - Remove manager (requires #)', 
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
                        `</ul>` +
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
                        `<td style="padding: 8px;">/psgo show base1-25<br>/psgo show base1-charizard</td>` +
                        `<td style="padding: 8px;">Everyone</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo give</code></td>` +
                        `<td style="padding: 8px;">/psgo give username, base1-25<br>/psgo give base1-25, username</td>` +
                        `<td style="padding: 8px;">Card owner<br>(Admins: any card)</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo collection</code></td>` +
                        `<td style="padding: 8px;">/psgo collection<br>/psgo collection username<br>/psgo collection username, 2, points</td>` +
                        `<td style="padding: 8px;">Everyone</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo ladder</code></td>` +
                        `<td style="padding: 8px;">/psgo ladder</td>` +
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
                        `<tr><td style="padding: 8px;"><code>/psgo add</code></td>` +
                        `<td style="padding: 8px;"><strong>Card:</strong><br>/psgo add base1, 25, Charizard, [url], Rare, Base Set, Fire<br><br>` +
                        `<strong>Pack:</strong><br>/psgo add base1, Base Set, Generation 1, 1999-01-09, 100, shop</td>` +
                        `<td style="padding: 8px;">Manager or #</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo edit</code></td>` +
                        `<td style="padding: 8px;">/psgo edit base1-25, Charizard, [url], Rare, Base Set, Fire - EX</td>` +
                        `<td style="padding: 8px;">Manager or #</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo delete</code></td>` +
                        `<td style="padding: 8px;">/psgo delete base1-25<br>/psgo delete base1</td>` +
                        `<td style="padding: 8px;">Manager or #</td></tr>` +
                        `<tr><td style="padding: 8px;"><code>/psgo manage</code></td>` +
                        `<td style="padding: 8px;"><strong>Add manager:</strong> /psgo manage add, username<br>` +
                        `<strong>Remove:</strong> /psgo manage remove, username<br>` +
                        `<strong>List:</strong> /psgo manage list<br>` +
                        `<strong>Credits:</strong> /psgo manage credits, username, 5<br>` +
                        `<strong>Take card:</strong> /psgo manage take, username, base1-25</td>` +
                        `<td style="padding: 8px;">Manager or #</td></tr>` +
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
                        `<td style="padding: 8px;">/psgo set transfers, on<br>/psgo set transfers, off</td>` +
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
                        `<li><code>setId-cardNumber</code> → base1-25</li>` +
                        `<li><code>setId-cardname</code> → base1-charizard</li>` +
                        `</ul>` +
                        `<p><strong>Types Format:</strong></p>` +
                        `<ul>` +
                        `<li>Basic: <code>Fire</code>, <code>Water</code>, <code>Grass</code></li>` +
                        `<li>Dual: <code>Fire/Flying</code>, <code>Water/Psychic</code></li>` +
                        `<li>Special: <code>Fire - GX</code>, <code>Water - VMAX</code></li>` +
                        `</ul>` +
                        `<p><strong>Special Subtypes (Bonus Points):</strong></p>` +
                        `<ul>` +
                        `<li>+2: BREAK</li>` +
                        `<li>+3: EX, GX, V</li>` +
                        `<li>+4: LEGEND, PRIME</li>` +
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
                        `<li>User buys → <code>/psgo buy base1</code></li>` +
                        `<li>User opens → <code>/psgo open base1</code></li>` +
                        `<li>View collection → <code>/psgo collection</code></li>` +
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

            const cardsByRarity: Record<string, CardInstance[]> = {};
            for (const card of cards) {
                if (!cardsByRarity[card.rarity]) cardsByRarity[card.rarity] = [];
                cardsByRarity[card.rarity].push(card);
            }

            let output = '<div class="pad">';
            output += `<h2>${Impulse.nameColor(targetUser, true, true)}'s Collection (${cards.length} cards)</h2>`;

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
