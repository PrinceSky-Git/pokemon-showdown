/**
 * PSGO Card System - Models and Interfaces
 * @license MIT
 */

// Configuration
export const CARDS_PER_PACK = 10;
export const CURRENCY = Impulse.currency;

// Official Pokemon TCG Card Interfaces
export interface PokemonTCGCard {
	id: string;
	name: string;
	supertype: 'PokÃ©mon' | 'Trainer' | 'Energy';
	number: string;
	artist: string;
	rarity: string;
	legalities: {
		unlimited: 'Legal' | 'Banned';
		standard?: 'Legal' | 'Banned';
		expanded?: 'Legal' | 'Banned';
	};
	images: {
		small: string;
		large: string;
	};
	subtypes?: string[];
	flavorText?: string;
	regulationMark?: string;
	rules?: string[];
}

export interface PokemonCard extends PokemonTCGCard {
	supertype: 'PokÃ©mon';
	hp: string;
	types: string[];
	evolvesFrom?: string;
	evolvesTo?: string[];
	abilities?: Array<{
		name: string;
		text: string;
		type: 'PokÃ©mon Power' | 'Ability' | 'PokÃ©-Power' | 'PokÃ©-Body' | 'Ancient Trait';
	}>;
	attacks?: Array<{
		name: string;
		cost: string[];
		convertedEnergyCost: number;
		damage: string;
		text: string;
	}>;
	weaknesses?: Array<{
		type: string;
		value: string;
	}>;
	resistances?: Array<{
		type: string;
		value: string;
	}>;
	retreatCost?: string[];
	convertedRetreatCost?: number;
	nationalPokedexNumbers?: number[];
}

export interface TrainerCard extends PokemonTCGCard {
	supertype: 'Trainer';
	rules: string[];
}

export interface EnergyCard extends PokemonTCGCard {
	supertype: 'Energy';
	subtypes: ['Basic'] | ['Special'];
	rules?: string[];
}

export type Card = PokemonCard | TrainerCard | EnergyCard;

export interface CardInstance extends Card {
	obtainedAt?: number;
}

export interface PackDefinition {
	code: string;
	name: string;
	series: string;
	releaseDate: string;
	price: number;
	inShop: boolean;
	creditPack: boolean;
}

export interface UserSettings {
	transfersEnabled?: boolean;
	showcaseSort?: 'rarity' | 'points' | 'types' | 'name' | 'date';
}

// Modern Pokemon TCG Rarities
export type CardRarity = 
	| 'Common' | 'Uncommon' | 'Rare' | 'Rare Holo' 
	| 'Rare Holo EX' | 'Rare Holo GX' | 'Rare Holo V'
	| 'Rare Holo VMAX' | 'Rare Holo VSTAR' | 'Double Rare'
	| 'Ultra Rare' | 'Secret Rare' | 'Rare Secret'
	| 'Rare Rainbow' | 'Rare ACE' | 'Amazing Rare'
	| 'Radiant Rare' | 'Promo' | 'Classic Collection';

// Data storage interfaces
export interface PSGOData {
	userCards: Record<string, CardInstance[]>;
	userPacks: Record<string, string[]>;
	packCredits: Record<string, number>;
	managers: string[];
	userSettings: Record<string, UserSettings>;
	cardDefinitions: Record<string, Card>;
	packDefinitions: Record<string, PackDefinition>;
}

// Modern rarity points
export const RARITY_POINTS: Record<string, number> = {
	'Common': 1,
	'Uncommon': 3,
	'Rare': 6,
	'Rare Holo': 8,
	'Rare Holo EX': 12,
	'Rare Holo GX': 12,
	'Rare Holo V': 12,
	'Rare Holo VMAX': 15,
	'Rare Holo VSTAR': 15,
	'Double Rare': 10,
	'Ultra Rare': 10,
	'Secret Rare': 15,
	'Rare Secret': 15,
	'Rare Rainbow': 20,
	'Rare ACE': 20,
	'Amazing Rare': 18,
	'Radiant Rare': 18,
	'Promo': 5,
	'Classic Collection': 25,
};

export const RARITY_COLORS: Record<string, string> = {
	'Common': '#0066ff',
	'Uncommon': '#008000',
	'Rare': '#cc0000',
	'Rare Holo': '#cc0000',
	'Rare Holo EX': '#FFD700',
	'Rare Holo GX': '#FF6B35',
	'Rare Holo V': '#00D4AA',
	'Rare Holo VMAX': '#FF1493',
	'Rare Holo VSTAR': '#9932CC',
	'Double Rare': '#800080',
	'Ultra Rare': '#800080',
	'Secret Rare': '#C0C0C0',
	'Rare Secret': '#C0C0C0',
	'Rare Rainbow': '#FF69B4',
	'Rare ACE': '#FFD700',
	'Amazing Rare': '#FFD700',
	'Radiant Rare': '#FF1493',
	'Promo': '#4169E1',
	'Classic Collection': '#B8860B',
};

export const SPECIAL_SUBTYPES: Record<string, {color: string, glow: boolean}> = {
	'EX': {color: '#FFD700', glow: true},
	'ex': {color: '#FFB347', glow: true},
	'GX': {color: '#FF6B35', glow: true},
	'V': {color: '#00D4AA', glow: true},
	'VMAX': {color: '#FF1493', glow: true},
	'VSTAR': {color: '#9932CC', glow: true},
	'LEGEND': {color: '#B8860B', glow: true},
	'Prime': {color: '#32CD32', glow: true},
	'BREAK': {color: '#FF4500', glow: true},
	'TAG TEAM': {color: '#4169E1', glow: true},
	'MEGA': {color: '#8B008B', glow: true},
	'LV.X': {color: '#DC143C', glow: true},
	'Radiant': {color: '#FF1493', glow: true},
	'Amazing': {color: '#FFD700', glow: true},
	'Prism Star': {color: '#C0C0C0', glow: true},
	'â˜…': {color: '#C0C0C0', glow: true},
	'Shining': {color: '#C0C0C0', glow: true},
	'Stage 1': {color: '#4169E1', glow: false},
	'Stage 2': {color: '#8B008B', glow: false},
	'Basic': {color: '#228B22', glow: false},
};
