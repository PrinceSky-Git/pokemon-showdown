/**
 * PSGO Collectable Pokemon Cards System
 * Refactored for modern Impulse server
 * Original by HoeenHero and Volco
 * Refactored by CarkJ338
 */

import {  FS  } from '../../lib/fs';
import {  JsonDB  } from '../../impulse/db';

// ================ Configuration ================
const CARDS_PER_PACK = 10;
const CURRENCY = Impulse.currency || 'coins';
const PACK_PRICE = 5;
const CARDSEARCH_MAX_VALUE = 500;

// ================ Database Setup ================
const db = new JsonDB('./impulse-db');
const cardsDB = db._makeCollection<CardInstance>('psgo_cards');
const packsDB = db._makeCollection<UserPacks>('psgo_packs');

// ================ Interfaces ================
interface Card {
  id: string;
  name: string;
  pack: string;
  type: string;
  image: string;
  cardType: string;
  species: string;
  rarity: CardRarity;
}

interface CardInstance extends Card {
  obtainedAt?: number;
}

interface UserPacks {
  id?: number;
  userid: string;
  packs: string[];
}

type CardRarity = 'Common' | 'Uncommon' | 'Rare' | 'Ultra Rare' | 'Legendary' | 'Mythic';

// ================ Load Card Data ================
let origCards: Record<string, Card> = {};
let newCards: Record<string, Card> = {};

try {
  origCards = JSON.parse(FS('config/cards.json').readIfExistsSync() || '{}');
} catch (e) {
  console.error('Error loading cards.json:', e);
}

try {
  newCards = JSON.parse(FS('config/extracards.json').readIfExistsSync() || '{}');
} catch (e) {
  console.error('Error loading extracards.json:', e);
}

function saveCards(): void {
  const cloned: Record<string, Card> = {};
  for (const cardId in newCards) {
    if (!origCards[cardId]) {
      cloned[cardId] = newCards[cardId];
    }
  }
  FS('config/extracards.json').writeUpdate(() => JSON.stringify(cloned, null, 2));
}

const ALL_CARDS: Record<string, Card> = Object.assign({}, origCards, newCards);

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

// Get all unique pack names
const PACKS = Array.from(new Set(Object.values(ALL_CARDS).map(card => card.pack)));

// ================ Helper Functions ================
function toPackName(pack: string): string {
  const packId = toID(pack);
  for (const p of PACKS) {
    if (toID(p) === packId) return p;
  }
  return pack;
}

function genCard(options?: Partial<Record<keyof Card, string>>): Card {
  const normalizedOptions: Record<string, string> = {};
  if (options) {
    for (const key in options) {
      normalizedOptions[key] = toID(options[key as keyof Card] || '');
    }
  }

  const validCards = Object.values(ALL_CARDS).filter(card => {
    if (normalizedOptions.rarity && toID(card.rarity) !== normalizedOptions.rarity) return false;
    if (normalizedOptions.pack && toID(card.pack) !== normalizedOptions.pack) return false;
    if (normalizedOptions.type && toID(card.type) !== normalizedOptions.type) return false;
    if (normalizedOptions.species && toID(card.species) !== normalizedOptions.species) return false;
    if (normalizedOptions.cardType && toID(card.cardType) !== normalizedOptions.cardType) return false;
    return true;
  });

  if (!validCards.length) {
    // Return first available card as default
    return Object.values(ALL_CARDS)[0] || {
      id: 'missingno',
      name: 'MissingNo',
      pack: 'Unknown',
      type: 'Colorless',
      image: '',
      cardType: 'Basic',
      species: 'MissingNo',
      rarity: 'Common',
    };
  }

  return validCards[Math.floor(Math.random() * validCards.length)];
}

