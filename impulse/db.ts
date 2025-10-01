import * as fs from 'fs';
import * as path from 'path';
import * as _ from 'lodash';

interface CacheOptions {
  maxSize: number;        // Max memory size in bytes (default: 50MB)
  maxEntries: number;     // Max number of cached collections (default: 100)
  ttl?: number;          // Time to live in milliseconds (optional)
  enableStats: boolean;  // Enable access statistics (default: true)
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRatio: number;
  memoryUsage: number;
  totalEntries: number;
  evictions: number;
  accessPatterns: Map<string, number>;
}

interface LazyCacheEntry<T = any> {
  data: T;
  lastAccessed: number;
  accessCount: number;
  size: number;
  createdAt: number;
  expiresAt?: number;
}

class LazyCache {
  private cache = new Map<string, LazyCacheEntry>();
  private options: CacheOptions;
  private stats: CacheStats;
  private totalMemoryUsage = 0;
  private accessOrder: string[] = [];

  constructor(options: Partial<CacheOptions> = {}) {
    this.options = {
      maxSize: 50 * 1024 * 1024, // 50MB
      maxEntries: 100,
      enableStats: true,
      ...options
    };

    this.stats = {
      hits: 0,
      misses: 0,
      hitRatio: 0,
      memoryUsage: 0,
      totalEntries: 0,
      evictions: 0,
      accessPatterns: new Map()
    };
  }

