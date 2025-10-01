/*
* PokemonShowdown JasonDB
* Proxy DB built around fs and lodash with concurrent write safety
* @author ClarkJ338
* @license MIT
*/

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import _ from "lodash";

type CollectionData<T> = T[] | Record<string, any>;

interface PendingOperation {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  operation: () => Promise<any>;
}

export class JsonDB {
  private basePath: string;
  private locks: Map<string, Promise<any>> = new Map();
  private queues: Map<string, PendingOperation[]> = new Map();
  private cache: Map<string, CollectionData<any>> = new Map();
  private cacheLoaded: Set<string> = new Set();
  public cached: any;

  constructor(basePath: string = "./db") {
    this.basePath = basePath;
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }

    const proxy = new Proxy(this, {
      get: (target, prop: string) => {
        if (prop in target) return (target as any)[prop];
        if (typeof prop === "string") {
          return target._makeCollection<any>(prop, false);
        }
      },
    });

    // Create cached proxy
    this.cached = new Proxy({} as any, {
      get: (_, prop: string) => {
        if (typeof prop === "string") {
          return proxy._makeCollection<any>(prop, true);
        }
      },
    });

    return proxy;
  }

  private _getFilePath(collection: string): string {
    return path.join(this.basePath, `${collection}.json`);
  }

  private async _ensureCollectionFile(collection: string) {
    const filePath = this._getFilePath(collection);
    try {
      await fsp.access(filePath);
    } catch {
      await fsp.writeFile(filePath, "null", "utf-8");
    }
  }

  private _ensureCollectionFileSync(collection: string) {
    const filePath = this._getFilePath(collection);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "null", "utf-8");
    }
  }

  /**
   * Ensures cache is loaded for a collection (only loads once)
   */
  private async _ensureCacheLoaded<T>(collection: string): Promise<void> {
    if (this.cacheLoaded.has(collection)) {
      return; // Already loaded
    }

    // Load from disk into cache
    await this._ensureCollectionFile(collection);
    const raw = await fsp.readFile(this._getFilePath(collection), "utf-8");
    const data = raw && raw !== "null" ? JSON.parse(raw) : null;
    this.cache.set(collection, data);
    this.cacheLoaded.add(collection);
  }

  /**
   * Ensures cache is loaded synchronously for a collection (only loads once)
   */
  private _ensureCacheLoadedSync<T>(collection: string): void {
    if (this.cacheLoaded.has(collection)) {
      return; // Already loaded
    }

    // Load from disk into cache
    this._ensureCollectionFileSync(collection);
    const raw = fs.readFileSync(this._getFilePath(collection), "utf-8");
    const data = raw && raw !== "null" ? JSON.parse(raw) : null;
    this.cache.set(collection, data);
    this.cacheLoaded.add(collection);
  }

  private async _load<T>(collection: string, useCache: boolean = false): Promise<CollectionData<T>> {
    if (useCache) {
      await this._ensureCacheLoaded<T>(collection);
      return this.cache.get(collection)!;
    }

    await this._ensureCollectionFile(collection);
    const raw = await fsp.readFile(this._getFilePath(collection), "utf-8");
    return raw && raw !== "null" ? JSON.parse(raw) : null;
  }

  private _loadSync<T>(collection: string, useCache: boolean = false): CollectionData<T> {
    if (useCache) {
      this._ensureCacheLoadedSync<T>(collection);
      return this.cache.get(collection)!;
    }

    this._ensureCollectionFileSync(collection);
    const raw = fs.readFileSync(this._getFilePath(collection), "utf-8");
    return raw && raw !== "null" ? JSON.parse(raw) : null;
  }

  private async _save<T>(collection: string, data: CollectionData<T>, useCache: boolean = false) {
    await fsp.writeFile(
      this._getFilePath(collection),
      JSON.stringify(data, null, 2),
      "utf-8"
    );

    if (useCache) {
      this.cache.set(collection, data);
    }
  }

  private _saveSync<T>(collection: string, data: CollectionData<T>, useCache: boolean = false) {
    fs.writeFileSync(
      this._getFilePath(collection),
      JSON.stringify(data, null, 2),
      "utf-8"
    );

    if (useCache) {
      this.cache.set(collection, data);
    }
  }

  /**
   * Executes an operation with file locking to prevent concurrent writes
   */
  private async _withLock<T>(collection: string, operation: () => Promise<T>): Promise<T> {
    const lockKey = collection;
    
    // If there's already a lock, queue this operation
    if (this.locks.has(lockKey)) {
      return new Promise<T>((resolve, reject) => {
        if (!this.queues.has(lockKey)) {
          this.queues.set(lockKey, []);
        }
        this.queues.get(lockKey)!.push({
          resolve,
          reject,
          operation: operation as () => Promise<any>
        });
      });
    }

    // Create the lock
    const lockPromise = this._executeLocked(lockKey, operation);
    this.locks.set(lockKey, lockPromise);

    try {
      const result = await lockPromise;
      return result;
    } finally {
      // Process queued operations
      await this._processQueue(lockKey);
    }
  }

  private async _executeLocked<T>(lockKey: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      // Always remove the lock when done
      this.locks.delete(lockKey);
    }
  }

  private async _processQueue(lockKey: string): Promise<void> {
    const queue = this.queues.get(lockKey);
    if (!queue || queue.length === 0) {
      return;
    }

    // Take the next operation from the queue
    const next = queue.shift()!;
    
    // If queue is empty, remove it
    if (queue.length === 0) {
      this.queues.delete(lockKey);
    }

    // Execute the next operation with a new lock
    const lockPromise = this._executeLocked(lockKey, next.operation);
    this.locks.set(lockKey, lockPromise);

    try {
      const result = await lockPromise;
      next.resolve(result);
    } catch (error) {
      next.reject(error);
    } finally {
      // Continue processing the queue
      await this._processQueue(lockKey);
    }
  }

  // -------- Cache Management --------
  /**
   * Manually invalidate cache for a specific collection
   */
  public invalidateCache(collection: string): void {
    this.cache.delete(collection);
    this.cacheLoaded.delete(collection);
  }

  /**
   * Clear all caches
   */
  public clearAllCaches(): void {
    this.cache.clear();
    this.cacheLoaded.clear();
  }

  /**
   * Check if a collection is cached
   */
  public isCached(collection: string): boolean {
    return this.cacheLoaded.has(collection);
  }

  // -------- Global Utility --------
  public async deleteAll(): Promise<boolean> {
    // Lock all collections by using a special global lock
    return this._withLock("__global__", async () => {
      const files = await fsp.readdir(this.basePath);
      const jsonFiles = files.filter(f => f.endsWith(".json"));
      for (const file of jsonFiles) {
        await fsp.unlink(path.join(this.basePath, file)).catch(() => {});
      }
      this.clearAllCaches();
      return true;
    });
  }

  public deleteAllSync(): boolean {
    const files = fs.readdirSync(this.basePath);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    for (const file of jsonFiles) {
      try {
        fs.unlinkSync(path.join(this.basePath, file));
      } catch {}
    }
    this.clearAllCaches();
    return true;
  }

  // -------- Collection Factory --------
  private _makeCollection<T extends { id?: number }>(name: string, useCache: boolean = false) {
    const self = this;

    return {
      // ----- Retrieval (Read Operations - No Locking Needed) -----
      get: async (query?: object | ((item: T) => boolean)): Promise<T[] | object> => {
        const data = (await self._load<T>(name, useCache)) ?? [];
        if (Array.isArray(data)) {
          if (typeof query === "function") return data.filter(query);
          return query ? _.filter(data, query) : data;
        }
        return data;
      },

      getSync: (query?: object | ((item: T) => boolean)): T[] | object => {
        const data = self._loadSync<T>(name, useCache) ?? [];
        if (Array.isArray(data)) {
          if (typeof query === "function") return data.filter(query);
          return query ? _.filter(data, query) : data;
        }
        return data;
      },

      findOne: async (query: object): Promise<T | null> => {
        const data: any = await this.get(query);
        return Array.isArray(data) && data.length ? data[0] : null;
      },

      findOneSync: (query: object): T | null => {
        const data: any = this.getSync(query);
        return Array.isArray(data) && data.length ? data[0] : null;
      },

      findById: async (id: number): Promise<T | null> => {
        return await this.findOne({ id });
      },

      findByIdSync: (id: number): T | null => {
        return this.findOneSync({ id });
      },

      exists: async (query: object): Promise<boolean> => {
        const data: any = await this.get(query);
        return Array.isArray(data) ? data.length > 0 : !!data;
      },

      existsSync: (query: object): boolean => {
        const data: any = this.getSync(query);
        return Array.isArray(data) ? data.length > 0 : !!data;
      },

      has: async (idOrKey: number | string): Promise<boolean> => {
        const data: any = await self._load<T>(name, useCache);
        if (!data) return false;

        if (Array.isArray(data) && typeof idOrKey === "number") {
          return _.some(data, { id: idOrKey });
        }
        return _.has(data, idOrKey);
      },

      hasSync: (idOrKey: number | string): boolean => {
        const data: any = self._loadSync<T>(name, useCache);
        if (!data) return false;

        if (Array.isArray(data) && typeof idOrKey === "number") {
          return _.some(data, { id: idOrKey });
        }
        return _.has(data, idOrKey);
      },

      count: async (query?: object): Promise<number> => {
        const data: any = await this.get(query);
        return Array.isArray(data) ? data.length : Object.keys(data).length;
      },

      countSync: (query?: object): number => {
        const data: any = this.getSync(query);
        return Array.isArray(data) ? data.length : Object.keys(data).length;
      },

      // ----- Modification (Write Operations with Locking) -----
      insert: async (item: T | Record<string, any>, value?: any): Promise<any> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);

          if (!data) {
            if (typeof item === "string" && value !== undefined) {
              data = {}; // key-value mode
            } else {
              data = []; // array mode
            }
          }

          if (typeof item === "string" && value !== undefined) {
            (data as Record<string, any>)[item] = value;
            await self._save(name, data, useCache);
            return { [item]: value };
          }

          if (Array.isArray(data)) {
            const arr = data as T[];
            const newItem = item as T;
            if (!newItem.id) {
              newItem.id = arr.length ? (_.maxBy(arr, "id")?.id || 0) + 1 : 1;
            }
            arr.push(newItem);
            await self._save(name, arr, useCache);
            return newItem;
          }

          Object.assign(data, item);
          await self._save(name, data, useCache);
          return item;
        });
      },

      insertSync: (item: T | Record<string, any>, value?: any): any => {
        let data = self._loadSync<T>(name, useCache);

        if (!data) {
          if (typeof item === "string" && value !== undefined) {
            data = {}; // key-value mode
          } else {
            data = []; // array mode
          }
        }

        if (typeof item === "string" && value !== undefined) {
          (data as Record<string, any>)[item] = value;
          self._saveSync(name, data, useCache);
          return { [item]: value };
        }

        if (Array.isArray(data)) {
          const arr = data as T[];
          const newItem = item as T;
          if (!newItem.id) {
            newItem.id = arr.length ? (_.maxBy(arr, "id")?.id || 0) + 1 : 1;
          }
          arr.push(newItem);
          self._saveSync(name, arr, useCache);
          return newItem;
        }

        Object.assign(data, item);
        self._saveSync(name, data, useCache);
        return item;
      },

      update: async (idOrKey: number | string, newData: Partial<T> | any): Promise<T | any | null> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);
          if (!data) return null;

          if (Array.isArray(data)) {
            const arr = data as T[];
            const index = _.findIndex(arr, { id: idOrKey });
            if (index === -1) return null;
            arr[index] = _.merge(arr[index], newData);
            await self._save(name, arr, useCache);
            return arr[index];
          } else {
            if (_.has(data, idOrKey)) {
              _.set(data, idOrKey, _.merge(_.get(data, idOrKey), newData));
              await self._save(name, data, useCache);
              return _.get(data, idOrKey);
            }
            return null;
          }
        });
      },

      updateSync: (idOrKey: number | string, newData: Partial<T> | any): T | any | null => {
        let data = self._loadSync<T>(name, useCache);
        if (!data) return null;

        if (Array.isArray(data)) {
          const arr = data as T[];
          const index = _.findIndex(arr, { id: idOrKey });
          if (index === -1) return null;
          arr[index] = _.merge(arr[index], newData);
          self._saveSync(name, arr, useCache);
          return arr[index];
        } else {
          if (_.has(data, idOrKey)) {
            _.set(data, idOrKey, _.merge(_.get(data, idOrKey), newData));
            self._saveSync(name, data, useCache);
            return _.get(data, idOrKey);
          }
          return null;
        }
      },

      remove: async (idOrKey: number | string): Promise<boolean> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);
          if (!data) return false;

          if (Array.isArray(data)) {
            const arr = data as T[];
            const newData = _.reject(arr, { id: idOrKey });
            await self._save(name, newData, useCache);
            return arr.length !== newData.length;
          } else {
            if (_.has(data, idOrKey)) {
              _.unset(data, idOrKey);
              await self._save(name, data, useCache);
              return true;
            }
            return false;
          }
        });
      },

      removeSync: (idOrKey: number | string): boolean => {
        let data = self._loadSync<T>(name, useCache);
        if (!data) return false;

        if (Array.isArray(data)) {
          const arr = data as T[];
          const newData = _.reject(arr, { id: idOrKey });
          self._saveSync(name, newData, useCache);
          return arr.length !== newData.length;
        } else {
          if (_.has(data, idOrKey)) {
            _.unset(data, idOrKey);
            self._saveSync(name, data, useCache);
            return true;
          }
          return false;
        }
      },

      upsert: async (query: any, newData: Partial<T>): Promise<T | any> => {
        return self._withLock(name, async () => {
          if (_.isPlainObject(query) && (query as any).id) {
            const existing = await this.findById((query as any).id);
            return existing
              ? await this.update((query as any).id, newData)
              : await this.insert(newData as T);
          }
          const existing = await this.findOne(query);
          return existing
            ? await this.update((existing as any).id, newData)
            : await this.insert(newData as T);
        });
      },

      upsertSync: (query: any, newData: Partial<T>): T | any => {
        if (_.isPlainObject(query) && (query as any).id) {
          const existing = this.findByIdSync((query as any).id);
          return existing
            ? this.updateSync((query as any).id, newData)
            : this.insertSync(newData as T);
        }
        const existing = this.findOneSync(query);
        return existing
          ? this.updateSync((existing as any).id, newData)
          : this.insertSync(newData as T);
      },

      clear: async (asObject = false): Promise<boolean> => {
        return self._withLock(name, async () => {
          await self._save(name, asObject ? {} : [], useCache);
          return true;
        });
      },

      clearSync: (asObject = false): boolean => {
        self._saveSync(name, asObject ? {} : [], useCache);
        return true;
      },

      delete: async (): Promise<boolean> => {
        return self._withLock(name, async () => {
          const filePath = path.join(self.basePath, `${name}.json`);
          await fsp.unlink(filePath).catch(() => {});
          if (useCache) {
            self.invalidateCache(name);
          }
          return true;
        });
      },

      deleteSync: (): boolean => {
        const filePath = path.join(self.basePath, `${name}.json`);
        try {
          fs.unlinkSync(filePath);
        } catch {}
        if (useCache) {
          self.invalidateCache(name);
        }
        return true;
      },

      // ----- Batch Operations (Write with Locking) -----
      bulkInsert: async (items: T[] | Record<string, any>[]): Promise<any[]> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);

          if (!data) {
            data = Array.isArray(items) && typeof items[0] === "object" && "id" in items[0] ? [] : {};
          }

          if (Array.isArray(data)) {
            const arr = data as T[];
            let nextId = arr.length ? (_.maxBy(arr, "id")?.id || 0) + 1 : 1;
            const inserted = (items as T[]).map(item => {
              if (!item.id) (item as any).id = nextId++;
              arr.push(item);
              return item;
            });
            await self._save(name, arr, useCache);
            return inserted;
          } else {
            const obj = data as Record<string, any>;
            (items as Record<string, any>[]).forEach(item => Object.assign(obj, item));
            await self._save(name, obj, useCache);
            return items;
          }
        });
      },

      bulkInsertSync: (items: T[] | Record<string, any>[]): any[] => {
        let data = self._loadSync<T>(name, useCache);

        if (!data) {
          data = Array.isArray(items) && typeof items[0] === "object" && "id" in items[0] ? [] : {};
        }

        if (Array.isArray(data)) {
          const arr = data as T[];
          let nextId = arr.length ? (_.maxBy(arr, "id")?.id || 0) + 1 : 1;
          const inserted = (items as T[]).map(item => {
            if (!item.id) (item as any).id = nextId++;
            arr.push(item);
            return item;
          });
          self._saveSync(name, arr, useCache);
          return inserted;
        } else {
          const obj = data as Record<string, any>;
          (items as Record<string, any>[]).forEach(item => Object.assign(obj, item));
          self._saveSync(name, obj, useCache);
          return items;
        }
      },

      // Bulk update multiple records by ID
      bulkUpdate: async (updates: Array<{ id: number | string; data: Partial<T> }>): Promise<(T | null)[]> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);
          if (!data) return updates.map(() => null);

          const results: (T | null)[] = [];

          if (Array.isArray(data)) {
            const arr = data as T[];
            updates.forEach(({ id, data: updateData }) => {
              const index = _.findIndex(arr, { id });
              if (index !== -1) {
                arr[index] = _.merge(arr[index], updateData);
                results.push(arr[index]);
              } else {
                results.push(null);
              }
            });
          } else {
            const obj = data as Record<string, any>;
            updates.forEach(({ id, data: updateData }) => {
              if (_.has(obj, id)) {
                _.set(obj, id, _.merge(_.get(obj, id), updateData));
                results.push(_.get(obj, id));
              } else {
                results.push(null);
              }
            });
          }

          await self._save(name, data, useCache);
          return results;
        });
      },

      bulkUpdateSync: (updates: Array<{ id: number | string; data: Partial<T> }>): (T | null)[] => {
        let data = self._loadSync<T>(name, useCache);
        if (!data) return updates.map(() => null);

        const results: (T | null)[] = [];

        if (Array.isArray(data)) {
          const arr = data as T[];
          updates.forEach(({ id, data: updateData }) => {
            const index = _.findIndex(arr, { id });
            if (index !== -1) {
              arr[index] = _.merge(arr[index], updateData);
              results.push(arr[index]);
            } else {
              results.push(null);
            }
          });
        } else {
          const obj = data as Record<string, any>;
          updates.forEach(({ id, data: updateData }) => {
            if (_.has(obj, id)) {
              _.set(obj, id, _.merge(_.get(obj, id), updateData));
              results.push(_.get(obj, id));
            } else {
              results.push(null);
            }
          });
        }

        self._saveSync(name, data, useCache);
        return results;
      },

      // Bulk remove multiple records by ID
      bulkRemove: async (ids: (number | string)[]): Promise<boolean[]> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);
          if (!data) return ids.map(() => false);

          const results: boolean[] = [];

          if (Array.isArray(data)) {
            const arr = data as T[];
            const originalLength = arr.length;
            ids.forEach(id => {
              const initialLength = arr.length;
              _.remove(arr, { id } as any);
              results.push(arr.length < initialLength);
            });
          } else {
            const obj = data as Record<string, any>;
            ids.forEach(id => {
              if (_.has(obj, id)) {
                _.unset(obj, id);
                results.push(true);
              } else {
                results.push(false);
              }
            });
          }

          await self._save(name, data, useCache);
          return results;
        });
      },

      bulkRemoveSync: (ids: (number | string)[]): boolean[] => {
        let data = self._loadSync<T>(name, useCache);
        if (!data) return ids.map(() => false);

        const results: boolean[] = [];

        if (Array.isArray(data)) {
          const arr = data as T[];
          ids.forEach(id => {
            const initialLength = arr.length;
            _.remove(arr, { id } as any);
            results.push(arr.length < initialLength);
          });
        } else {
          const obj = data as Record<string, any>;
          ids.forEach(id => {
            if (_.has(obj, id)) {
              _.unset(obj, id);
              results.push(true);
            } else {
              results.push(false);
            }
          });
        }

        self._saveSync(name, data, useCache);
        return results;
      },

      // Bulk upsert - insert if not exists, update if exists
      bulkUpsert: async (items: Array<{ query: any; data: Partial<T> }>): Promise<T[]> => {
        return self._withLock(name, async () => {
          const results: T[] = [];
          let data = await self._load<T>(name, useCache);
          
          if (!data) {
            data = [];
          }

          for (const { query, data: itemData } of items) {
            if (Array.isArray(data)) {
              const arr = data as T[];
              let existing: T | undefined;
              
              if (_.isPlainObject(query) && (query as any).id) {
                existing = _.find(arr, { id: (query as any).id });
              } else {
                existing = _.find(arr, query);
              }

              if (existing) {
                // Update existing
                const index = arr.indexOf(existing);
                arr[index] = _.merge(arr[index], itemData);
                results.push(arr[index]);
              } else {
                // Insert new
                const newItem = itemData as T;
                if (!newItem.id) {
                  newItem.id = arr.length ? (_.maxBy(arr, "id")?.id || 0) + 1 : 1;
                }
                arr.push(newItem);
                results.push(newItem);
              }
            } else {
              // For object collections, merge the data
              Object.assign(data, itemData);
              results.push(itemData as T);
            }
          }

          await self._save(name, data, useCache);
          return results;
        });
      },

      bulkUpsertSync: (items: Array<{ query: any; data: Partial<T> }>): T[] => {
        const results: T[] = [];
        let data = self._loadSync<T>(name, useCache);
        
        if (!data) {
          data = [];
        }

        for (const { query, data: itemData } of items) {
          if (Array.isArray(data)) {
            const arr = data as T[];
            let existing: T | undefined;
            
            if (_.isPlainObject(query) && (query as any).id) {
              existing = _.find(arr, { id: (query as any).id });
            } else {
              existing = _.find(arr, query);
            }

            if (existing) {
              // Update existing
              const index = arr.indexOf(existing);
              arr[index] = _.merge(arr[index], itemData);
              results.push(arr[index]);
            } else {
              // Insert new
              const newItem = itemData as T;
              if (!newItem.id) {
                newItem.id = arr.length ? (_.maxBy(arr, "id")?.id || 0) + 1 : 1;
              }
              arr.push(newItem);
              results.push(newItem);
            }
          } else {
            // For object collections, merge the data
            Object.assign(data, itemData);
            results.push(itemData as T);
          }
        }

        self._saveSync(name, data, useCache);
        return results;
      },

      // ----- Utilities (Read Operations - No Locking Needed) -----
      keys: async (): Promise<(string | number)[]> => {
        const data = await self._load<T>(name, useCache);
        return Array.isArray(data) ? data.map((r: any) => r.id) : Object.keys(data ?? {});
      },

      keysSync: (): (string | number)[] => {
        const data = self._loadSync<T>(name, useCache);
        return Array.isArray(data) ? data.map((r: any) => r.id) : Object.keys(data ?? {});
      },

      values: async (): Promise<T[] | any> => {
        return (await self._load<T>(name, useCache)) ?? [];
      },

      valuesSync: (): T[] | any => {
        return self._loadSync<T>(name, useCache) ?? [];
      },

      first: async (): Promise<T | null> => {
        const data = await self._load<T>(name, useCache);
        return Array.isArray(data) && data.length ? data[0] : null;
      },

      firstSync: (): T | null => {
        const data = self._loadSync<T>(name, useCache);
        return Array.isArray(data) && data.length ? data[0] : null;
      },

      last: async (): Promise<T | null> => {
        const data = await self._load<T>(name, useCache);
        return Array.isArray(data) && data.length ? data[data.length - 1] : null;
      },

      lastSync: (): T | null => {
        const data = self._loadSync<T>(name, useCache);
        return Array.isArray(data) && data.length ? data[data.length - 1] : null;
      },

      // ----- Deep path helpers (Write Operations with Locking) -----
      getIn: async (pathStr: string, defaultValue?: any): Promise<any> => {
        const data = await self._load<T>(name, useCache);
        return _.get(data, pathStr, defaultValue);
      },

      getInSync: (pathStr: string, defaultValue?: any): any => {
        const data = self._loadSync<T>(name, useCache);
        return _.get(data, pathStr, defaultValue);
      },

      setIn: async (pathStr: string, value: any): Promise<boolean> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);
          if (!data) data = {};
          _.set(data, pathStr, value);
          await self._save(name, data, useCache);
          return true;
        });
      },

      setInSync: (pathStr: string, value: any): boolean => {
        let data = self._loadSync<T>(name, useCache);
        if (!data) data = {};
        _.set(data, pathStr, value);
        self._saveSync(name, data, useCache);
        return true;
      },

      mergeIn: async (pathStr: string, value: any): Promise<boolean> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);
          if (!data) data = {};
          const current = _.get(data, pathStr, {});
          _.set(data, pathStr, _.merge(current, value));
          await self._save(name, data, useCache);
          return true;
        });
      },

      mergeInSync: (pathStr: string, value: any): boolean => {
        let data = self._loadSync<T>(name, useCache);
        if (!data) data = {};
        const current = _.get(data, pathStr, {});
        _.set(data, pathStr, _.merge(current, value));
        self._saveSync(name, data, useCache);
        return true;
      },

      pushIn: async (pathStr: string, value: any): Promise<boolean> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);
          if (!data) data = {};
          const arr = _.get(data, pathStr, []);
          if (!Array.isArray(arr)) throw new Error(`Path ${pathStr} is not an array`);
          arr.push(value);
          _.set(data, pathStr, arr);
          await self._save(name, data, useCache);
          return true;
        });
      },

      pushInSync: (pathStr: string, value: any): boolean => {
        let data = self._loadSync<T>(name, useCache);
        if (!data) data = {};
        const arr = _.get(data, pathStr, []);
        if (!Array.isArray(arr)) throw new Error(`Path ${pathStr} is not an array`);
        arr.push(value);
        _.set(data, pathStr, arr);
        self._saveSync(name, data, useCache);
        return true;
      },

      pullIn: async (pathStr: string, predicate: any): Promise<any[]> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);
          if (!data) data = {};
          const arr = _.get(data, pathStr, []);
          if (!Array.isArray(arr)) throw new Error(`Path ${pathStr} is not an array`);
          const removed: any[] = [];
          _.remove(arr, (val: any) => {
            const match = typeof predicate === "function" ? predicate(val) : _.isMatch(val, predicate);
            if (match) removed.push(val);
            return match;
          });
          _.set(data, pathStr, arr);
          await self._save(name, data, useCache);
          return removed;
        });
      },

      pullInSync: (pathStr: string, predicate: any): any[] => {
        let data = self._loadSync<T>(name, useCache);
        if (!data) data = {};
        const arr = _.get(data, pathStr, []);
        if (!Array.isArray(arr)) throw new Error(`Path ${pathStr} is not an array`);
        const removed: any[] = [];
        _.remove(arr, (val: any) => {
          const match = typeof predicate === "function" ? predicate(val) : _.isMatch(val, predicate);
          if (match) removed.push(val);
          return match;
        });
        _.set(data, pathStr, arr);
        self._saveSync(name, data, useCache);
        return removed;
      },

      deleteIn: async (pathStr: string): Promise<boolean> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);
          if (!data) return false;
          const removed = _.unset(data, pathStr);
          if (removed) {
            await self._save(name, data, useCache);
          }
          return removed;
        });
      },

      deleteInSync: (pathStr: string): boolean => {
        let data = self._loadSync<T>(name, useCache);
        if (!data) return false;
        const removed = _.unset(data, pathStr);
        if (removed) {
          self._saveSync(name, data, useCache);
        }
        return removed;
      },

      updateIn: async (pathStr: string, updater: (value: any) => any): Promise<any> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name, useCache);
          if (!data) data = {};
          const current = _.get(data, pathStr);
          const updated = updater(current);
          _.set(data, pathStr, updated);
          await self._save(name, data, useCache);
          return updated;
        });
      },

      updateInSync: (pathStr: string, updater: (value: any) => any): any => {
        let data = self._loadSync<T>(name, useCache);
        if (!data) data = {};
        const current = _.get(data, pathStr);
        const updated = updater(current);
        _.set(data, pathStr, updated);
        self._saveSync(name, data, useCache);
        return updated;
      },
    };
  }
}