function makePack(pack?: string): CardInstance[] {
  const out: CardInstance[] = [];
  const choices: Record<CardRarity, number> = {
    Common: 0,
    Uncommon: 0,
    Rare: 0,
    'Ultra Rare': 0,
    Legendary: 0,
    Mythic: 0,
  };
  let hasTopThree = false;

  // Add minimum required cards per rarity
  for (const rarity in PACK_MAKING_DATA) {
    const rarityKey = rarity as CardRarity;
    const minCards = PACK_MAKING_DATA[rarityKey].limits[0];
    
    for (let i = 0; i < minCards; i++) {
      if (out.length >= CARDS_PER_PACK) return out;
      const card = genCard({ rarity: rarityKey, pack });
      out.push({ ...card, obtainedAt: Date.now() });
      choices[rarityKey]++;
    }
  }

  // Fill remaining slots
  while (out.length < CARDS_PER_PACK) {
    const roll = Math.ceil(Math.random() * 100);
    let count = 0;
    let selectedRarity: CardRarity = 'Common';

    for (const rarity in PACK_MAKING_DATA) {
      const rarityKey = rarity as CardRarity;
      count += PACK_MAKING_DATA[rarityKey].chance;
      if (count >= roll) {
        selectedRarity = rarityKey;
        break;
      }
    }

    // Check if we've reached the limit for this rarity
    if (PACK_MAKING_DATA[selectedRarity].limits[1] <= choices[selectedRarity]) continue;

    // Limit top-tier cards to one per pack
    if (['Ultra Rare', 'Legendary', 'Mythic'].includes(selectedRarity)) {
      if (hasTopThree) continue;
      hasTopThree = true;
    }

    const card = genCard({ rarity: selectedRarity, pack });
    out.push({ ...card, obtainedAt: Date.now() });
    choices[selectedRarity]++;
  }

  return out;
}

async function getUserCards(userid: string): Promise<CardInstance[]> {
  const userData = await cardsDB.findOne({ userid });
  return userData ? (userData as any).cards || [] : [];
}

function getUserCardsSync(userid: string): CardInstance[] {
  const userData = cardsDB.findOneSync({ userid });
  return userData ? (userData as any).cards || [] : [];
}

async function giveCard(userid: string, cardId: string): Promise<boolean> {
  if (!ALL_CARDS[cardId]) return false;
  
  const card: CardInstance = { ...ALL_CARDS[cardId], obtainedAt: Date.now() };
  const userData = await cardsDB.findOne({ userid });
  
  if (userData) {
    const cards = (userData as any).cards || [];
    cards.push(card);
    await cardsDB.update((userData as any).id, { cards });
  } else {
    await cardsDB.insert({ userid, cards: [card] });
  }
  
  return true;
}

async function hasCard(userid: string, cardId: string): Promise<boolean> {
  const userCards = await getUserCards(userid);
  return userCards.some(card => card.id === cardId);
}

async function takeCard(userid: string, cardId: string): Promise<boolean> {
  const userData = await cardsDB.findOne({ userid });
  if (!userData) return false;
  
  const cards = (userData as any).cards || [];
  const idx = cards.findIndex((card: CardInstance) => card.id === cardId);
  
  if (idx === -1) return false;
  
  cards.splice(idx, 1);
  await cardsDB.update((userData as any).id, { cards });
  return true;
}

async function getUserPacks(userid: string): Promise<string[]> {
  const userData = await packsDB.findOne({ userid });
  return userData ? userData.packs : [];
}

async function addUserPack(userid: string, pack: string): Promise<void> {
  const userData = await packsDB.findOne({ userid });
  
  if (userData) {
    const packs = userData.packs || [];
    packs.push(pack);
    await packsDB.update((userData as any).id, { packs });
  } else {
    await packsDB.insert({ userid, packs: [pack] });
  }
}

async function removeUserPack(userid: string, pack: string): Promise<boolean> {
  const userData = await packsDB.findOne({ userid });
  if (!userData) return false;
  
  const packs = userData.packs || [];
  const idx = packs.indexOf(pack);
  
  if (idx === -1) return false;
  
  packs.splice(idx, 1);
  await packsDB.update((userData as any).id, { packs });
  return true;
}

