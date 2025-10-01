/**
 * PSGO Card System - Storage Layer
 * @license MIT
 */

import FS from '../../lib/fs';
import type { Card, PackDefinition, CardInstance, UserSettings } from './psgo-models';

const DATA_PATHS = {
	userCards: 'impulse-db/psgo-user-cards.json',
	userPacks: 'impulse-db/psgo-user-packs.json', 
	packCredits: 'impulse-db/psgo-pack-credits.json',
	managers: 'impulse-db/psgo-managers.json',
	userSettings: 'impulse-db/psgo-user-settings.json',
	cardDefinitions: 'impulse-db/psgo-card-definitions.json',
	packDefinitions: 'impulse-db/psgo-pack-definitions.json',
};

// Cache system
const cache = new Map<string, any>();
const CACHE_TTL = 30 * 60 * 1000;
const cacheTimestamps = new Map<string, number>();

export class PSGOStorage {
	
	private static async loadData<T>(filePath: string, defaultValue: T): Promise<T> {
		try {
			const data = await FS(filePath).readIfExists();
			return data ? JSON.parse(data) : defaultValue;
		} catch (error) {
			console.error(`Error loading PSGO data from ${filePath}:`, error);
			return defaultValue;
		}
	}

	private static loadDataSync<T>(filePath: string, defaultValue: T): T {
		try {
			const data = FS(filePath).readIfExistsSync();
			return data ? JSON.parse(data) : defaultValue;
		} catch (error) {
			console.error(`Error loading PSGO data from ${filePath}:`, error);
			return defaultValue;
		}
	}

	private static async saveData<T>(filePath: string, data: T): Promise<void> {
		try {
			await FS(filePath).writeUpdate(() => JSON.stringify(data, null, 2));
			cache.set(filePath, data);
			cacheTimestamps.set(filePath, Date.now());
		} catch (error) {
			console.error(`Error saving PSGO data to ${filePath}:`, error);
			throw error;
		}
	}

	private static getCachedData<T>(filePath: string): T | null {
		const timestamp = cacheTimestamps.get(filePath);
		if (!timestamp || Date.now() - timestamp > CACHE_TTL) {
			cache.delete(filePath);
			cacheTimestamps.delete(filePath);
			return null;
		}
		return cache.get(filePath) || null;
	}

	// User Cards
	static async getUserCards(userId: string): Promise<CardInstance[]> {
		const cacheKey = `${DATA_PATHS.userCards}:${userId}`;
		const cached = this.getCachedData<CardInstance[]>(cacheKey);
		if (cached) return cached;

		const allData = await this.loadData(DATA_PATHS.userCards, {});
		const userCards = (allData as any)[userId] || [];
		
		cache.set(cacheKey, userCards);
		cacheTimestamps.set(cacheKey, Date.now());
		return userCards;
	}

	static async setUserCards(userId: string, cards: CardInstance[]): Promise<void> {
		const allData = await this.loadData(DATA_PATHS.userCards, {});
		(allData as any)[userId] = cards;
		await this.saveData(DATA_PATHS.userCards, allData);
		
		const cacheKey = `${DATA_PATHS.userCards}:${userId}`;
		cache.set(cacheKey, cards);
		cacheTimestamps.set(cacheKey, Date.now());
	}

	static async addUserCard(userId: string, card: CardInstance): Promise<void> {
		const cards = await this.getUserCards(userId);
		cards.push(card);
		await this.setUserCards(userId, cards);
	}

	static async removeUserCard(userId: string, cardId: string): Promise<boolean> {
		const cards = await this.getUserCards(userId);
		const index = cards.findIndex(card => card.id === cardId);
		if (index === -1) return false;
		
		cards.splice(index, 1);
		await this.setUserCards(userId, cards);
		return true;
	}

	static async hasCard(userId: string, cardId: string): Promise<boolean> {
		const cards = await this.getUserCards(userId);
		return cards.some(card => card.id === cardId);
	}

	// User Packs
	static async getUserPacks(userId: string): Promise<string[]> {
		const allData = await this.loadData(DATA_PATHS.userPacks, {});
		return (allData as any)[userId] || [];
	}

	static async setUserPacks(userId: string, packs: string[]): Promise<void> {
		const allData = await this.loadData(DATA_PATHS.userPacks, {});
		(allData as any)[userId] = packs;
		await this.saveData(DATA_PATHS.userPacks, allData);
	}

	static async addUserPack(userId: string, packCode: string): Promise<void> {
		const packs = await this.getUserPacks(userId);
		packs.push(packCode);
		await this.setUserPacks(userId, packs);
	}

	static async removeUserPack(userId: string, packCode: string): Promise<boolean> {
		const packs = await this.getUserPacks(userId);
		const index = packs.indexOf(packCode);
		if (index === -1) return false;
		
		packs.splice(index, 1);
		await this.setUserPacks(userId, packs);
		return true;
	}

