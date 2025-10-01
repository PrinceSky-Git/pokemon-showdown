/**
 * PSGO Card System - Core Manager
 * @license MIT
 */

import { PSGOStorage } from './psgo-storage';
import { Economy } from '../../impulse/misc/economy';
import type { 
	Card, CardInstance, PackDefinition, PokemonCard, TrainerCard, EnergyCard,
	RARITY_POINTS, RARITY_COLORS, SPECIAL_SUBTYPES
} from './psgo-models';

function toID(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export class PSGOCardManager {
	
	static getSetIdFromCardId(cardId: string): string {
		return cardId.split('-')[0];
	}
	
	// Modern card access
	static async getCardById(cardId: string): Promise<Card | null> {
		const allCards = await PSGOStorage.getAllCards();
		return allCards[cardId] || null;
	}

	static getCardByIdSync(cardId: string): Card | null {
		const allCards = PSGOStorage.getAllCardsSync();
		return allCards[cardId] || null;
	}

	// Pack functions
	static async toPackCode(packInput: string): Promise<string> {
		const packId = toID(packInput);
		const allPacks = await PSGOStorage.getAllPacks();
		
		for (const code in allPacks) {
			if (toID(code) === packId || toID(allPacks[code].name) === packId) {
				return code;
			}
		}
		return packInput;
	}

	// Modern subtype bonuses
	static getSubtypeBonus(card: Card): number {
		if (!card.subtypes) return 0;
		
		const subtypeStr = card.subtypes.join(' ').toUpperCase();
		if (subtypeStr.includes('VMAX') || subtypeStr.includes('VSTAR')) return 5;
		if (subtypeStr.includes('TAG TEAM')) return 6;
		if (subtypeStr.includes('LEGEND') || subtypeStr.includes('Prime')) return 4;
		if (subtypeStr.includes('GX') || subtypeStr.includes('EX') || 
			subtypeStr.includes('V')) return 3;
		if (subtypeStr.includes('MEGA') || subtypeStr.includes('LV.X') || 
			subtypeStr.includes('Radiant') || subtypeStr.includes('Amazing')) return 3;
		if (subtypeStr.includes('BREAK')) return 2;
		if (subtypeStr.includes('Shining') || subtypeStr.includes('â˜…')) return 4;
		
		return 0;
	}

	static getCardPoints(card: Card): number {
		const {RARITY_POINTS} = require('./psgo-models');
		const base = RARITY_POINTS[card.rarity] || 1;
		return base + this.getSubtypeBonus(card);
	}

	// Card type formatting
	static formatCardTypes(card: Card): string {
		const {SPECIAL_SUBTYPES} = require('./psgo-models');
		let baseTypes: string[];
		
		if (card.supertype === 'PokÃ©mon') {
			const pokemonCard = card as PokemonCard;
			baseTypes = pokemonCard.types || ['Colorless'];
		} else {
			baseTypes = [card.supertype];
		}

		let result = baseTypes.join('/');
		
		if (card.subtypes && card.subtypes.length > 0) {
			const specialSubtype = card.subtypes.find(st => SPECIAL_SUBTYPES[st]);
			if (specialSubtype) {
				const conf = SPECIAL_SUBTYPES[specialSubtype];
				const style = `color: ${conf.color}; font-weight: bold${conf.glow ? `; text-shadow: 0 0 8px ${conf.color}80` : ''}`;
				result += ` - <span style="${style}">${specialSubtype}</span>`;
			} else {
				result += ` - <span style="font-weight: bold">${card.subtypes[0]}</span>`;
			}
		}
		return result;
	}

	// Modern pack generation
	static async makePack(setId: string): Promise<CardInstance[]> {
		const out: CardInstance[] = [];
		const allCards = await PSGOStorage.getAllCards();
		const packCards = Object.values(allCards).filter(c => this.getSetIdFromCardId(c.id) === setId);
		
		if (!packCards.length) return out;

		const cardsByRarity: Record<string, Card[]> = {
			'Common': packCards.filter(c => c.rarity === 'Common'),
			'Uncommon': packCards.filter(c => c.rarity === 'Uncommon'),
			'Rare': packCards.filter(c => c.rarity === 'Rare' || c.rarity === 'Rare Holo'),
			'Ultra Rare': packCards.filter(c => 
				c.rarity.includes('Ultra') || c.rarity.includes('Double') ||
				c.rarity.includes('EX') || c.rarity.includes('GX') ||
				c.rarity.includes('V') || c.rarity === 'Ultra Rare'
			),
			'Secret Rare': packCards.filter(c => 
				c.rarity.includes('Secret') || c.rarity.includes('Rainbow') ||
				c.rarity.includes('ACE')
			),
			'Special': packCards.filter(c => 
				c.rarity.includes('Amazing') || c.rarity.includes('Radiant')
			),
		};

		// Standard distribution: 6 Commons, 3 Uncommons, 1 Rare
		for (let i = 0; i < 6; i++) {
			if (cardsByRarity['Common'].length > 0) {
				const randomCard = cardsByRarity['Common'][Math.floor(Math.random() * cardsByRarity['Common'].length)];
				out.push({...randomCard, obtainedAt: Date.now()});
			}
		}

		for (let i = 0; i < 3; i++) {
			if (cardsByRarity['Uncommon'].length > 0) {
				const randomCard = cardsByRarity['Uncommon'][Math.floor(Math.random() * cardsByRarity['Uncommon'].length)];
				out.push({...randomCard, obtainedAt: Date.now()});
			}
		}

		// Rare slot with modern weighted distribution
		const rareRoll = Math.random() * 100;
		let selectedRarity: string;
		
		if (rareRoll < 3) { // 3%
			selectedRarity = 'Special';
		} else if (rareRoll < 10) { // 7%
			selectedRarity = 'Secret Rare';
		} else if (rareRoll < 25) { // 15%
			selectedRarity = 'Ultra Rare';
		} else { // 75%
			selectedRarity = 'Rare';
		}

		const rarityFallback = ['Special', 'Secret Rare', 'Ultra Rare', 'Rare', 'Uncommon', 'Common'];
		const startIdx = rarityFallback.indexOf(selectedRarity);
		
		for (let i = startIdx; i < rarityFallback.length; i++) {
			if (cardsByRarity[rarityFallback[i]].length > 0) {
				const randomCard = cardsByRarity[rarityFallback[i]][Math.floor(Math.random() * cardsByRarity[rarityFallback[i]].length)];
				out.push({...randomCard, obtainedAt: Date.now()});
				break;
			}
		}

		return out;
	}

	// Modern card display
	static displayCard(card: Card): string {
		const {RARITY_COLORS, SPECIAL_SUBTYPES} = require('./psgo-models');
		const points = this.getCardPoints(card);
		const formattedTypes = this.formatCardTypes(card);
		const rarityColor = RARITY_COLORS[card.rarity] || '#cc0000';
		
		const hasSpecialSubtype = card.subtypes?.some(st => SPECIAL_SUBTYPES[st]);
		const borderColor = hasSpecialSubtype && card.subtypes ? 
			SPECIAL_SUBTYPES[card.subtypes.find(st => SPECIAL_SUBTYPES[st])!]?.color || rarityColor : rarityColor;
		const glowEffect = hasSpecialSubtype && card.subtypes && 
			SPECIAL_SUBTYPES[card.subtypes.find(st => SPECIAL_SUBTYPES[st])!]?.glow ? 
			`box-shadow: 0 0 12px ${borderColor}50` : '';

		let additionalInfo = '';

		if (card.supertype === 'PokÃ©mon') {
			const pokemonCard = card as PokemonCard;
			additionalInfo += `<div style="margin-bottom: 10px"><strong>HP:</strong> ${pokemonCard.hp}</div>`;
			
			if (pokemonCard.evolvesFrom) {
				additionalInfo += `<div style="margin-bottom: 10px"><strong>Evolves From:</strong> ${pokemonCard.evolvesFrom}</div>`;
			}
			
			if (pokemonCard.attacks && pokemonCard.attacks.length > 0) {
				additionalInfo += `<div style="margin-bottom: 10px"><strong>Attacks:</strong><br>`;
				for (const attack of pokemonCard.attacks) {
					additionalInfo += `${attack.name}`;
					if (attack.damage) additionalInfo += ` ${attack.damage}`;
					if (attack.text) additionalInfo += ` - ${attack.text}`;
					additionalInfo += `<br>`;
				}
				additionalInfo += `</div>`;
			}

			if (pokemonCard.abilities && pokemonCard.abilities.length > 0) {
				additionalInfo += `<div style="margin-bottom: 10px"><strong>Abilities:</strong><br>`;
				for (const ability of pokemonCard.abilities) {
					additionalInfo += `${ability.name} (${ability.type})<br>`;
					if (ability.text) additionalInfo += `${ability.text}<br>`;
				}
				additionalInfo += `</div>`;
			}

			if (pokemonCard.weaknesses && pokemonCard.weaknesses.length > 0) {
				const weaknessStr = pokemonCard.weaknesses.map(w => `${w.type} ${w.value}`).join(', ');
				additionalInfo += `<div style="margin-bottom: 10px"><strong>Weakness:</strong> ${weaknessStr}</div>`;
			}

			if (pokemonCard.retreatCost && pokemonCard.retreatCost.length > 0) {
				additionalInfo += `<div style="margin-bottom: 10px"><strong>Retreat Cost:</strong> ${pokemonCard.retreatCost.length}</div>`;
			}
		} else if (card.rules && card.rules.length > 0) {
			additionalInfo += `<div style="margin-bottom: 10px"><strong>Effects:</strong><br>${card.rules.join('<br>')}</div>`;
		}

		return `<div style="border: 2px solid ${borderColor}; ${glowEffect}; border-radius: 8px; padding: 16px; overflow: hidden;">
			<table style="width: 100%; border-collapse: collapse;">
				<tr>
					<td style="width: 210px; vertical-align: top; padding-right: 24px;">
						<img src="${card.images.small}" alt="${card.name}" width="200" style="display: block; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
					</td>
					<td style="vertical-align: top; line-height: 1.7;">
						<div style="font-size: 2em; font-weight: bold; margin-bottom: 8px;">${card.name}</div>
						<div style="color: ${rarityColor}; font-weight: bold; font-size: 1.2em; margin-bottom: 20px;">${card.rarity}</div>
						<div style="margin-bottom: 10px;"><strong>ID:</strong> ${card.id}</div>
						<div style="margin-bottom: 10px;"><strong>Number:</strong> ${card.number}</div>
						<div style="margin-bottom: 10px;"><strong>Types:</strong> ${formattedTypes}</div>
						<div style="margin-bottom: 10px;"><strong>Artist:</strong> ${card.artist}</div>
						${additionalInfo}
						${card.flavorText ? `<div style="margin-bottom: 10px; font-style: italic; color: #666;">${card.flavorText}</div>` : ''}
						<div style="margin-top: 16px; font-size: 1.1em;"><strong>Points:</strong> ${points}${this.getSubtypeBonus(card) > 0 ? ` <span style="color: #4caf50;">(+${this.getSubtypeBonus(card)})</span>` : ''}</div>
					</td>
				</tr>
			</table>
		</div>`;
	}

	// Economy integration
	static async buyPack(userId: string, packCode: string): Promise<{success: boolean, message: string}> {
		const allPacks = await PSGOStorage.getAllPacks();
		const pack = allPacks[packCode];
		
		if (!pack) {
			return {success: false, message: 'Pack not found.'};
		}
		
		if (!pack.inShop && !pack.creditPack) {
			return {success: false, message: 'Pack not available.'};
		}

		if (pack.creditPack) {
			const credits = await PSGOStorage.getPackCredits(userId);
			if (credits < 1) {
				return {success: false, message: 'You need 1 pack credit to buy this pack.'};
			}
			
			const success = await PSGOStorage.takePackCredits(userId, 1);
			if (!success) {
				return {success: false, message: 'Failed to use pack credit.'};
			}
			
			await PSGOStorage.addUserPack(userId, packCode);
			return {
				success: true, 
				message: `You used 1 pack credit to buy **${pack.name}**! Remaining credits: ${credits - 1}`
			};
		}

		const userMoney = Economy.readMoney(userId);
		if (userMoney < pack.price) {
			return {success: false, message: `You need ${pack.price} ${Economy.currency} to buy this pack!`};
		}

		Economy.takeMoney(userId, pack.price, `Purchased ${pack.name} pack`, 'system');
		await PSGOStorage.addUserPack(userId, packCode);
		
		return {
			success: true,
			message: `You bought **${pack.name}** for ${pack.price} ${Economy.currency}!`
		};
	}

	// Transfer functionality
	static async transferCard(fromUserId: string, toUserId: string, cardId: string): Promise<{success: boolean, message: string}> {
		const hasCard = await PSGOStorage.hasCard(fromUserId, cardId);
		if (!hasCard) {
			return {success: false, message: 'You do not have that card.'};
		}

		const card = await this.getCardById(cardId);
		if (!card) {
			return {success: false, message: 'Card not found.'};
		}

		const success = await PSGOStorage.removeUserCard(fromUserId, cardId);
		if (!success) {
			return {success: false, message: 'Transfer failed. Please try again.'};
		}

		const cardInstance: CardInstance = {...card, obtainedAt: Date.now()};
		await PSGOStorage.addUserCard(toUserId, cardInstance);

		return {
			success: true,
			message: `Successfully transferred ${card.name} to the recipient.`
		};
	}

	// Admin functions
	static async giveCard(toUserId: string, cardId: string): Promise<{success: boolean, message: string}> {
		const card = await this.getCardById(cardId);
		if (!card) {
			return {success: false, message: 'Card not found.'};
		}

		const cardInstance: CardInstance = {...card, obtainedAt: Date.now()};
		await PSGOStorage.addUserCard(toUserId, cardInstance);

		return {
			success: true,
			message: `Successfully gave ${card.name} to the recipient.`
		};
	}
}