  private calculateSize(data: any): number {
    return JSON.stringify(data).length * 2; // Rough estimate (2 bytes per char)
  }

  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  private evictLRU(): void {
    while (this.accessOrder.length > 0 && 
           (this.totalMemoryUsage > this.options.maxSize || 
            this.cache.size >= this.options.maxEntries)) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey && this.cache.has(oldestKey)) {
        const entry = this.cache.get(oldestKey)!;
        this.totalMemoryUsage -= entry.size;
        this.cache.delete(oldestKey);
        if (this.options.enableStats) {
          this.stats.evictions++;
        }
      }
    }
  }

  private isExpired(entry: LazyCacheEntry): boolean {
    return entry.expiresAt ? Date.now() > entry.expiresAt : false;
  }

  private updateStats(key: string, hit: boolean): void {
    if (!this.options.enableStats) return;

    if (hit) {
      this.stats.hits++;
    } else {
      this.stats.misses++;
    }

    this.stats.hitRatio = this.stats.hits / (this.stats.hits + this.stats.misses);
    this.stats.memoryUsage = this.totalMemoryUsage;
    this.stats.totalEntries = this.cache.size;

    const currentCount = this.stats.accessPatterns.get(key) || 0;
    this.stats.accessPatterns.set(key, currentCount + 1);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      if (entry) {
        this.cache.delete(key);
        this.totalMemoryUsage -= entry.size;
      }
      return false;
    }
    return true;
  }

  get<T = any>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry || this.isExpired(entry)) {
      if (entry) {
        this.cache.delete(key);
        this.totalMemoryUsage -= entry.size;
      }
      this.updateStats(key, false);
      return null;
    }

    // Update access information
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.updateAccessOrder(key);
    this.updateStats(key, true);

    return entry.data;
  }

  set<T = any>(key: string, data: T): void {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      this.totalMemoryUsage -= oldEntry.size;
    }

    const size = this.calculateSize(data);
    const now = Date.now();
    const entry: LazyCacheEntry<T> = {
      data,
      lastAccessed: now,
      accessCount: 1,
      size,
      createdAt: now,
      expiresAt: this.options.ttl ? now + this.options.ttl : undefined
    };

    this.cache.set(key, entry);
    this.totalMemoryUsage += size;
    this.updateAccessOrder(key);

    // Evict if necessary
    this.evictLRU();
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalMemoryUsage -= entry.size;
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      return this.cache.delete(key);
    }
    return false;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.totalMemoryUsage = 0;
    if (this.options.enableStats) {
      this.stats = {
        hits: 0,
        misses: 0,
        hitRatio: 0,
        memoryUsage: 0,
        totalEntries: 0,
        evictions: 0,
        accessPatterns: new Map()
      };
    }
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  getTopAccessed(limit = 10): Array<[string, number]> {
    return Array.from(this.stats.accessPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  warmUp(keys: string[], loadFunction: (key: string) => Promise<any>): Promise<void[]> {
    return Promise.all(keys.map(async (key) => {
      if (!this.has(key)) {
        try {
          const data = await loadFunction(key);
          this.set(key, data);
        } catch (error) {
          console.warn(`Failed to warm cache for key: ${key}`, error);
        }
      }
    }));
  }

  smartWarm(loadFunction: (key: string) => Promise<any>, topN = 10): Promise<void[]> {
    const topKeys = this.getTopAccessed(topN).map(([key]) => key);
    return this.warmUp(topKeys, loadFunction);
  }
}

class JsonDB {
  private dbPath: string;
  private locks = new Map<string, boolean>();
  private queues = new Map<string, Array<() => void>>();
  private lazyCache: LazyCache;
  private _cached: any;
  private lockTimeout = 30000; // 30 seconds timeout for sync locks
  private lockRetryDelay = 10; // 10ms delay between lock attempts

  constructor(dbPath = './database', cacheOptions?: Partial<CacheOptions>) {
    this.dbPath = dbPath;
    this.lazyCache = new LazyCache(cacheOptions);
    
    // Ensure database directory exists
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true });
    }

    // Create lazy cached proxy
    this._cached = new Proxy({}, {
      get: (target, prop: string) => {
        return this.createLazyCachedCollection(prop);
      }
    });
  }

  private getLockFilePath(collectionName: string): string {
    return path.join(this.dbPath, `.${collectionName}.lock`);
  }

  private createSyncLock(collectionName: string): boolean {
    const lockFile = this.getLockFilePath(collectionName);
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.lockTimeout) {
      try {
        // Try to create lock file exclusively
        fs.writeFileSync(lockFile, process.pid.toString(), { flag: 'wx' });
        return true;
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Lock file exists, check if the process is still running
          try {
            const pidStr = fs.readFileSync(lockFile, 'utf8');
            const pid = parseInt(pidStr);
            
            // Check if process is still running
            try {
              process.kill(pid, 0); // Signal 0 to check if process exists
              // Process exists, wait and retry
              this.sleep(this.lockRetryDelay);
              continue;
            } catch {
              // Process doesn't exist, remove stale lock
              fs.unlinkSync(lockFile);
              continue;
            }
          } catch {
            // Can't read lock file, try to remove and continue
            try {
              fs.unlinkSync(lockFile);
            } catch {}
            continue;
          }
        } else {
          // Other error, wait and retry
          this.sleep(this.lockRetryDelay);
        }
      }
    }
    
    throw new Error(`Failed to acquire sync lock for collection: ${collectionName} after ${this.lockTimeout}ms`);
  }

  private releaseSyncLock(collectionName: string): void {
    const lockFile = this.getLockFilePath(collectionName);
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // Ignore errors when releasing lock
    }
  }

  private sleep(ms: number): void {
    const start = Date.now();
    while (Date.now() - start < ms) {
      // Busy wait for very short delays
    }
  }

  private withSyncLock<T>(collectionName: string, operation: () => T): T {
    const lockAcquired = this.createSyncLock(collectionName);
    if (!lockAcquired) {
      throw new Error(`Failed to acquire lock for collection: ${collectionName}`);
    }
    
    try {
      const result = operation();
      
      // Always refresh cache with latest disk data after sync operations
      this.refreshCacheFromDisk(collectionName);
      
      return result;
    } finally {
      this.releaseSyncLock(collectionName);
    }
  }

  private refreshCacheFromDisk(collectionName: string): void {
    try {
      const diskData = this.loadCollectionSync(collectionName);
      this.lazyCache.set(collectionName, diskData);
    } catch (error) {
      // If we can't load from disk, remove from cache to force reload next time
      this.lazyCache.delete(collectionName);
    }
  }

  private createLazyCachedCollection(collectionName: string) {
    const self = this;
    
    return new Proxy({}, {
      get(target, method: string) {
        return function(...args: any[]) {
          // For read operations, check cache first, then load if needed
          if (['get', 'getSync', 'findOne', 'findOneSync', 'findById', 'findByIdSync', 
               'exists', 'existsSync', 'has', 'hasSync', 'count', 'countSync',
               'getIn', 'getInSync', 'keys', 'keysSync', 'values', 'valuesSync',
               'first', 'firstSync', 'last', 'lastSync'].includes(method)) {
            
            let cachedData = self.lazyCache.get(collectionName);
            
            if (!cachedData) {
              // Lazy load the collection
              try {
                cachedData = self.loadCollectionSync(collectionName);
                self.lazyCache.set(collectionName, cachedData);
              } catch (error) {
                cachedData = Array.isArray(self.getCollectionType(collectionName)) ? [] : {};
                self.lazyCache.set(collectionName, cachedData);
              }
            }

            // Create a temporary collection object with cached data
            const tempCollection = {
              [collectionName]: cachedData
            };

            // Execute the method on cached data
            const collection = self.createCollection(tempCollection, collectionName);
            if (typeof collection[method] === 'function') {
              return collection[method](...args);
            }
          } else {
            // For write operations, always ensure we have latest data from disk first
            try {
              const diskData = self.loadCollectionSync(collectionName);
              self.lazyCache.set(collectionName, diskData);
            } catch (error) {
              const emptyData = Array.isArray(self.getCollectionType(collectionName)) ? [] : {};
              self.lazyCache.set(collectionName, emptyData);
            }

            const tempCollection = {
              [collectionName]: self.lazyCache.get(collectionName)
            };

            const collection = self.createCollection(tempCollection, collectionName);
            if (typeof collection[method] === 'function') {
              return collection[method](...args);
            }
          }
          
          throw new Error(`Method ${method} not found`);
        };
      }
    });
  }

  private getCollectionType(collectionName: string): any[] | object {
    const filePath = path.join(this.dbPath, `${collectionName}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return content;
      } catch {
        return [];
      }
    }
    return [];
  }

  private loadCollectionSync(collectionName: string): any {
    const filePath = path.join(this.dbPath, `${collectionName}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return Array.isArray(this.getCollectionType(collectionName)) ? [] : {};
  }

  private async loadCollection(collectionName: string): Promise<any> {
    return new Promise((resolve) => {
      const filePath = path.join(this.dbPath, `${collectionName}.json`);
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          resolve(Array.isArray(this.getCollectionType(collectionName)) ? [] : {});
        } else {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(Array.isArray(this.getCollectionType(collectionName)) ? [] : {});
          }
        }
      });
    });
  }

  private async withLock<T>(collectionName: string, operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        try {
          this.locks.set(collectionName, true);
          
          // Ensure we have latest data from disk before async operations
          const diskData = await this.loadCollection(collectionName);
          this.lazyCache.set(collectionName, diskData);
          
          const result = await operation();
          
          // Refresh cache with latest disk data after async operations
          const updatedDiskData = await this.loadCollection(collectionName);
          this.lazyCache.set(collectionName, updatedDiskData);
          
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.locks.delete(collectionName);
          const queue = this.queues.get(collectionName);
          if (queue && queue.length > 0) {
            const next = queue.shift()!;
            setImmediate(next);
          } else {
            this.queues.delete(collectionName);
          }
        }
      };

      if (this.locks.has(collectionName)) {
        if (!this.queues.has(collectionName)) {
          this.queues.set(collectionName, []);
        }
        this.queues.get(collectionName)!.push(execute);
      } else {
        execute();
      }
    });
  }

  private async saveCollection(collectionName: string, data: any): Promise<void> {
    const filePath = path.join(this.dbPath, `${collectionName}.json`);
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private saveCollectionSync(collectionName: string, data: any): void {
    const filePath = path.join(this.dbPath, `${collectionName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  private createCollection(data: any, collectionName: string) {
    const self = this;
    const collection = data[collectionName] || (Array.isArray(this.getCollectionType(collectionName)) ? [] : {});
    const isArray = Array.isArray(collection);

    return {
      // Read operations (no locking needed for cached access)
      async get(filter?: any): Promise<any[]> {
        const cachedData = self.lazyCache.get(collectionName) || await self.loadCollection(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        
        if (!filter) return isArray ? cachedData : Object.values(cachedData);
        if (isArray) {
          return cachedData.filter((item: any) => self.matchesFilter(item, filter));
        }
        return Object.values(cachedData).filter((item: any) => self.matchesFilter(item, filter));
      },

      getSync(filter?: any): any[] {
        const cachedData = self.lazyCache.get(collectionName) || self.loadCollectionSync(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        
        if (!filter) return isArray ? cachedData : Object.values(cachedData);
        if (isArray) {
          return cachedData.filter((item: any) => self.matchesFilter(item, filter));
        }
        return Object.values(cachedData).filter((item: any) => self.matchesFilter(item, filter));
      },

      async findOne(filter: any): Promise<any> {
        const items = await this.get(filter);
        return items[0] || null;
      },

      findOneSync(filter: any): any {
        const items = this.getSync(filter);
        return items[0] || null;
      },

      async findById(id: any): Promise<any> {
        const cachedData = self.lazyCache.get(collectionName) || await self.loadCollection(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        
        if (isArray) {
          return cachedData.find((item: any) => item.id === id) || null;
        }
        return cachedData[id] || null;
      },

      findByIdSync(id: any): any {
        const cachedData = self.lazyCache.get(collectionName) || self.loadCollectionSync(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        
        if (isArray) {
          return cachedData.find((item: any) => item.id === id) || null;
        }
        return cachedData[id] || null;
      },

      async exists(filter: any): Promise<boolean> {
        const item = await this.findOne(filter);
        return item !== null;
      },

      existsSync(filter: any): boolean {
        const item = this.findOneSync(filter);
        return item !== null;
      },

      async has(key: any): Promise<boolean> {
        const cachedData = self.lazyCache.get(collectionName) || await self.loadCollection(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        
        if (isArray) {
          return cachedData.some((item: any) => item.id === key);
        }
        return key in cachedData;
      },

      hasSync(key: any): boolean {
        const cachedData = self.lazyCache.get(collectionName) || self.loadCollectionSync(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        
        if (isArray) {
          return cachedData.some((item: any) => item.id === key);
        }
        return key in cachedData;
      },

      async count(filter?: any): Promise<number> {
        const items = await this.get(filter);
        return items.length;
      },

      countSync(filter?: any): number {
        const items = this.getSync(filter);
        return items.length;
      },

      // Write operations (with proper locking)
      async insert(data: any): Promise<any> {
        return self.withLock(collectionName, async () => {
          const currentData = await self.loadCollection(collectionName);
          
          if (isArray) {
            const newId = currentData.length > 0 ? Math.max(...currentData.map((item: any) => item.id || 0)) + 1 : 1;
            const newItem = { id: newId, ...data };
            currentData.push(newItem);
            await self.saveCollection(collectionName, currentData);
            return newItem;
          } else {
            const key = data.id || Object.keys(currentData).length + 1;
            currentData[key] = data;
            await self.saveCollection(collectionName, currentData);
            return data;
          }
        });
      },

      insertSync(data: any): any {
        return self.withSyncLock(collectionName, () => {
          const currentData = self.loadCollectionSync(collectionName);
          
          if (isArray) {
            const newId = currentData.length > 0 ? Math.max(...currentData.map((item: any) => item.id || 0)) + 1 : 1;
            const newItem = { id: newId, ...data };
            currentData.push(newItem);
            self.saveCollectionSync(collectionName, currentData);
            return newItem;
          } else {
            const key = data.id || Object.keys(currentData).length + 1;
            currentData[key] = data;
            self.saveCollectionSync(collectionName, currentData);
            return data;
          }
        });
      },

      async update(filter: any, updateData: any): Promise<any[]> {
        return self.withLock(collectionName, async () => {
          const currentData = await self.loadCollection(collectionName);
          const updatedItems: any[] = [];

          if (isArray) {
            for (let i = 0; i < currentData.length; i++) {
              if (self.matchesFilter(currentData[i], filter)) {
                currentData[i] = { ...currentData[i], ...updateData };
                updatedItems.push(currentData[i]);
              }
            }
          } else {
            for (const key in currentData) {
              if (self.matchesFilter(currentData[key], filter)) {
                currentData[key] = { ...currentData[key], ...updateData };
                updatedItems.push(currentData[key]);
              }
            }
          }

          await self.saveCollection(collectionName, currentData);
          return updatedItems;
        });
      },

      updateSync(filter: any, updateData: any): any[] {
        return self.withSyncLock(collectionName, () => {
          const currentData = self.loadCollectionSync(collectionName);
          const updatedItems: any[] = [];

          if (isArray) {
            for (let i = 0; i < currentData.length; i++) {
              if (self.matchesFilter(currentData[i], filter)) {
                currentData[i] = { ...currentData[i], ...updateData };
                updatedItems.push(currentData[i]);
              }
            }
          } else {
            for (const key in currentData) {
              if (self.matchesFilter(currentData[key], filter)) {
                currentData[key] = { ...currentData[key], ...updateData };
                updatedItems.push(currentData[key]);
              }
            }
          }

          self.saveCollectionSync(collectionName, currentData);
          return updatedItems;
        });
      },

      async remove(filter: any): Promise<any[]> {
        return self.withLock(collectionName, async () => {
          const currentData = await self.loadCollection(collectionName);
          const removedItems: any[] = [];

          if (isArray) {
            for (let i = currentData.length - 1; i >= 0; i--) {
              if (self.matchesFilter(currentData[i], filter)) {
                removedItems.push(currentData.splice(i, 1)[0]);
              }
            }
          } else {
            for (const key in currentData) {
              if (self.matchesFilter(currentData[key], filter)) {
                removedItems.push(currentData[key]);
                delete currentData[key];
              }
            }
          }

          await self.saveCollection(collectionName, currentData);
          return removedItems.reverse();
        });
      },

      removeSync(filter: any): any[] {
        return self.withSyncLock(collectionName, () => {
          const currentData = self.loadCollectionSync(collectionName);
          const removedItems: any[] = [];

          if (isArray) {
            for (let i = currentData.length - 1; i >= 0; i--) {
              if (self.matchesFilter(currentData[i], filter)) {
                removedItems.push(currentData.splice(i, 1)[0]);
              }
            }
          } else {
            for (const key in currentData) {
              if (self.matchesFilter(currentData[key], filter)) {
                removedItems.push(currentData[key]);
                delete currentData[key];
              }
            }
          }

          self.saveCollectionSync(collectionName, currentData);
          return removedItems.reverse();
        });
      },

      async upsert(filter: any, data: any): Promise<any> {
        const existing = await this.findOne(filter);
        if (existing) {
          const updated = await this.update(filter, data);
          return updated[0];
        } else {
          return await this.insert(data);
        }
      },

      upsertSync(filter: any, data: any): any {
        const existing = this.findOneSync(filter);
        if (existing) {
          const updated = this.updateSync(filter, data);
          return updated[0];
        } else {
          return this.insertSync(data);
        }
      },

      // Batch operations
      async bulkInsert(items: any[]): Promise<any[]> {
        return self.withLock(collectionName, async () => {
          const results: any[] = [];
          const currentData = await self.loadCollection(collectionName);
          
          let nextId = isArray && currentData.length > 0 ? 
            Math.max(...currentData.map((item: any) => item.id || 0)) + 1 : 1;

          for (const item of items) {
            if (isArray) {
              const newItem = { id: nextId++, ...item };
              currentData.push(newItem);
              results.push(newItem);
            } else {
              const key = item.id || nextId++;
              currentData[key] = item;
              results.push(item);
            }
          }

          await self.saveCollection(collectionName, currentData);
          return results;
        });
      },

      bulkInsertSync(items: any[]): any[] {
        return self.withSyncLock(collectionName, () => {
          const results: any[] = [];
          const currentData = self.loadCollectionSync(collectionName);
          
          let nextId = isArray && currentData.length > 0 ? 
            Math.max(...currentData.map((item: any) => item.id || 0)) + 1 : 1;

          for (const item of items) {
            if (isArray) {
              const newItem = { id: nextId++, ...item };
              currentData.push(newItem);
              results.push(newItem);
            } else {
              const key = item.id || nextId++;
              currentData[key] = item;
              results.push(item);
            }
          }

          self.saveCollectionSync(collectionName, currentData);
          return results;
        });
      },

      async bulkUpdate(filter: any, updateData: any): Promise<any[]> {
        return this.update(filter, updateData);
      },

      bulkUpdateSync(filter: any, updateData: any): any[] {
        return this.updateSync(filter, updateData);
      },

      async bulkRemove(filter: any): Promise<any[]> {
        return this.remove(filter);
      },

      bulkRemoveSync(filter: any): any[] {
        return this.removeSync(filter);
      },

      async bulkUpsert(items: any[]): Promise<any[]> {
        return self.withLock(collectionName, async () => {
          const results: any[] = [];
          for (const item of items) {
            const result = await this.upsert({ id: item.id }, item);
            results.push(result);
          }
          return results;
        });
      },

      bulkUpsertSync(items: any[]): any[] {
        return self.withSyncLock(collectionName, () => {
          const results: any[] = [];
          for (const item of items) {
            const result = this.upsertSync({ id: item.id }, item);
            results.push(result);
          }
          return results;
        });
      },

      // Deep path operations using lodash
      async getIn(path: string): Promise<any> {
        const cachedData = self.lazyCache.get(collectionName) || await self.loadCollection(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        return _.get(cachedData, path);
      },

      getInSync(path: string): any {
        const cachedData = self.lazyCache.get(collectionName) || self.loadCollectionSync(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        return _.get(cachedData, path);
      },

      async setIn(path: string, value: any): Promise<void> {
        return self.withLock(collectionName, async () => {
          const currentData = await self.loadCollection(collectionName);
          _.set(currentData, path, value);
          await self.saveCollection(collectionName, currentData);
        });
      },

      setInSync(path: string, value: any): void {
        self.withSyncLock(collectionName, () => {
          const currentData = self.loadCollectionSync(collectionName);
          _.set(currentData, path, value);
          self.saveCollectionSync(collectionName, currentData);
        });
      },

      async mergeIn(path: string, value: any): Promise<void> {
        return self.withLock(collectionName, async () => {
          const currentData = await self.loadCollection(collectionName);
          const existing = _.get(currentData, path, {});
          _.set(currentData, path, { ...existing, ...value });
          await self.saveCollection(collectionName, currentData);
        });
      },

      mergeInSync(path: string, value: any): void {
        self.withSyncLock(collectionName, () => {
          const currentData = self.loadCollectionSync(collectionName);
          const existing = _.get(currentData, path, {});
          _.set(currentData, path, { ...existing, ...value });
          self.saveCollectionSync(collectionName, currentData);
        });
      },

      async updateIn(path: string, updater: (value: any) => any): Promise<void> {
        return self.withLock(collectionName, async () => {
          const currentData = await self.loadCollection(collectionName);
          const currentValue = _.get(currentData, path);
          const newValue = updater(currentValue);
          _.set(currentData, path, newValue);
          await self.saveCollection(collectionName, currentData);
        });
      },

      updateInSync(path: string, updater: (value: any) => any): void {
        self.withSyncLock(collectionName, () => {
          const currentData = self.loadCollectionSync(collectionName);
          const currentValue = _.get(currentData, path);
          const newValue = updater(currentValue);
          _.set(currentData, path, newValue);
          self.saveCollectionSync(collectionName, currentData);
        });
      },

      async pushIn(path: string, ...values: any[]): Promise<void> {
        return self.withLock(collectionName, async () => {
          const currentData = await self.loadCollection(collectionName);
          const array = _.get(currentData, path, []);
          array.push(...values);
          _.set(currentData, path, array);
          await self.saveCollection(collectionName, currentData);
        });
      },

      pushInSync(path: string, ...values: any[]): void {
        self.withSyncLock(collectionName, () => {
          const currentData = self.loadCollectionSync(collectionName);
          const array = _.get(currentData, path, []);
          array.push(...values);
          _.set(currentData, path, array);
          self.saveCollectionSync(collectionName, currentData);
        });
      },

      async pullIn(path: string, ...values: any[]): Promise<void> {
        return self.withLock(collectionName, async () => {
          const currentData = await self.loadCollection(collectionName);
          const array = _.get(currentData, path, []);
          const newArray = array.filter((item: any) => !values.includes(item));
          _.set(currentData, path, newArray);
          await self.saveCollection(collectionName, currentData);
        });
      },

      pullInSync(path: string, ...values: any[]): void {
        self.withSyncLock(collectionName, () => {
          const currentData = self.loadCollectionSync(collectionName);
          const array = _.get(currentData, path, []);
          const newArray = array.filter((item: any) => !values.includes(item));
          _.set(currentData, path, newArray);
          self.saveCollectionSync(collectionName, currentData);
        });
      },

      // Utility methods
      async clear(): Promise<void> {
        return self.withLock(collectionName, async () => {
          const emptyData = isArray ? [] : {};
          await self.saveCollection(collectionName, emptyData);
        });
      },

      clearSync(): void {
        self.withSyncLock(collectionName, () => {
          const emptyData = isArray ? [] : {};
          self.saveCollectionSync(collectionName, emptyData);
        });
      },

      async delete(): Promise<boolean> {
        return self.withLock(collectionName, async () => {
          const filePath = path.join(self.dbPath, `${collectionName}.json`);
          return new Promise<boolean>((resolve) => {
            fs.unlink(filePath, (err) => {
              if (!err) {
                self.lazyCache.delete(collectionName);
              }
              resolve(!err);
            });
          });
        });
      },

      deleteSync(): boolean {
        return self.withSyncLock(collectionName, () => {
          const filePath = path.join(self.dbPath, `${collectionName}.json`);
          try {
            fs.unlinkSync(filePath);
            self.lazyCache.delete(collectionName);
            return true;
          } catch {
            return false;
          }
        });
      },

      async keys(): Promise<string[]> {
        const cachedData = self.lazyCache.get(collectionName) || await self.loadCollection(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        
        if (isArray) {
          return cachedData.map((_: any, index: number) => index.toString());
        }
        return Object.keys(cachedData);
      },

      keysSync(): string[] {
        const cachedData = self.lazyCache.get(collectionName) || self.loadCollectionSync(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        
        if (isArray) {
          return cachedData.map((_: any, index: number) => index.toString());
        }
        return Object.keys(cachedData);
      },

      async values(): Promise<any[]> {
        const cachedData = self.lazyCache.get(collectionName) || await self.loadCollection(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        
        return isArray ? cachedData : Object.values(cachedData);
      },

      valuesSync(): any[] {
        const cachedData = self.lazyCache.get(collectionName) || self.loadCollectionSync(collectionName);
        self.lazyCache.set(collectionName, cachedData);
        
        return isArray ? cachedData : Object.values(cachedData);
      },

      async first(): Promise<any> {
        const values = await this.values();
        return values[0] || null;
      },

      firstSync(): any {
        const values = this.valuesSync();
        return values[0] || null;
      },

      async last(): Promise<any> {
        const values = await this.values();
        return values[values.length - 1] || null;
      },

      lastSync(): any {
        const values = this.valuesSync();
        return values[values.length - 1] || null;
      }
    };
  }

  private matchesFilter(item: any, filter: any): boolean {
    if (typeof filter === 'function') {
      return filter(item);
    }
    
    for (const key in filter) {
      if (item[key] !== filter[key]) {
        return false;
      }
    }
    return true;
  }

  // Main collection access
  get collections() {
    return new Proxy({}, {
      get: (target, prop: string) => {
        return this.createCollection({ [prop]: this.getCollectionType(prop) }, prop);
      }
    });
  }

  // Lazy cached collection access
  get cached() {
    return this._cached;
  }

  // Cache management methods
  getCacheStats(): CacheStats {
    return this.lazyCache.getStats();
  }

  getTopAccessedCollections(limit = 10): Array<[string, number]> {
    return this.lazyCache.getTopAccessed(limit);
  }

  async warmCache(collections: string[]): Promise<void> {
    await this.lazyCache.warmUp(collections, async (collectionName) => {
      return this.loadCollection(collectionName);
    });
  }

  async smartWarmCache(topN = 10): Promise<void> {
    await this.lazyCache.smartWarm(async (collectionName) => {
      return this.loadCollection(collectionName);
    }, topN);
  }

  clearCache(): void {
    this.lazyCache.clear();
  }

  // Force refresh cache from disk for a specific collection
  refreshCache(collectionName: string): void {
    this.refreshCacheFromDisk(collectionName);
  }

  // Force refresh cache from disk for all cached collections
  refreshAllCaches(): void {
    const stats = this.lazyCache.getStats();
    stats.accessPatterns.forEach((_, collectionName) => {
      this.refreshCacheFromDisk(collectionName);
    });
  }

  // Global database operations
  async deleteAll(): Promise<void> {
    const files = fs.readdirSync(this.dbPath);
    const promises = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        return new Promise<void>((resolve) => {
          fs.unlink(path.join(this.dbPath, file), () => resolve());
        });
      });
    
    await Promise.all(promises);
    this.lazyCache.clear();
  }

  deleteAllSync(): void {
    const files = fs.readdirSync(this.dbPath);
    files
      .filter(file => file.endsWith('.json'))
      .forEach(file => {
        try {
          fs.unlinkSync(path.join(this.dbPath, file));
        } catch {
          // Ignore errors
        }
      });
    
    // Clean up any remaining lock files
    files
      .filter(file => file.endsWith('.lock'))
      .forEach(file => {
        try {
          fs.unlinkSync(path.join(this.dbPath, file));
        } catch {
          // Ignore errors
        }
      });
    
    this.lazyCache.clear();
  }
}

export { JsonDB, LazyCache, CacheOptions, CacheStats };
export default JsonDB;