	// Pack Credits
	static async getPackCredits(userId: string): Promise<number> {
		const allData = await this.loadData(DATA_PATHS.packCredits, {});
		return (allData as any)[userId] || 0;
	}

	static async setPackCredits(userId: string, credits: number): Promise<void> {
		const allData = await this.loadData(DATA_PATHS.packCredits, {});
		(allData as any)[userId] = credits;
		await this.saveData(DATA_PATHS.packCredits, allData);
	}

	static async addPackCredits(userId: string, amount: number): Promise<void> {
		const current = await this.getPackCredits(userId);
		await this.setPackCredits(userId, current + amount);
	}

	static async takePackCredits(userId: string, amount: number): Promise<boolean> {
		const current = await this.getPackCredits(userId);
		if (current < amount) return false;
		
		await this.setPackCredits(userId, current - amount);
		return true;
	}

	// Managers
	static async getManagers(): Promise<string[]> {
		const cached = this.getCachedData<string[]>(DATA_PATHS.managers);
		if (cached) return cached;

		const data = await this.loadData(DATA_PATHS.managers, []);
		cache.set(DATA_PATHS.managers, data);
		cacheTimestamps.set(DATA_PATHS.managers, Date.now());
		return data as string[];
	}

	static async setManagers(managers: string[]): Promise<void> {
		await this.saveData(DATA_PATHS.managers, managers);
	}

	static async isManager(userId: string): Promise<boolean> {
		const managers = await this.getManagers();
		return managers.includes(userId);
	}

	static async addManager(userId: string): Promise<boolean> {
		const managers = await this.getManagers();
		if (managers.includes(userId)) return false;
		
		managers.push(userId);
		await this.setManagers(managers);
		return true;
	}

	static async removeManager(userId: string): Promise<boolean> {
		const managers = await this.getManagers();
		const index = managers.indexOf(userId);
		if (index === -1) return false;
		
		managers.splice(index, 1);
		await this.setManagers(managers);
		return true;
	}

	// User Settings
	static async getUserSettings(userId: string): Promise<UserSettings> {
		const allData = await this.loadData(DATA_PATHS.userSettings, {});
		return (allData as any)[userId] || {};
	}

	static async setUserSettings(userId: string, settings: UserSettings): Promise<void> {
		const allData = await this.loadData(DATA_PATHS.userSettings, {});
		(allData as any)[userId] = settings;
		await this.saveData(DATA_PATHS.userSettings, allData);
	}

	// Card Definitions
	static async getAllCards(): Promise<Record<string, Card>> {
		const cached = this.getCachedData<Record<string, Card>>(DATA_PATHS.cardDefinitions);
		if (cached) return cached;

		const cards = await this.loadData(DATA_PATHS.cardDefinitions, {});
		cache.set(DATA_PATHS.cardDefinitions, cards);
		cacheTimestamps.set(DATA_PATHS.cardDefinitions, Date.now());
		return cards as Record<string, Card>;
	}

	static getAllCardsSync(): Record<string, Card> {
		const cached = this.getCachedData<Record<string, Card>>(DATA_PATHS.cardDefinitions);
		if (cached) return cached;

		const cards = this.loadDataSync(DATA_PATHS.cardDefinitions, {});
		cache.set(DATA_PATHS.cardDefinitions, cards);
		cacheTimestamps.set(DATA_PATHS.cardDefinitions, Date.now());
		return cards as Record<string, Card>;
	}

	static async saveAllCards(cards: Record<string, Card>): Promise<void> {
		await this.saveData(DATA_PATHS.cardDefinitions, cards);
	}

	// Pack Definitions
	static async getAllPacks(): Promise<Record<string, PackDefinition>> {
		const cached = this.getCachedData<Record<string, PackDefinition>>(DATA_PATHS.packDefinitions);
		if (cached) return cached;

		const packs = await this.loadData(DATA_PATHS.packDefinitions, {});
		cache.set(DATA_PATHS.packDefinitions, packs);
		cacheTimestamps.set(DATA_PATHS.packDefinitions, Date.now());
		return packs as Record<string, PackDefinition>;
	}

	static getAllPacksSync(): Record<string, PackDefinition> {
		const cached = this.getCachedData<Record<string, PackDefinition>>(DATA_PATHS.packDefinitions);
		if (cached) return cached;

		const packs = this.loadDataSync(DATA_PATHS.packDefinitions, {});
		cache.set(DATA_PATHS.packDefinitions, packs);
		cacheTimestamps.set(DATA_PATHS.packDefinitions, Date.now());
		return packs as Record<string, PackDefinition>;
	}

	static async saveAllPacks(packs: Record<string, PackDefinition>): Promise<void> {
		await this.saveData(DATA_PATHS.packDefinitions, packs);
	}

	// Bulk operations
	static async getAllUserCards(): Promise<Record<string, CardInstance[]>> {
		return await this.loadData(DATA_PATHS.userCards, {});
	}

	static clearCache(): void {
		cache.clear();
		cacheTimestamps.clear();
	}
}
