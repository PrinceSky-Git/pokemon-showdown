/**
 * MongoDB
 * Pokemon Showdown - http://pokemonshowdown.com/
 *
 * An abstraction layer around MongoDB operations for cloud storage.
 *
 * Advantages:
 * - PS-style API: MongoDB("users").findOne({id: "user123"})
 * - Automatic connection management with timeouts
 * - Promise-based operations
 * - Consistent error handling
 * - Query builder pattern
 * - Optimized connection pooling
 * - Does nothing in unit tests when disabled
 *
 * @license MIT
 */

import { MongoClient, Db, Collection, Document, Filter, UpdateFilter, FindOptions, InsertOneOptions, UpdateOptions, DeleteOptions, BulkWriteOptions, MongoClientOptions } from 'mongodb';

interface MongoConfig {
	uri: string;
	database: string;
	nodbwriting?: boolean;
	// Connection pool options
	maxPoolSize?: number;
	minPoolSize?: number;
	maxIdleTimeMS?: number;
	waitQueueTimeoutMS?: number;
	serverSelectionTimeoutMS?: number;
}

interface PendingOperation {
	isExecuting: boolean;
	pendingOps: (() => Promise<any>)[];
	throttleTime: number;
	throttleTimer: NodeJS.Timeout | null;
}

declare const __mongoState: {
	client: MongoClient | null;
	db: Db | null;
	config: MongoConfig | null;
	isConnected: boolean;
	pendingOperations: Map<string, PendingOperation>;
};

declare const global: {
	__mongoState: typeof __mongoState;
	Config: any;
};

if (!global.__mongoState) {
	global.__mongoState = {
		client: null,
		db: null,
		config: null,
		isConnected: false,
		pendingOperations: new Map(),
	};
}

export class MongoDBError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MongoDBError';
	}
}

export class MongoDBPath<T extends Document = Document> {
	collectionName: string;
	private _collection: Collection<T> | null = null;

	constructor(collectionName: string) {
		this.collectionName = collectionName;
	}

	private async getCollection(): Promise<Collection<T>> {
		if (!__mongoState.isConnected || !__mongoState.db) {
			throw new MongoDBError('MongoDB not connected. Call MongoDB.connect() first.');
		}
		if (!this._collection) {
			this._collection = __mongoState.db.collection<T>(this.collectionName);
		}
		return this._collection;
	}

	private checkWritePermission(): boolean {
		return !global.Config?.nodbwriting && !__mongoState.config?.nodbwriting;
	}

	// READ OPERATIONS

	async findOne(filter: Filter<T> = {}, options?: FindOptions): Promise<T | null> {
		const collection = await this.getCollection();
		return collection.findOne(filter, options);
	}

	async find(filter: Filter<T> = {}, options?: FindOptions): Promise<T[]> {
		const collection = await this.getCollection();
		return collection.find(filter, options).toArray();
	}

	async findById(id: any): Promise<T | null> {
		return this.findOne({ _id: id } as Filter<T>);
	}

	async count(filter: Filter<T> = {}): Promise<number> {
		const collection = await this.getCollection();
		return collection.countDocuments(filter);
	}

	async exists(filter: Filter<T>): Promise<boolean> {
		const count = await this.count(filter);
		return count > 0;
	}

	// WRITE OPERATIONS

	async insertOne(document: Omit<T, '_id'>, options?: InsertOneOptions): Promise<any> {
		if (!this.checkWritePermission()) return Promise.resolve(null);
		const collection = await this.getCollection();
		const result = await collection.insertOne(document as any, options);
		return result.insertedId;
	}

	async insertMany(documents: Omit<T, '_id'>[], options?: BulkWriteOptions): Promise<any[]> {
		if (!this.checkWritePermission()) return Promise.resolve([]);
		const collection = await this.getCollection();
		const result = await collection.insertMany(documents as any[], options);
		return Object.values(result.insertedIds);
	}

