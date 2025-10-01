/**
 * PSGO Card System - Commands
 * @license MIT
 */

import { PSGOStorage } from './psgo-storage';
import { PSGOCardManager } from './psgo-manager';
import { Economy } from '../../impulse/misc/economy';
import type { Card, CardInstance, PackDefinition, UserSettings } from './psgo-models';
import { RARITY_COLORS, SPECIAL_SUBTYPES, RARITY_POINTS } from './psgo-models';

function toID(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function generateTable(title: string, headers: string[], data: any[][]): string {
	return Impulse.generateThemedTable(title, headers, data);
}

function formatUserName(userId: string, bold: boolean = true, showGroup: boolean = true): string {
	return Impulse.nameColor(userId, bold, showGroup);
}

export const commands: Chat.Commands = {
	psgo: {
		// Show card details
		async show(target, room, user) {
			if (!this.runBroadcast()) return;
			if (!target) return this.parse('/help psgo show');

			const card = await PSGOCardManager.getCardById(target);
			if (!card) return this.errorReply('Card not found. Use exact card ID (setId-cardNumber)');

			return this.sendReplyBox(PSGOCardManager.displayCard(card));
		},
		showhelp: `/psgo show [cardId] - Show card details`,

		// Give card (Admin/Manager only)
		async give(target, room, user) {
			const isManagerUser = await PSGOStorage.isManager(user.id);
			if (!isManagerUser) this.checkCan('bypassall');

			if (!target) return this.parse('/help psgo give');

			const [targetName, cardId] = target.split(',').map(x => x.trim());
			if (!targetName || !cardId) {
				return this.errorReply('Usage: /psgo give [user], [cardId]');
			}

			const targetUser = Users.get(targetName);
			if (!targetUser) return this.errorReply(`User ${targetName} not found.`);
			if (!targetUser.named) return this.errorReply('Guests cannot receive cards.');

			const card = await PSGOCardManager.getCardById(cardId);
			if (!card) return this.errorReply('Card not found.');

			const giveResult = await PSGOCardManager.giveCard(targetUser.id, cardId);
			if (!giveResult.success) {
				return this.errorReply(giveResult.message);
			}

			if (targetUser.connected) {
				targetUser.popup(`You received **${card.name}** from ${user.name}!`);
			}
			this.modlog('PSGO GIVE', targetUser, `card: ${cardId}`);
			return this.sendReply(`Gave ${card.name} to ${targetUser.name}.`);
		},
		givehelp: `/psgo give [user], [cardId] - Give card to user (requires % or higher)`,

		// Transfer cards
		async transfer(target, room, user, connection, cmd) {
			if (!target) return this.parse('/help psgo transfer');

			const [targetName, cardId] = target.split(',').map(x => x.trim());
			if (!targetName || !cardId) {
				return this.errorReply('Usage: /psgo transfer [user], [cardId]');
			}

			const targetUser = Users.get(targetName);
			if (!targetUser) return this.errorReply(`User ${targetName} not found.`);
			if (!targetUser.named) return this.errorReply('Guests cannot receive cards.');
			if (targetUser.id === user.id) return this.errorReply('You cannot transfer cards to yourself.');

			const settings = await PSGOStorage.getUserSettings(targetUser.id);
			if (settings?.transfersEnabled === false) {
				return this.errorReply(`${targetUser.name} has disabled card transfers.`);
			}

			const card = await PSGOCardManager.getCardById(cardId);
			if (!card) return this.errorReply('Card not found.');

			// Confirmation step
			if (cmd !== 'confirmtransfer') {
				return this.popupReply(
					`<center><button class="button" name="send" value="/psgo confirmtransfer ${targetUser.id},${cardId}" style="padding: 15px 30px; font-size: 14px; border-radius: 8px;">Confirm transfer ${card.name} to<br><b style="color: #0066ff">${Chat.escapeHTML(targetUser.name)}</b></button></center>`
				);
			}

			const transferResult = await PSGOCardManager.transferCard(user.id, targetUser.id, cardId);
			if (!transferResult.success) {
				return this.errorReply(transferResult.message);
			}

			if (targetUser.connected) {
				targetUser.popup(`${Chat.escapeHTML(user.name)} transferred **${card.name}** to you!`);
			}

			this.modlog('PSGO TRANSFER', targetUser, `from: ${user.id}, card: ${cardId}`);
			return this.sendReply(`You transferred ${card.name} to ${targetUser.name}.`);
		},
		transferhelp: `/psgo transfer [user], [cardId] - Transfer your card to another user`,

		// Confirm transfer
		async confirmtransfer(target, room, user) {
			if (!target) return this.errorReply('Invalid transfer confirmation.');
			
			const [targetUserId, cardId] = target.split(',');
			const targetUser = Users.get(targetUserId);
			if (!targetUser) return this.errorReply('Target user not found.');

			return this.parse(`/psgo transfer ${targetUser.name}, ${cardId}`);
		},

		// View collection
		async collection(target, room, user) {
  if (!this.runBroadcast()) return;

  const [targetName, pageStr, sortStr] = target ? target.split(',').map(x => x.trim()) : [];
  const targetUser = targetName ? toID(targetName) : user.id;
  const page = parseInt(pageStr) || 1;
  const cardsPerPage = 100;

  const cards = await PSGOStorage.getUserCards(targetUser);
  if (!cards.length) {
    return this.sendReplyBox(`` + formatUserName(targetUser, true, true) + ` has no cards.`);
  }

  const settings = await PSGOStorage.getUserSettings(user.id);
  const sortType = sortStr || settings?.showcaseSort || 'rarity';

  // Sort cards
  const sortedCards = [...cards];
  switch (sortType) {
    case 'points':
      sortedCards.sort((a, b) => PSGOCardManager.getCardPoints(b) - PSGOCardManager.getCardPoints(a));
      break;
    case 'types':
      sortedCards.sort((a, b) => PSGOCardManager.formatCardTypes(a).localeCompare(PSGOCardManager.formatCardTypes(b)));
      break;
    case 'name':
      sortedCards.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'date':
      sortedCards.sort((a, b) => (b.obtainedAt || 0) - (a.obtainedAt || 0));
      break;
    default:
      const rarityOrder = ['Ultra Rare', 'Secret Rare', 'Rare Holo', 'Rare', 'Uncommon', 'Common'];
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
    const hasSpecialSubtype = card.subtypes?.some(st => SPECIAL_SUBTYPES[st]);
    const buttonStyle = hasSpecialSubtype && card.subtypes ? 
      `padding: 0; border: 2px solid ` + SPECIAL_SUBTYPES[card.subtypes.find(st => SPECIAL_SUBTYPES[st])!]?.color + `; box-shadow: 0 0 8px ` + SPECIAL_SUBTYPES[card.subtypes.find(st => SPECIAL_SUBTYPES[st])!]?.color + `40;` : 
      'padding: 0;';
    return `<button class="button" name="send" value="/psgo show ` + card.id + `" style="margin: 2px; ` + buttonStyle + `"><img src="` + card.images.small + `" height="120" width="100" title="` + card.name + `"></button>`;
  }).join('');

  let pagination = ``;
  if (!broadcasting && totalPages > 1) {
    pagination = `<div style="text-align: center; margin-top: 10px;">`;
    if (page > 1) {
      pagination += `<button class="button" name="send" value="/psgo collection ` + targetUser + `, ` + (page - 1) + `">Previous</button> `;
    }
    pagination += `Page ` + page + ` of ` + totalPages;
    if (page < totalPages) {
      pagination += ` <button class="button" name="send" value="/psgo collection ` + targetUser + `, ` + (page + 1) + `">Next</button>`;
    }
    pagination += `</div>`;
  }

  return this.sendReplyBox(`` +
    `<div style="max-height: 300px; overflow-y: auto;">` + cardsHTML + `</div>` +
    `` + pagination +
    `<div style="text-align: center; margin-top: 10px; font-weight: bold;">` +
      `` + formatUserName(targetUser, true, true) + ` has ` + cards.length + ` card` + (cards.length === 1 ? `` : `s`) + ` | Sort: ` + sortType +
    `</div>` +
  ``);
},
		collectionhelp: `/psgo collection [user, page, sort] - View card collection`,

		// Points leaderboard
		async ladder(target, room, user) {
			if (!this.runBroadcast()) return;

			const allData = await PSGOStorage.getAllUserCards();
			const userPoints: Array<{name: string, points: number, cards: number}> = [];

			for (const userid in allData) {
				const cards = (allData as any)[userid];
				let points = 0;
				for (const card of cards) {
					points += PSGOCardManager.getCardPoints(card);
				}
				if (points > 0) {
					userPoints.push({name: userid, points, cards: cards.length});
				}
			}

			userPoints.sort((a, b) => b.points - a.points);
			const top100 = userPoints.slice(0, 100);

			if (!top100.length) {
				return this.sendReplyBox('No users have any cards yet.');
			}

			const data = top100.map((entry, index) => {
				let rankDisplay = (index + 1).toString();
				if (index === 0) rankDisplay = '🥇1';
				else if (index === 1) rankDisplay = '🥈2';
				else if (index === 2) rankDisplay = '🥉3';
				
				return [
					rankDisplay,
					formatUserName(entry.name, true, true),
					entry.points.toLocaleString(),
					entry.cards.toString()
				];
			});

			const tableHTML = Impulse.generateTable('PSGO Card Ladder', ['Rank', 'User', 'Points', 'Cards'], data);
			return this.sendReplyBox(tableHTML);
		},
		ladderhelp: `/psgo ladder - View points leaderboard`,

		// Pack shop
		async shop(target, room, user) {
			if (!this.runBroadcast()) return;

			const allPacks = await PSGOStorage.getAllPacks();
			const shopPacks = Object.values(allPacks).filter(p => p.inShop);

			if (!shopPacks.length) {
				return this.sendReplyBox('The pack shop is currently empty.');
			}

			const data = shopPacks.map(pack => [
				`<button class="button" name="send" value="/psgo buy ${pack.code}">${pack.name}</button>`,
				`${pack.price} ${Economy.currency}`,
				pack.series
			]);

			const tableHTML = Impulse.generateTable('Pack Shop', ['Pack', 'Price', 'Series'], data);
			return this.sendReplyBox(tableHTML);
		},
		shophelp: `/psgo shop - View pack shop`,

		// Buy packs
		async buy(target, room, user) {
			if (!target) return this.parse('/help psgo buy');

			const packCode = await PSGOCardManager.toPackCode(target);
			const buyResult = await PSGOCardManager.buyPack(user.id, packCode);

			if (!buyResult.success) {
				return this.errorReply(buyResult.message);
			}
			
			return this.sendReplyBox(`
				${buyResult.message}<br>` +
				`<button class="button" name="send" value="/psgo open ${packCode}">Open Pack</button>` +
				`<button class="button" name="send" value="/psgo packs">View Your Packs</button>
			`);
		},
		buyhelp: `/psgo buy [pack] - Buy pack with coins or credits`,

		// Open packs
		async open(target, room, user) {
			if (!this.runBroadcast()) return;
			if (!target) return this.parse('/help psgo open');

			const packCode = await PSGOCardManager.toPackCode(target);
			const userPacksList = await PSGOStorage.getUserPacks(user.id);

			if (!userPacksList.includes(packCode)) {
				return this.errorReply(`You don't have a ${packCode} pack.`);
			}

			await PSGOStorage.removeUserPack(user.id, packCode);
			const cards = await PSGOCardManager.makePack(packCode);

			if (!cards.length) {
				return this.errorReply(`No cards available for pack ${packCode}.`);
			}

			for (const card of cards) {
				await PSGOStorage.addUserCard(user.id, card);
			}

			const allPacks = await PSGOStorage.getAllPacks();
			const packInfo = allPacks[packCode];
			const packName = packInfo ? packInfo.name : packCode;

			const cardsHTML = cards.map(card => {
				return `<button class="button" name="send" value="/psgo show ${card.id}" style="margin: 2px;"><img src="${card.images.small}" title="${card.name}" height="100" width="80"></button>`;
			}).join('');

			return this.sendReplyBox(`
				<div style="margin-bottom: 10px;">You opened **${packName}** and got ${cards.length} cards!</div>` +
				`<div>${cardsHTML}</div>
			`);
		},
		openhelp: `/psgo open [pack] - Open pack`,

		// View packs
		async packs(target, room, user) {
			const userPacksList = await PSGOStorage.getUserPacks(user.id);

			if (!userPacksList.length) {
				return this.errorReply('You have no packs.');
			}

			const packCounts: Record<string, number> = {};
			for (const pack of userPacksList) {
				packCounts[pack] = (packCounts[pack] || 0) + 1;
			}

			const allPacks = await PSGOStorage.getAllPacks();
			const packsHTML = Object.entries(packCounts).map(([code, count]) => {
				const pack = allPacks[code];
				const packName = pack ? pack.name : code;
				return `<div style="margin: 5px 0;">` +
					`<button class="button" name="send" value="/psgo open ${code}">Open ${packName}</button>` +
					`(${count} remaining)` +
				`</div>`;
			}).join('');

			const credits = await PSGOStorage.getPackCredits(user.id);

			return this.sendReplyBox(`
				<div style="font-weight: bold; margin-bottom: 10px;">Your Unopened Packs</div>` +
				`${packsHTML}` +
				`<div style="margin-top: 10px;">Pack Credits: ${credits}</div>
			`);
		},
		packshelp: `/psgo packs - View your unopened packs`,

		// Add cards/packs - Admin only
		async add(target, room, user) {
			const isManagerUser = await PSGOStorage.isManager(user.id);
			if (!isManagerUser) this.checkCan('roomowner');

			if (!target) return this.parse('/help psgo add');

			const parts = target.split(',').map(x => x.trim());

			if (parts.length >= 7) {
				// Add card: setId, cardNumber, name, image, rarity, series, types[, supertype, artist, hp]
				const [setId, cardNumber, name, image, rarity, series, types, supertype = 'Pokémon', artist = 'Unknown', hp = '100'] = parts;
				const cardId = `${setId}-${cardNumber}`;
				const allCards = await PSGOStorage.getAllCards();
				
				if (allCards[cardId]) {
					return this.errorReply(`Card ${cardId} already exists!`);
				}

				const newCard = {
					id: cardId,
					name,
					supertype: supertype as any,
					number: cardNumber,
					artist,
					rarity,
					legalities: { unlimited: 'Legal' as const },
					images: { small: image, large: image },
					...(supertype === 'Pokémon' ? { hp, types: types.split('/').map(t => t.trim()) } : {}),
					...(supertype === 'Trainer' ? { rules: ['Custom trainer card effect'] } : {}),
					...(supertype === 'Energy' ? { subtypes: ['Basic'] as const } : {}),
				} as Card;

				allCards[cardId] = newCard;
				await PSGOStorage.saveAllCards(allCards);

				this.modlog('PSGO ADD CARD', null, cardId);
				return this.sendReply(`Added card ${name} (${cardId})`);

			} else if (parts.length === 6) {
				// Add pack: code, name, series, releaseDate, price, flags
				const [code, name, series, releaseDate, priceStr, flags] = parts;
				const packCode = toID(code);
				const allPacks = await PSGOStorage.getAllPacks();
				
				if (allPacks[packCode]) {
					return this.errorReply(`Pack ${packCode} already exists!`);
				}

				allPacks[packCode] = {
					code: packCode,
					name,
					series,
					releaseDate,
					price: parseInt(priceStr) || 0,
					inShop: flags.includes('shop'),
					creditPack: flags.includes('credit')
				};

				await PSGOStorage.saveAllPacks(allPacks);

				this.modlog('PSGO ADD PACK', null, packCode);
				return this.sendReply(`Added pack ${name} (${packCode})`);
			}

			return this.errorReply('Usage: /psgo add [card params] OR /psgo add [pack params]');
		},
		addhelp: `/psgo add [setId, cardNumber, name, image, rarity, series, types] - Add card\n/psgo add [code, name, series, date, price, shop/credit] - Add pack`,

		// Edit cards/packs
		async edit(target, room, user) {
			const isManagerUser = await PSGOStorage.isManager(user.id);
			if (!isManagerUser) this.checkCan('roomowner');

			if (!target) return this.parse('/help psgo edit');

			const parts = target.split(',').map(x => x.trim());
			const id = parts[0];

			// Try card first
			const card = await PSGOCardManager.getCardById(id);
			if (card && parts.length >= 6) {
				const [, name, image, rarity, series, types] = parts;
				const allCards = await PSGOStorage.getAllCards();
				
				const updatedCard = {
					...card,
					name,
					rarity,
					images: { small: image, large: image },
					...(card.supertype === 'Pokémon' ? { types: types.split('/').map(t => t.trim()) } : {})
				};

				allCards[card.id] = updatedCard as Card;
				await PSGOStorage.saveAllCards(allCards);

				this.modlog('PSGO EDIT CARD', null, card.id);
				return this.sendReply(`Edited card ${name} (${card.id})`);
			}

			// Try pack
			const packCode = toID(id);
			const allPacks = await PSGOStorage.getAllPacks();
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

				await PSGOStorage.saveAllPacks(allPacks);

				this.modlog('PSGO EDIT PACK', null, packCode);
				return this.sendReply(`Edited pack ${name} (${packCode})`);
			}

			return this.errorReply('ID not found or wrong parameter count.');
		},
		edithelp: `/psgo edit [id, params...] - Edit card or pack`,

		// Delete cards/packs
		async delete(target, room, user) {
			const isManagerUser = await PSGOStorage.isManager(user.id);
			if (!isManagerUser) this.checkCan('roomowner');

			if (!target) return this.parse('/help psgo delete');

			const card = await PSGOCardManager.getCardById(target);
			if (card) {
				const allCards = await PSGOStorage.getAllCards();
				delete allCards[card.id];
				await PSGOStorage.saveAllCards(allCards);

				this.modlog('PSGO DELETE CARD', null, card.id);
				return this.sendReply(`Deleted card ${card.name} (${card.id})`);
			}

			// Try as pack
			const packCode = toID(target);
			const allPacks = await PSGOStorage.getAllPacks();
			if (allPacks[packCode]) {
				const packName = allPacks[packCode].name;
				delete allPacks[packCode];
				await PSGOStorage.saveAllPacks(allPacks);

				this.modlog('PSGO DELETE PACK', null, packCode);
				return this.sendReply(`Deleted pack ${packName} (${packCode})`);
			}

			return this.errorReply('Card or pack not found.');
		},
		deletehelp: `/psgo delete [id] - Delete card or pack`,

		// Manage system
		async manage(target, room, user) {
			if (!target) return this.parse('/help psgo manage');

			const [action, targetName, amountStr] = target.split(',').map(x => x.trim());

			switch (action.toLowerCase()) {
				case 'add':
					this.checkCan('roomowner');
					const addUser = Users.get(targetName);
					if (!addUser) return this.errorReply(`User ${targetName} not found.`);

					const isAlreadyManager = await PSGOStorage.isManager(addUser.id);
					if (isAlreadyManager) return this.errorReply(`${addUser.name} is already a manager.`);

					const success = await PSGOStorage.addManager(addUser.id);
					if (!success) return this.errorReply('Failed to add manager.');

					if (addUser.connected) addUser.popup('You are now a PSGO manager!');
					this.modlog('PSGO MANAGER ADD', addUser);
					return this.sendReply(`${addUser.name} is now a manager.`);

				case 'remove':
					this.checkCan('roomowner');
					const success2 = await PSGOStorage.removeManager(toID(targetName));
					if (!success2) return this.errorReply(`${targetName} is not a manager.`);

					const removeUser = Users.get(targetName);
					if (removeUser?.connected) removeUser.popup('Your PSGO manager privileges were removed.');
					this.modlog('PSGO MANAGER REMOVE', removeUser || targetName as any);
					return this.sendReply(`Removed ${targetName} as manager.`);

				case 'list':
					if (!this.runBroadcast()) return;
					const managers = await PSGOStorage.getManagers();
					if (!managers.length) return this.sendReplyBox('No managers.');

					const managersHTML = managers.map((id: string) => formatUserName(id, true, true)).join(', ');
					return this.sendReplyBox(`<b>PSGO Managers</b><br>${managersHTML}`);

				case 'credits':
					const isManagerUser = await PSGOStorage.isManager(user.id);
					if (!isManagerUser) this.checkCan('bypassall');

					const credUser = Users.get(targetName);
					if (!credUser) return this.errorReply(`User ${targetName} not found.`);

					const amount = parseInt(amountStr);
					if (isNaN(amount) || amount <= 0) return this.errorReply('Invalid amount.');

					await PSGOStorage.addPackCredits(credUser.id, amount);

					if (credUser.connected) credUser.popup(`You received ${amount} pack credits!`);
					this.modlog('PSGO CREDITS GIVE', credUser, `${amount} credits`);
					return this.sendReply(`Gave ${amount} credits to ${credUser.name}.`);

				default:
					return this.errorReply('Usage: /psgo manage [add/remove/list/credits], [user], [amount]');
			}
		},
		managehelp: `/psgo manage [add/remove/list/credits], [user], [amount] - Manage system`,

		// User settings
		async set(target, room, user) {
			if (!target) return this.parse('/help psgo set');

			const [setting, value] = target.split(',').map(x => x.trim());
			const settings = await PSGOStorage.getUserSettings(user.id);

			switch (setting.toLowerCase()) {
				case 'transfers':
					const enabled = toID(value) === 'on';
					settings.transfersEnabled = enabled;
					await PSGOStorage.setUserSettings(user.id, settings);
					return this.sendReply(`Card transfers ${enabled ? 'enabled' : 'disabled'}.`);

				case 'sort':
					const validSorts = ['rarity', 'points', 'types', 'name', 'date'];
					const sortType = toID(value);
					if (!validSorts.includes(sortType)) {
						return this.errorReply(`Invalid sort. Valid: ${validSorts.join(', ')}`);
					}
					settings.showcaseSort = sortType as any;
					await PSGOStorage.setUserSettings(user.id, settings);
					return this.sendReply(`Collection sort set to ${sortType}.`);

				default:
					return this.errorReply('Available settings: transfers (on/off), sort (rarity/points/types/name/date)');
			}
		},
		sethelp: `/psgo set [setting, value] - Configure transfers, sorting, etc.`,

		// Help system
		help(target, room, user) {
  if (!this.runBroadcast()) return;
  
  const page = toID(target) || 'main';
  let output = ``;

  switch (page) {
    case 'main':
    case '':
      output = `<div class="ladder pad">` +
        `<h2>PSGO Card System Help</h2>` +
        `<p><strong>User Commands:</strong></p>` +
        `<ul>` +
          `<li><code>/psgo show [cardId]</code> - Show card details</li>` +
          `<li><code>/psgo collection [user]</code> - View card collection</li>` +
          `<li><code>/psgo transfer [user], [cardId]</code> - Transfer cards</li>` +
          `<li><code>/psgo shop</code> - Browse pack shop</li>` +
          `<li><code>/psgo buy [pack]</code> - Buy packs</li>` +
          `<li><code>/psgo open [pack]</code> - Open packs</li>` +
          `<li><code>/psgo ladder</code> - View leaderboard</li>` +
        `</ul>` +
        `<p><strong>Admin Commands:</strong></p>` +
        `<ul>` +
          `<li><code>/psgo add [params]</code> - Add cards/packs</li>` +
          `<li><code>/psgo edit [id, params]</code> - Edit cards/packs</li>` +
          `<li><code>/psgo delete [id]</code> - Delete cards/packs</li>` +
          `<li><code>/psgo give [user], [cardId]</code> - Give cards</li>` +
          `<li><code>/psgo manage [action], [user]</code> - System management</li>` +
        `</ul>` +
      `</div>`;
      break;

    default:
      output = `<div class="ladder pad">` +
        `<h2>PSGO Card System Help</h2>` +
        `<p>Use <code>/psgo help</code> to see all commands.</p>` +
      `</div>`;
  }

  return this.sendReplyBox(output);
},
	},
};