function displayCard(card: Card): string {
  return `<div style="display: flex; gap: 20px; flex-wrap: wrap;">` +
    `<div style="flex: 0 0 254px;"><img src="${card.image}" alt="${card.name}" width="254" height="342"></div>` +
    `<div style="flex: 1; min-width: 250px;">` +
    `<div style="font-size: 2em; font-weight: bold; margin-bottom: 10px;">${card.name}</div>` +
    `<div style="color: #666; margin-bottom: 10px;">(ID: ${card.id})</div>` +
    `<div style="font-size: 1.5em; font-weight: bold; color: ${RARITY_COLORS[card.rarity]}; margin-bottom: 15px;">${card.rarity}</div>` +
    `<div style="margin-bottom: 8px;"><strong>Species:</strong> ${card.species}</div>` +
    `<div style="margin-bottom: 8px;"><strong>Type:</strong> ${card.type}</div>` +
    `<div style="margin-bottom: 8px;"><strong>Pack:</strong> ${card.pack}</div>` +
    `<div><strong>Card Type:</strong> ${card.cardType}</div>` +
    `</div></div>`;
}

// ================ Commands ================
export const commands: Chat.Commands = {
  psgo: {
    display: 'card',
    card(target, room, user) {
      if (!this.runBroadcast()) return;
      if (!target) return this.parse('/help psgo card');
      
      const card = ALL_CARDS[toID(target)];
      if (!card) return this.errorReply('That card does not exist.');
      
      return this.sendReplyBox(displayCard(card));
    },
    cardhelp: ['/psgo card [card id] - Displays information about a card.'],

    async showcase(target, room, user) {
      if (!this.runBroadcast()) return;
      const targetUser = target ? toID(target) : user.id;
      const cards = await getUserCards(targetUser);
      
      if (!cards.length) {
        return this.sendReplyBox(`${Impulse.nameColor(targetUser, true, true)} has no cards.`);
      }

      const broadcasting = this.broadcasting;
      let cardsShown = 0;
      
      const cardsHTML = cards.map(card => {
        if (broadcasting && cardsShown >= 100) {
          if (cardsShown === 100) {
            cardsShown++;
            return `<button class="button" name="send" value="/psgo showcase ${targetUser}">Show all cards</button>`;
          }
          return '';
        }
        cardsShown++;
        return `<button class="button" name="send" value="/psgo card ${card.id}" style="margin: 2px;">` +
          `<img src="${card.image}" height="120" width="100" title="${card.id}"></button>`;
      }).join('');

      return this.sendReplyBox(
        `<div style="max-height: 300px; overflow-y: auto;">${cardsHTML}</div>` +
        `<div style="text-align: center; margin-top: 10px; font-weight: bold;">` +
        `${Impulse.nameColor(targetUser, true, true)} has ${cards.length} card${cards.length === 1 ? '' : 's'}` +
        `</div>`
      );
    },
    showcasehelp: ['/psgo showcase [user] - Shows all cards owned by a user.'],

    confirmtransfercard: 'transfercard',
    async transfercard(target, room, user, connection, cmd) {
      if (!target) return this.parse('/help psgo transfercard');
      
      const [targetName, cardId] = target.split(',').map(x => x.trim());
      
      const targetUser = Users.get(targetName);
      if (!targetUser) return this.errorReply(`User "${targetName}" not found.`);
      if (!targetUser.named) return this.errorReply('Guests cannot receive cards.');
      if (targetUser.id === user.id) return this.errorReply('You cannot transfer cards to yourself.');
      
      const card = ALL_CARDS[toID(cardId)];
      if (!card) return this.errorReply('That card does not exist.');
      
      const userHasCard = await hasCard(user.id, card.id);
      if (!userHasCard) return this.errorReply('You do not have that card.');
      
      if (cmd !== 'confirmtransfercard') {
        return this.popupReply(
          `|html|<center>` +
          `<button class="button" name="send" value="/psgo confirmtransfercard ${targetUser.id}, ${card.id}" ` +
          `style="padding: 15px 30px; font-size: 14px; border-radius: 8px;">` +
          `Confirm transfer to<br><b style="color: ${Impulse.hashColor(targetUser.id)};">${Chat.escapeHTML(targetUser.name)}</b>` +
          `</button></center>`
        );
      }
      
      const success = await takeCard(user.id, card.id);
      if (!success) return this.errorReply('Transfer failed. Please try again.');
      
      await giveCard(targetUser.id, card.id);
      
      if (targetUser.connected) {
        targetUser.popup(
          `|html|${Chat.escapeHTML(user.name)} has given you a card!<br>` +
          `<button class="button" name="send" value="/psgo card ${card.id}">View Card</button>`
        );
      }
      
      return this.sendReply(`You have successfully transferred ${card.id} to ${targetUser.name}.`);
    },
    transfercardhelp: ['/psgo transfercard [user], [card ID] - Transfer a card to another user.'],

    async search(target, room, user) {
      return user.sendTo(
        room,
        `|html|<div class="message-error">Card search is temporarily unavailable. Use /psgo card [id] to view specific cards.</div>`
      );
    },
    searchhelp: ['/psgo search - Search for cards (currently unavailable).'],

    add(target, room, user) {
      if (!this.can('roomowner')) return;
      if (!target) return this.parse('/help psgo add');
      
      const [pack, rarity, species, type, image, cardType] = target.split(',').map(x => x.trim());
      
      if (!cardType) return this.parse('/help psgo add');
      
      const id = toID(pack + species);
      if (ALL_CARDS[id]) return this.errorReply(`The card ${id} already exists!`);
      
      newCards[id] = {
        id,
        name: species,
        pack,
        type,
        image,
        cardType,
        species,
        rarity: rarity as CardRarity,
      };
      
      saveCards();
      Object.assign(ALL_CARDS, newCards);
      
      return this.parse(`/psgo card ${id}`);
    },
    addhelp: ['/psgo add [pack], [rarity], [species], [type], [image], [card type] - Add a new card. Requires: #'],

    delete(target, room, user) {
      if (!this.can('roomowner')) return;
      if (!target) return this.parse('/help psgo delete');
      
      const cardId = toID(target);
      if (!newCards[cardId]) {
        return this.errorReply('That card is not in the database or cannot be deleted.');
      }
      
      delete newCards[cardId];
      delete ALL_CARDS[cardId];
      saveCards();
      
      return this.sendReply(`${cardId} has been removed from the card database.`);
    },
    deletehelp: ['/psgo delete [card id] - Delete a custom card. Requires: #'],

    async give(target, room, user) {
      if (!this.can('globalban')) return;
      if (!target) return this.parse('/help psgo give');
      
      const [targetName, cardId] = target.split(',').map(x => x.trim());
      
      const targetUser = Users.get(targetName);
      if (!targetUser) return this.errorReply(`User "${targetName}" not found.`);
      if (!targetUser.named) return this.errorReply('Guests cannot receive cards.');
      
      const card = ALL_CARDS[toID(cardId)];
      if (!card) return this.errorReply('That card does not exist.');
      
      await giveCard(targetUser.id, card.id);
      
      if (targetUser.connected) {
        targetUser.popup(`|html|You have received <b>${card.name}</b>!`);
      }
      
      this.modlog('PSGO GIVE', targetUser, `card: ${card.id}`);
      return this.sendReply(`${targetUser.name} has received ${card.id}.`);
    },
    givehelp: ['/psgo give [user], [card] - Give a card to a user. Requires: @ ~'],

    confirmtakeall: 'take',
    takeall: 'take',
    async take(target, room, user, connection, cmd) {
      if (!this.can('globalban')) return;
      if (!target) return this.parse('/help psgo take');
      
      const [targetName, cardId] = target.split(',').map(x => x.trim());
      
      let targetUser = Users.get(targetName);
      if (!targetUser) {
        targetUser = { name: targetName, id: toID(targetName), connected: false } as any;
      }
      
      const userCards = await getUserCards(targetUser.id);
      if (!userCards.length) return this.errorReply(`${targetUser.name} has no cards.`);
      
      if (cmd !== 'take') {
        if (cmd !== 'confirmtakeall') {
          return this.sendReply(
            `WARNING: Are you sure you want to take ALL of ${targetUser.name}'s cards? ` +
            `Use /psgo confirmtakeall ${targetUser.name} to confirm.`
          );
        }
        
        await cardsDB.update(toID(targetUser.name), { cards: [] });
        
        if (targetUser.connected) {
          targetUser.popup('|html|All your cards have been removed by a staff member.');
        }
        
        this.modlog('PSGO TAKEALL', targetUser as any, 'all cards');
        return this.sendReply(`All of ${targetUser.name}'s cards have been removed.`);
      }
      
      const card = ALL_CARDS[toID(cardId)];
      if (!card) return this.errorReply('That card does not exist.');
      
      const success = await takeCard(targetUser.id, card.id);
      
      if (success) {
        if (targetUser.connected) {
          targetUser.popup(`|html|The card <b>${card.id}</b> has been taken from you.`);
        }
        this.modlog('PSGO TAKE', targetUser as any, `card: ${card.id}`);
        return this.sendReply(`${card.id} has been taken from ${targetUser.name}.`);
      }
      
      return this.errorReply(`${targetUser.name} does not have that card.`);
    },
    takehelp: [
      '/psgo take [user], [card] - Take a card from a user. Requires: @ ~',
      '/psgo takeall [user] - Take all cards from a user. Requires: @ ~',
    ],

    shop: {
      async buy(target, room, user) {
        if (!target) return this.parse('/help psgo shop buy');
        
        const pack = toPackName(target);
        if (!PACKS.includes(pack)) return this.parse('/psgo shop');
        
        const userMoney = Economy.readMoney(user.id);
        if (userMoney < PACK_PRICE) {
          return this.errorReply(`You need at least ${PACK_PRICE} ${CURRENCY} to buy a pack!`);
        }
        
        Economy.takeMoney(user.id, PACK_PRICE, `Purchased ${pack} pack`, 'system');
        await addUserPack(user.id, pack);
        
        return this.sendReplyBox(
          `You have purchased a <b>${pack}</b> pack for ${PACK_PRICE} ${CURRENCY}!<br>` +
          `<button class="button" name="send" value="/psgo packs holding">View Your Packs</button>`
        );
      },
      buyhelp: [`/psgo shop buy [pack] - Buy a pack for ${PACK_PRICE} ${CURRENCY}.`],

      display(target, room, user) {
        if (!this.runBroadcast()) return;
        
        const packsHTML = PACKS.map(pack => 
          `<tr>` +
          `<td style="padding: 10px;"><button class="button" name="send" value="/psgo shop buy ${pack}">${pack}</button></td>` +
          `<td style="padding: 10px;">${PACK_PRICE} ${CURRENCY}</td>` +
          `</tr>`
        ).join('');
        
        return this.sendReplyBox(
          `<div style="max-height: 300px; overflow-y: auto;">` +
          `<table style="width: 100%; border-collapse: collapse;">` +
          `<thead><tr><th colspan="2" style="padding: 10px; font-size: 1.2em;">Pack Shop</th></tr></thead>` +
          `<tbody>${packsHTML}</tbody>` +
          `</table></div>`
        );
      },
      displayhelp: ['/psgo shop - Display the pack shop.'],

      '': 'display',
    },

    pack: 'packs',
    packs: {
      async give(target, room, user) {
        if (!this.can('globalban')) return;
        if (!target) return this.parse('/help psgo packs give');
        
        const [targetName, packName] = target.split(',').map(x => x.trim());
        
        const targetUser = Users.get(targetName);
        if (!targetUser) return this.errorReply(`User "${targetName}" not found.`);
        
        const pack = toPackName(packName);
        if (!PACKS.includes(pack)) return this.errorReply(`The pack "${packName}" does not exist.`);
        
        await addUserPack(targetUser.id, pack);
        
        if (targetUser.connected) {
          targetUser.popup(`|html|You have received a <b>${pack}</b> pack!`);
        }
        
        this.modlog('PSGO GIVE PACK', targetUser, pack);
        return this.sendReply(`${targetUser.name} has received a ${pack} pack.`);
      },
      givehelp: ['/psgo packs give [user], [pack] - Give a pack to a user. Requires: @ ~'],

      confirmtakeall: 'take',
      takeall: 'take',
      async take(target, room, user, connection, cmd) {
        if (!this.can('globalban')) return;
        if (!target) return this.parse('/help psgo packs take');
        
        const [targetName, packName] = target.split(',').map(x => x.trim());
        
        let targetUser = Users.get(targetName);
        if (!targetUser) {
          targetUser = { name: targetName, id: toID(targetName), connected: false } as any;
        }
        
        const userPacks = await getUserPacks(targetUser.id);
        if (!userPacks.length) return this.errorReply(`${targetUser.name} has no packs.`);
        
        if (!packName && cmd !== 'take') {
          if (cmd !== 'confirmtakeall') {
            return this.sendReply(
              `WARNING: Take ALL of ${targetUser.name}'s packs? ` +
              `Use /psgo packs confirmtakeall ${targetUser.name} to confirm.`
            );
          }
          
          await packsDB.update(toID(targetUser.name), { packs: [] });
          
          if (targetUser.connected) {
            targetUser.popup('|html|All your packs have been removed.');
          }
          
          this.modlog('PSGO TAKEALL PACKS', targetUser as any);
          return this.sendReply(`All of ${targetUser.name}'s packs have been removed.`);
        }
        
        const pack = toPackName(packName);
        if (!PACKS.includes(pack)) return this.errorReply(`"${packName}" is not a valid pack.`);
        
        const success = await removeUserPack(targetUser.id, pack);
        
        if (!success) return this.errorReply(`${targetUser.name} does not have any ${pack} packs.`);
        
        if (targetUser.connected) {
          targetUser.popup(`|html|A <b>${pack}</b> pack has been taken from you.`);
        }
        
        this.modlog('PSGO TAKE PACK', targetUser as any, pack);
        return this.sendReply(`A ${pack} pack has been taken from ${targetUser.id}.`);
      },
      takehelp: [
        '/psgo packs take [user], [pack] - Take a pack from a user. Requires: @ ~',
        '/psgo packs takeall [user] - Take all packs from a user. Requires: @ ~',
      ],

      async open(target, room, user) {
        if (!this.runBroadcast()) return;
        if (!target) return this.parse('/help psgo packs open');
        
        const pack = toPackName(target);
        const userPacks = await getUserPacks(user.id);
        
        if (!userPacks.includes(pack)) {
          return this.errorReply(`You do not have a ${pack} pack.`);
        }
        
        await removeUserPack(user.id, pack);
        
        const cards = makePack(pack);
        const userData = await cardsDB.findOne({ userid: user.id });
        
        if (userData) {
          const existingCards = (userData as any).cards || [];
          await cardsDB.update((userData as any).id, { cards: [...existingCards, ...cards] });
        } else {
          await cardsDB.insert({ userid: user.id, cards });
        }
        
        const cardsHTML = cards.map(card =>
          `<button class="button" name="send" value="/psgo card ${card.id}" style="margin: 2px;">` +
          `<img src="${card.image}" title="${card.id}" height="100" width="80"></button>`
        ).join('');
        
        return this.sendReplyBox(
          `<div style="margin-bottom: 10px;">You opened a <b>${pack}</b> pack and received:</div>` +
          `<div>${cardsHTML}</div>`
        );
      },
      openhelp: ['/psgo packs open [pack name] - Open one of your packs.'],

      unopened: 'holding',
      pending: 'holding',
      stored: 'holding',
      async holding(target, room, user) {
        const userPacks = await getUserPacks(user.id);
        
        if (!userPacks.length) {
          return this.errorReply('You do not have any packs.');
        }
        
        const packCounts: Record<string, number> = {};
        for (const pack of userPacks) {
          packCounts[pack] = (packCounts[pack] || 0) + 1;
        }
        
        const packsHTML = Object.entries(packCounts).map(([pack, count]) =>
          `<div style="margin: 5px 0;">` +
          `<button class="button" name="send" value="/psgo packs open ${pack}">Open ${pack} Pack</button> ` +
          `(${count} remaining)` +
          `</div>`
        ).join('');
        
        return this.sendReplyBox(
          `<div style="font-weight: bold; margin-bottom: 10px;">Your Unopened Packs</div>` +
          `${packsHTML}`
        );
      },
      holdinghelp: ['/psgo packs holding - View your unopened packs.'],

      list(target, room, user) {
        if (!this.runBroadcast()) return;
        
        const packsHTML = PACKS.map(pack => `<li>${pack}</li>`).join('');
        
        return this.sendReplyBox(
          `<div style="max-height: 300px; overflow-y: auto;">` +
          `<div style="font-weight: bold; margin-bottom: 10px;">Available Packs</div>` +
          `<ul style="list-style-position: inside;">${packsHTML}</ul>` +
          `</div>`
        );
      },
      listhelp: ['/psgo packs list - Display all available packs.'],

      '': 'holding',
    },

    async ladder(target, room, user) {
      if (!this.runBroadcast()) return;
      
      const allUsers = await cardsDB.get();
      const userPoints: Array<{ name: string; points: number; cards: number }> = [];
      
      for (const userData of allUsers as any[]) {
        const cards = userData.cards || [];
        let points = 0;
        
        for (const card of cards) {
          points += RARITY_POINTS[card.rarity as CardRarity] || 1;
        }
        
        if (points > 0) {
          userPoints.push({
            name: userData.userid,
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
    ladderhelp: ['/psgo ladder - Display the PSGO points leaderboard.'],

    async reset(target, room, user) {
      if (!this.can('lockdown')) return;
      
      if (!target || !(user as any).psgoResetCode) {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!@#$%^&*';
        let code = '';
        for (let i = 0; i < 10; i++) {
          code += chars[Math.floor(Math.random() * chars.length)];
        }
        (user as any).psgoResetCode = code;
        
        return this.sendReplyBox(
          `<h2 style="color: red;">⚠️ WARNING ⚠️</h2>` +
          `<p>You are about to <strong>DELETE ALL</strong> user cards and packs!</p>` +
          `<p>This action is <strong>IRREVERSIBLE</strong>.</p>` +
          `<p>If you are absolutely certain, use:</p>` +
          `<code>/psgo reset ${code}</code>`
        );
      }
      
      if ((user as any).psgoResetCode !== target.trim()) {
        return this.parse('/psgo reset');
      }
      
      await cardsDB.clear();
      await packsDB.clear();
      
      Rooms.rooms.forEach(r => {
        r.add(
          `|html|<div class="broadcast-red" style="padding: 10px; text-align: center;">` +
          `<strong>The PSGO database has been reset!</strong><br>` +
          `All cards and packs have been removed.` +
          `</div>`
        );
        r.update();
      });
      
      this.modlog('PSGO RESET');
      delete (user as any).psgoResetCode;
      return this.sendReply('PSGO database has been reset.');
    },
    resethelp: ['/psgo reset - Wipe the entire PSGO database. Requires: ~'],

    '': 'help',
    help(target, room, user) {
      if (!this.runBroadcast()) return;
      return this.parse('/help psgo');
    },
  },

  psgohelp: [
    '/psgo card [card id] - Display information about a card.',
    '/psgo showcase [user] - Show all cards owned by a user.',
    '/psgo transfercard [user], [card ID] - Transfer a card to another user.',
    '/psgo add [pack], [rarity], [species], [type], [image], [card type] - Add a new card. Requires: #',
    '/psgo delete [card id] - Delete a custom card. Requires: #',
    '/psgo give [user], [card] - Give a card to a user. Requires: @ ~',
    '/psgo take [user], [card] - Take a card from a user. Requires: @ ~',
    '/psgo takeall [user] - Take all cards from a user. Requires: @ ~',
    `/psgo shop - Display the pack shop.`,
    `/psgo shop buy [pack] - Buy a pack for ${PACK_PRICE} ${CURRENCY}.`,
    '/psgo packs give [user], [pack] - Give a pack to a user. Requires: @ ~',
    '/psgo packs take [user], [pack] - Take a pack from a user. Requires: @ ~',
    '/psgo packs takeall [user] - Take all packs from a user. Requires: @ ~',
    '/psgo packs open [pack name] - Open one of your packs.',
    '/psgo packs holding - View your unopened packs.',
    '/psgo packs list - Display all available packs.',
    '/psgo ladder - Display the PSGO points leaderboard.',
    '/psgo reset - Wipe the entire PSGO database. Requires: ~',
  ],

  // Shortcut commands
  showcase(target, room, user) {
    if (!this.runBroadcast()) return;
    return this.parse(`/psgo showcase ${target}`);
  },
  showcasehelp: ['/showcase [user] - Show all cards owned by a user.'],

  cardsearch(target, room, user) {
    return this.parse('/psgo search');
  },
  cardsearchhelp: ['/cardsearch - Search for cards.'],

  cardladder(target, room, user) {
    if (!this.runBroadcast()) return;
    return this.parse('/psgo ladder');
  },
  cardladderhelp: ['/cardladder - Display the PSGO points leaderboard.'],

  checkpacks(target, room, user) {
    return this.parse('/psgo packs holding');
  },
  checkpackshelp: ['/checkpacks - View your unopened packs.'],

  openpack(target, room, user) {
    if (!this.runBroadcast()) return;
    return this.parse(`/psgo packs open ${target}`);
  },
  openpackhelp: ['/openpack [pack name] - Open one of your packs.'],
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
        if (!cardsByRarity[card.rarity]) {
          cardsByRarity[card.rarity] = [];
        }
        cardsByRarity[card.rarity].push(card);
      }
      
      let output = `<div class="pad">`;
      output += `<h2>${Impulse.nameColor(targetUser, true, true)}'s Card Collection (${cards.length} cards)</h2>`;
      
      const rarityOrder: CardRarity[] = ['Mythic', 'Legendary', 'Ultra Rare', 'Rare', 'Uncommon', 'Common'];
      
      for (const rarity of rarityOrder) {
        if (!cardsByRarity[rarity]) continue;
        
        output += `<h3 style="color: ${RARITY_COLORS[rarity]};">${rarity} (${cardsByRarity[rarity].length})</h3>`;
        output += `<div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 20px;">`;
        
        for (const card of cardsByRarity[rarity]) {
          output += `<button class="button" name="send" value="/psgo card ${card.id}" style="padding: 0;">` +
            `<img src="${card.image}" height="120" width="100" title="${card.name}">` +
            `</button>`;
        }
        
        output += `</div>`;
      }
      
      output += `</div>`;
      return output;
    }
    
    return `<div class="pad"><h2>Invalid PSGO page.</h2></div>`;
  },
};