	async updateOne(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<number> {
		if (!this.checkWritePermission()) return Promise.resolve(0);
		const collection = await this.getCollection();
		const result = await collection.updateOne(filter, update, options);
		return result.modifiedCount;
	}

	async updateMany(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<number> {
		if (!this.checkWritePermission()) return Promise.resolve(0);
		const collection = await this.getCollection();
		const result = await collection.updateMany(filter, update, options);
		return result.modifiedCount;
	}

	async replaceOne(filter: Filter<T>, document: Omit<T, '_id'>, options?: UpdateOptions): Promise<number> {
		if (!this.checkWritePermission()) return Promise.resolve(0);
		const collection = await this.getCollection();
		const result = await collection.replaceOne(filter, document as any, options);
		return result.modifiedCount;
	}

	async deleteOne(filter: Filter<T>, options?: DeleteOptions): Promise<number> {
		if (!this.checkWritePermission()) return Promise.resolve(0);
		const collection = await this.getCollection();
		const result = await collection.deleteOne(filter, options);
		return result.deletedCount;
	}

	async deleteMany(filter: Filter<T>, options?: DeleteOptions): Promise<number> {
		if (!this.checkWritePermission()) return Promise.resolve(0);
		const collection = await this.getCollection();
		const result = await collection.deleteMany(filter, options);
		return result.deletedCount;
	}

	// UPSERT OPERATIONS

	async upsert(filter: Filter<T>, document: Partial<T>): Promise<boolean> {
		if (!this.checkWritePermission()) return Promise.resolve(false);
		const collection = await this.getCollection();
		const result = await collection.updateOne(
			filter,
			{ $set: document } as UpdateFilter<T>,
			{ upsert: true }
		);
		return result.upsertedCount > 0 || result.modifiedCount > 0;
	}

	// ATOMIC OPERATIONS (safer for concurrent scenarios)

	async increment(filter: Filter<T>, field: string, value: number = 1, options?: UpdateOptions): Promise<number> {
		if (!this.checkWritePermission()) return Promise.resolve(0);
		const collection = await this.getCollection();
		const update = { $inc: { [field]: value } } as UpdateFilter<T>;
		const result = await collection.updateOne(filter, update, options);
		return result.modifiedCount;
	}

	async push(filter: Filter<T>, field: string, value: any, options?: UpdateOptions): Promise<number> {
		if (!this.checkWritePermission()) return Promise.resolve(0);
		const collection = await this.getCollection();
		const update = { $push: { [field]: value } } as UpdateFilter<T>;
		const result = await collection.updateOne(filter, update, options);
		return result.modifiedCount;
	}

	async pull(filter: Filter<T>, field: string, value: any, options?: UpdateOptions): Promise<number> {
		if (!this.checkWritePermission()) return Promise.resolve(0);
		const collection = await this.getCollection();
		const update = { $pull: { [field]: value } } as UpdateFilter<T>;
		const result = await collection.updateOne(filter, update, options);
		return result.modifiedCount;
	}

	async addToSet(filter: Filter<T>, field: string, value: any, options?: UpdateOptions): Promise<number> {
		if (!this.checkWritePermission()) return Promise.resolve(0);
		const collection = await this.getCollection();
		const update = { $addToSet: { [field]: value } } as UpdateFilter<T>;
		const result = await collection.updateOne(filter, update, options);
		return result.modifiedCount;
	}

	async setOnInsert(filter: Filter<T>, document: Partial<T>, options?: UpdateOptions): Promise<boolean> {
		if (!this.checkWritePermission()) return Promise.resolve(false);
		const collection = await this.getCollection();
		const result = await collection.updateOne(
			filter,
			{ $setOnInsert: document } as UpdateFilter<T>,
			{ ...options, upsert: true }
		);
		return result.upsertedCount > 0;
	}

	async unset(filter: Filter<T>, fields: string[], options?: UpdateOptions): Promise<number> {
		if (!this.checkWritePermission()) return Promise.resolve(0);
		const collection = await this.getCollection();
		const unsetObj = Object.fromEntries(fields.map(f => [f, ""]));
		const update = { $unset: unsetObj } as UpdateFilter<T>;
		const result = await collection.updateOne(filter, update, options);
		return result.modifiedCount;
	}

	// FIND AND MODIFY (atomic read-modify-write)

	async findOneAndUpdate(
		filter: Filter<T>,
		update: UpdateFilter<T>,
		options?: { returnDocument?: 'before' | 'after'; upsert?: boolean; sort?: any }
	): Promise<T | null> {
		if (!this.checkWritePermission()) return Promise.resolve(null);
		const collection = await this.getCollection();
		const result = await collection.findOneAndUpdate(filter, update, {
			returnDocument: options?.returnDocument || 'after',
			upsert: options?.upsert,
			sort: options?.sort,
		});
		return result || null;
	}

	async findOneAndReplace(
		filter: Filter<T>,
		replacement: Omit<T, '_id'>,
		options?: { returnDocument?: 'before' | 'after'; upsert?: boolean; sort?: any }
	): Promise<T | null> {
		if (!this.checkWritePermission()) return Promise.resolve(null);
		const collection = await this.getCollection();
		const result = await collection.findOneAndReplace(filter, replacement as any, {
			returnDocument: options?.returnDocument || 'after',
			upsert: options?.upsert,
			sort: options?.sort,
		});
		return result || null;
	}

	async findOneAndDelete(
		filter: Filter<T>,
		options?: { sort?: any }
	): Promise<T | null> {
		if (!this.checkWritePermission()) return Promise.resolve(null);
		const collection = await this.getCollection();
		const result = await collection.findOneAndDelete(filter, options);
		return result || null;
	}

	// ADVANCED OPERATIONS

	/**
	 * Similar to writeUpdate in FS - safely updates with throttling
	 * to avoid race conditions and excessive writes.
	 */
	updateThrottled(
		filter: Filter<T>,
		dataFetcher: () => UpdateFilter<T> | Promise<UpdateFilter<T>>,
		options: { throttle?: number } = {}
	) {
		if (!this.checkWritePermission()) return;

		const key = `${this.collectionName}:${JSON.stringify(filter)}`;
		const pendingOp = __mongoState.pendingOperations.get(key);
		const throttleTime = options.throttle ? Date.now() + options.throttle : 0;

		if (pendingOp) {
			pendingOp.pendingOps.push(async () => {
				const update = await dataFetcher();
				return this.updateOne(filter, update);
			});

			if (pendingOp.throttleTimer && throttleTime < pendingOp.throttleTime) {
				pendingOp.throttleTime = throttleTime;
				clearTimeout(pendingOp.throttleTimer);
				pendingOp.throttleTimer = setTimeout(
					() => this.checkNextOperation(key),
					throttleTime - Date.now()
				);
			}
			return;
		}

		if (!throttleTime) {
			void this.executeUpdateNow(key, filter, dataFetcher);
			return;
		}

		const operation: PendingOperation = {
			isExecuting: false,
			pendingOps: [async () => {
				const update = await dataFetcher();
				return this.updateOne(filter, update);
			}],
			throttleTime,
			throttleTimer: setTimeout(
				() => this.checkNextOperation(key),
				throttleTime - Date.now()
			),
		};
		__mongoState.pendingOperations.set(key, operation);
	}

	private async executeUpdateNow(
		key: string,
		filter: Filter<T>,
		dataFetcher: () => UpdateFilter<T> | Promise<UpdateFilter<T>>
	) {
		const throttleTime = Date.now();
		const operation: PendingOperation = {
			isExecuting: true,
			pendingOps: [],
			throttleTime,
			throttleTimer: null,
		};
		__mongoState.pendingOperations.set(key, operation);

		try {
			const update = await dataFetcher();
			await this.updateOne(filter, update);
		} finally {
			this.finishOperation(key);
		}
	}

	private checkNextOperation(key: string) {
		const pendingOp = __mongoState.pendingOperations.get(key);
		if (!pendingOp) throw new MongoDBError('Pending operation not found');
		if (pendingOp.isExecuting) throw new MongoDBError('Conflicting operation');

		if (pendingOp.pendingOps.length === 0) {
			__mongoState.pendingOperations.delete(key);
			return;
		}

		const ops = [...pendingOp.pendingOps];
		pendingOp.pendingOps = [];
		pendingOp.isExecuting = true;

		void Promise.all(ops.map(op => op())).then(() => this.finishOperation(key));
	}

	private finishOperation(key: string) {
		const pendingOp = __mongoState.pendingOperations.get(key);
		if (!pendingOp) throw new MongoDBError('Pending operation not found');
		if (!pendingOp.isExecuting) throw new MongoDBError('Conflicting operation');

		pendingOp.isExecuting = false;
		const throttleTime = pendingOp.throttleTime;

		if (!throttleTime || throttleTime < Date.now()) {
			this.checkNextOperation(key);
			return;
		}

		pendingOp.throttleTimer = setTimeout(
			() => this.checkNextOperation(key),
			throttleTime - Date.now()
		);
	}

	// AGGREGATION

	async aggregate<R = any>(pipeline: Document[]): Promise<R[]> {
		const collection = await this.getCollection();
		return collection.aggregate<R>(pipeline).toArray();
	}

	// BULK OPERATIONS

	async bulkWrite(operations: any[], options?: BulkWriteOptions): Promise<any> {
		if (!this.checkWritePermission()) return Promise.resolve(null);
		const collection = await this.getCollection();
		return collection.bulkWrite(operations, options);
	}

	// DISTINCT VALUES

	async distinct(field: string, filter: Filter<T> = {}): Promise<any[]> {
		const collection = await this.getCollection();
		return collection.distinct(field, filter);
	}

	// SORTING AND PAGINATION

	async findWithPagination(
		filter: Filter<T> = {},
		options: { page?: number; limit?: number; sort?: any } = {}
	): Promise<{ data: T[]; total: number; page: number; pages: number }> {
		const page = options.page || 1;
		const limit = options.limit || 10;
		const skip = (page - 1) * limit;

		const [data, total] = await Promise.all([
			this.find(filter, { skip, limit, sort: options.sort }),
			this.count(filter),
		]);

		return {
			data,
			total,
			page,
			pages: Math.ceil(total / limit),
		};
	}

	async findSorted(filter: Filter<T> = {}, sort: any, limit?: number): Promise<T[]> {
		const options: FindOptions = { sort };
		if (limit) options.limit = limit;
		return this.find(filter, options);
	}

	// INDEX MANAGEMENT

	async createIndex(keys: Document, options?: any): Promise<string> {
		if (!this.checkWritePermission()) return Promise.resolve('');
		const collection = await this.getCollection();
		return collection.createIndex(keys, options);
	}

	async dropIndex(indexName: string): Promise<void> {
		if (!this.checkWritePermission()) return Promise.resolve();
		const collection = await this.getCollection();
		await collection.dropIndex(indexName);
	}

	async listIndexes(): Promise<Document[]> {
		const collection = await this.getCollection();
		return collection.listIndexes().toArray();
	}

	// TEXT SEARCH

	async textSearch(searchText: string, filter: Filter<T> = {}, options?: FindOptions): Promise<T[]> {
		const searchFilter = {
			...filter,
			$text: { $search: searchText },
		} as Filter<T>;
		return this.find(searchFilter, options);
	}

	// GEOSPATIAL QUERIES

	async findNear(
		field: string,
		coordinates: [number, number],
		maxDistance?: number,
		minDistance?: number
	): Promise<T[]> {
		const query = {
			[field]: {
				$near: {
					$geometry: { type: 'Point', coordinates },
					...(maxDistance && { $maxDistance: maxDistance }),
					...(minDistance && { $minDistance: minDistance }),
				},
			},
		} as Filter<T>;
		return this.find(query);
	}

	async findWithinRadius(
		field: string,
		coordinates: [number, number],
		radiusInMeters: number
	): Promise<T[]> {
		const query = {
			[field]: {
				$geoWithin: {
					$centerSphere: [coordinates, radiusInMeters / 6378100], // Earth radius in meters
				},
			},
		} as Filter<T>;
		return this.find(query);
	}
}

function getMongoDB<T extends Document = Document>(collectionName: string): MongoDBPath<T> {
	return new MongoDBPath<T>(collectionName);
}

export const MongoDB = Object.assign(getMongoDB, {
	MongoDBPath,
	MongoDBError,

	/**
	 * Connect to MongoDB with optimized connection pool settings.
	 */
	async connect(config: MongoConfig): Promise<void> {
		if (__mongoState.isConnected) {
			console.log('MongoDB already connected');
			return;
		}

		try {
			__mongoState.config = config;
			
			// Optimized connection options for free tier
			const clientOptions: MongoClientOptions = {
				maxPoolSize: config.maxPoolSize || 20, // Reduced from default 100
				minPoolSize: config.minPoolSize || 2,  // Keep minimum connections ready
				maxIdleTimeMS: config.maxIdleTimeMS || 60000, // Close idle connections after 60s
				waitQueueTimeoutMS: config.waitQueueTimeoutMS || 5000, // Timeout waiting for connection
				serverSelectionTimeoutMS: config.serverSelectionTimeoutMS || 10000, // Timeout for server selection
			};

			__mongoState.client = new MongoClient(config.uri, clientOptions);
			await __mongoState.client.connect();
			__mongoState.db = __mongoState.client.db(config.database);
			__mongoState.isConnected = true;
			
			console.log(`Connected to MongoDB database: ${config.database}`);
			console.log(`Connection pool: max=${clientOptions.maxPoolSize}, min=${clientOptions.minPoolSize}, maxIdleTime=${clientOptions.maxIdleTimeMS}ms`);
		} catch (error) {
			throw new MongoDBError(`Failed to connect to MongoDB: ${error}`);
		}
	},

	/**
	 * Disconnect from MongoDB.
	 */
	async disconnect(): Promise<void> {
		if (!__mongoState.isConnected || !__mongoState.client) {
			return;
		}

		try {
			await __mongoState.client.close();
			__mongoState.client = null;
			__mongoState.db = null;
			__mongoState.isConnected = false;
			__mongoState.pendingOperations.clear();
			console.log('Disconnected from MongoDB');
		} catch (error) {
			throw new MongoDBError(`Failed to disconnect from MongoDB: ${error}`);
		}
	},

	/**
	 * Check if connected to MongoDB.
	 */
	isConnected(): boolean {
		return __mongoState.isConnected;
	},

	/**
	 * Get the raw MongoDB database instance.
	 */
	getDatabase(): Db {
		if (!__mongoState.db) {
			throw new MongoDBError('MongoDB not connected');
		}
		return __mongoState.db;
	},

	/**
	 * Get the raw MongoDB client instance.
	 */
	getClient(): MongoClient {
		if (!__mongoState.client) {
			throw new MongoDBError('MongoDB not connected');
		}
		return __mongoState.client;
	},

	/**
	 * Get connection pool statistics.
	 */
	async getConnectionStats(): Promise<any> {
		if (!__mongoState.client) {
			throw new MongoDBError('MongoDB not connected');
		}
		
		try {
			const adminDb = __mongoState.client.db('admin');
			const serverStatus = await adminDb.command({ serverStatus: 1 });
			
			return {
				currentConnections: serverStatus.connections?.current || 0,
				availableConnections: serverStatus.connections?.available || 0,
				totalCreated: serverStatus.connections?.totalCreated || 0,
				poolSize: __mongoState.config?.maxPoolSize || 20,
				minPoolSize: __mongoState.config?.minPoolSize || 2,
			};
		} catch (error) {
			console.error('Error getting connection stats:', error);
			return null;
		}
	},

	/**
	 * Execute operations in a transaction.
	 */
	async transaction<R>(
		callback: (session: any) => Promise<R>
	): Promise<R> {
		if (!__mongoState.client) {
			throw new MongoDBError('MongoDB not connected');
		}

		const session = __mongoState.client.startSession();
		try {
			let result: R;
			await session.withTransaction(async () => {
				result = await callback(session);
			});
			return result!;
		} finally {
			await session.endSession();
		}
	},

	/**
	 * Drop a collection.
	 */
	async dropCollection(collectionName: string): Promise<void> {
		if (!__mongoState.db) {
			throw new MongoDBError('MongoDB not connected');
		}
		if (global.Config?.nodbwriting || __mongoState.config?.nodbwriting) {
			return Promise.resolve();
		}
		await __mongoState.db.dropCollection(collectionName);
	},

	/**
	 * List all collections in the database.
	 */
	async listCollections(): Promise<string[]> {
		if (!__mongoState.db) {
			throw new MongoDBError('MongoDB not connected');
		}
		const collections = await __mongoState.db.listCollections().toArray();
		return collections.map(c => c.name);
	},

	/**
	 * Create a collection with options.
	 */
	async createCollection(name: string, options?: any): Promise<void> {
		if (!__mongoState.db) {
			throw new MongoDBError('MongoDB not connected');
		}
		if (global.Config?.nodbwriting || __mongoState.config?.nodbwriting) {
			return Promise.resolve();
		}
		await __mongoState.db.createCollection(name, options);
	},

	/**
	 * Rename a collection.
	 */
	async renameCollection(oldName: string, newName: string, dropTarget?: boolean): Promise<void> {
		if (!__mongoState.db) {
			throw new MongoDBError('MongoDB not connected');
		}
		if (global.Config?.nodbwriting || __mongoState.config?.nodbwriting) {
			return Promise.resolve();
		}
		const collection = __mongoState.db.collection(oldName);
		await collection.rename(newName, { dropTarget });
	},

	/**
	 * Get database statistics.
	 */
	async stats(): Promise<any> {
		if (!__mongoState.db) {
			throw new MongoDBError('MongoDB not connected');
		}
		return __mongoState.db.stats();
	},

	/**
	 * Run a database command.
	 */
	async runCommand(command: Document): Promise<any> {
		if (!__mongoState.db) {
			throw new MongoDBError('MongoDB not connected');
		}
		return __mongoState.db.command(command);
	},
});