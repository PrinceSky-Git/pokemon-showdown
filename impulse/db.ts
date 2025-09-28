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

interface MetaData {
  [collection: string]: number;
}

export class JsonDB {
  private basePath: string;
  private locks: Map<string, Promise<any>> = new Map();
  private queues: Map<string, PendingOperation[]> = new Map();
  private metaCache: MetaData | null = null;

  constructor(basePath: string = "./db") {
    this.basePath = basePath;
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }

    return new Proxy(this, {
      get: (target, prop: string) => {
        if (prop in target) return (target as any)[prop];
        if (typeof prop === "string") {
          return target._makeCollection<any>(prop);
        }
      },
    });
  }

  private _getFilePath(collection: string): string {
    return path.join(this.basePath, `${collection}.json`);
  }

  private _getMetaFilePath(): string {
    return path.join(this.basePath, '_meta.json');
  }

  private async _loadMeta(): Promise<MetaData> {
    if (this.metaCache) return this.metaCache;
    
    try {
      const raw = await fsp.readFile(this._getMetaFilePath(), "utf-8");
      this.metaCache = JSON.parse(raw);
    } catch {
      this.metaCache = {};
    }
    return this.metaCache!;
  }

  private async _saveMeta(meta: MetaData): Promise<void> {
    this.metaCache = meta;
    const filePath = this._getMetaFilePath();
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    
    try {
      await fsp.writeFile(tempPath, JSON.stringify(meta, null, 2), "utf-8");
      await fsp.rename(tempPath, filePath);
    } catch (error: any) {
      await fsp.unlink(tempPath).catch(() => {});
      throw new Error(`Failed to save metadata: ${error.message}`);
    }
  }

  private async _getNextId(collection: string): Promise<number> {
    const meta = await this._loadMeta();
    const nextId = (meta[collection] || 0) + 1;
    meta[collection] = nextId;
    await this._saveMeta(meta);
    return nextId;
  }

  private async _getNextIds(collection: string, count: number): Promise<number[]> {
    const meta = await this._loadMeta();
    const startId = (meta[collection] || 0) + 1;
    const ids = Array.from({ length: count }, (_, i) => startId + i);
    meta[collection] = startId + count - 1;
    await this._saveMeta(meta);
    return ids;
  }

  private async _ensureCollectionFile(collection: string) {
    const filePath = this._getFilePath(collection);
    try {
      await fsp.access(filePath);
    } catch {
      await fsp.writeFile(filePath, "null", "utf-8");
    }
  }

  private async _load<T>(collection: string): Promise<CollectionData<T>> {
    await this._ensureCollectionFile(collection);
    try {
      const raw = await fsp.readFile(this._getFilePath(collection), "utf-8");
      return raw && raw !== "null" ? JSON.parse(raw) : null;
    } catch (error: any) {
      throw new Error(`Failed to load collection "${collection}": ${error.message}`);
    }
  }
  
  /**
   * Safely writes data to a JSON file by first writing to a temporary file
   * and then renaming it. This prevents data corruption if the process crashes.
   */
  private async _save<T>(collection: string, data: CollectionData<T>) {
    const filePath = this._getFilePath(collection);
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    try {
      await fsp.writeFile(
        tempPath,
        JSON.stringify(data, null, 2),
        "utf-8"
      );
      await fsp.rename(tempPath, filePath);
    } catch (error: any) {
      await fsp.unlink(tempPath).catch(() => {});
      throw new Error(`Failed to save collection "${collection}": ${error.message}`);
    }
  }

  /**
   * Executes an operation with an in-memory lock to prevent concurrent async writes
   * within a single process.
   */
  private async _withLock<T>(collection: string, operation: () => Promise<T>): Promise<T> {
    const lockKey = collection;
    
    // If there's already a lock, queue this operation.
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

    // Create the lock.
    const lockPromise = this._executeLocked(lockKey, operation);
    this.locks.set(lockKey, lockPromise);

    try {
      return await lockPromise;
    } finally {
      // After the operation, process any queued operations for this collection.
      await this._processQueue(lockKey);
    }
  }

  private async _executeLocked<T>(lockKey: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      // Ensure proper error context
      if (!error.message.includes(lockKey)) {
        error.message = `Operation on collection "${lockKey}" failed: ${error.message}`;
      }
      throw error;
    } finally {
      // Always remove the lock when the operation is complete.
      this.locks.delete(lockKey);
    }
  }

  private async _processQueue(lockKey: string): Promise<void> {
    const queue = this.queues.get(lockKey);
    if (!queue || queue.length === 0) {
      // Clean up empty queues to prevent memory leaks
      this.queues.delete(lockKey);
      return;
    }

    // Take the next operation from the queue.
    const next = queue.shift()!;
    
    // Clean up empty queue
    if (queue.length === 0) {
      this.queues.delete(lockKey);
    }

    // Execute the next operation with a new lock.
    const lockPromise = this._executeLocked(lockKey, next.operation);
    this.locks.set(lockKey, lockPromise);

    try {
      const result = await lockPromise;
      next.resolve(result);
    } catch (error) {
      next.reject(error);
    } finally {
      // Continue processing the queue recursively.
      await this._processQueue(lockKey);
    }
  }

  // -------- Global Utility --------
  public async deleteAll(): Promise<boolean> {
    return this._withLock("__global__", async () => {
      try {
        const files = await fsp.readdir(this.basePath);
        const jsonFiles = files.filter(f => f.endsWith(".json"));
        for (const file of jsonFiles) {
          await fsp.unlink(path.join(this.basePath, file)).catch(() => {});
        }
        // Clear meta cache
        this.metaCache = null;
        return true;
      } catch (error: any) {
        throw new Error(`Failed to delete all collections: ${error.message}`);
      }
    });
  }

  // -------- Collection Factory --------
  private _makeCollection<T extends { id?: number }>(name: string) {
    const self = this;

    return {
      // ----- Retrieval (Read Operations - No Locking Needed) -----
      get: async (query?: object | ((item: T) => boolean)): Promise<T[] | object> => {
        try {
          const data = (await self._load<T>(name)) ?? [];
          if (Array.isArray(data)) {
            if (typeof query === "function") return data.filter(query);
            return query ? _.filter(data, query) : data;
          }
          return data;
        } catch (error: any) {
          throw new Error(`Failed to get from collection "${name}": ${error.message}`);
        }
      },

      findOne: async (query: object): Promise<T | null> => {
        const data: any = await this.get(query);
        return Array.isArray(data) && data.length > 0 ? data[0] : null;
      },

      findById: async (id: number): Promise<T | null> => {
        return this.findOne({ id });
      },

      exists: async (query: object): Promise<boolean> => {
        const data: any = await this.get(query);
        return Array.isArray(data) ? data.length > 0 : !!data;
      },

      has: async (idOrKey: number | string): Promise<boolean> => {
        try {
          const data: any = await self._load<T>(name);
          if (!data) return false;
          if (Array.isArray(data) && typeof idOrKey === "number") {
            return _.some(data, { id: idOrKey });
          }
          return _.has(data, idOrKey);
        } catch (error: any) {
          throw new Error(`Failed to check existence in collection "${name}": ${error.message}`);
        }
      },

      count: async (query?: object): Promise<number> => {
        const data: any = await this.get(query);
        return Array.isArray(data) ? data.length : Object.keys(data).length;
      },

      // ----- Modification (Write Operations with Locking) -----
      insert: async (item: T | Record<string, any>, value?: any): Promise<any> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name);

          if (!data) {
            data = (typeof item === "string" && value !== undefined) ? {} : [];
          }

          if (typeof item === "string" && value !== undefined) {
            (data as Record<string, any>)[item] = value;
            await self._save(name, data);
            return { [item]: value };
          }

          if (Array.isArray(data)) {
            const arr = data as T[];
            const newItem = { ...item as T };
            if (newItem.id === undefined) {
              newItem.id = await self._getNextId(name);
            }
            arr.push(newItem);
            await self._save(name, arr);
            return newItem;
          }

          Object.assign(data, item);
          await self._save(name, data);
          return item;
        });
      },

      update: async (idOrKey: number | string, newData: Partial<T> | any): Promise<T | any | null> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name);
          if (!data) return null;

          if (Array.isArray(data)) {
            const arr = data as T[];
            const index = _.findIndex(arr, { id: idOrKey });
            if (index === -1) return null;
            arr[index] = _.merge(arr[index], newData);
            await self._save(name, arr);
            return arr[index];
          } else {
            if (_.has(data, idOrKey)) {
              _.set(data, idOrKey, _.merge(_.get(data, idOrKey), newData));
              await self._save(name, data);
              return _.get(data, idOrKey);
            }
            return null;
          }
        });
      },

      remove: async (idOrKey: number | string): Promise<boolean> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name);
          if (!data) return false;

          if (Array.isArray(data)) {
            const arr = data as T[];
            const originalLength = arr.length;
            const newData = _.reject(arr, { id: idOrKey });
            if (originalLength === newData.length) return false;
            await self._save(name, newData);
            return true;
          } else {
            if (_.has(data, idOrKey)) {
              _.unset(data, idOrKey);
              await self._save(name, data);
              return true;
            }
            return false;
          }
        });
      },

      upsert: async (query: any, newData: Partial<T>): Promise<T | any> => {
        return self._withLock(name, async () => {
          const id = (query as any)?.id;
          const existing = id ? await this.findById(id) : await this.findOne(query);
          const effectiveId = existing ? (existing as any).id : id;

          if (existing) {
             return this.update(effectiveId, newData);
          } else {
             return this.insert(newData as T);
          }
        });
      },

      clear: async (asObject = false): Promise<boolean> => {
        return self._withLock(name, async () => {
          await self._save(name, asObject ? {} : []);
          return true;
        });
      },

      delete: async (): Promise<boolean> => {
        return self._withLock(name, async () => {
          try {
            const filePath = self._getFilePath(name);
            await fsp.unlink(filePath).catch(() => {});
            return true;
          } catch (error: any) {
            throw new Error(`Failed to delete collection "${name}": ${error.message}`);
          }
        });
      },

      // ----- Improved Batch Operations -----
      bulkInsert: async (items: T[] | Record<string, any>[]): Promise<any[]> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name);

          if (!data) {
            const isArrayMode = Array.isArray(items) && items.length > 0 && 
                                typeof items[0] === 'object' && items[0] !== null && 'id' in items[0];
            data = isArrayMode ? [] : {};
          }

          if (Array.isArray(data)) {
            const arr = data as T[];
            const itemsArray = items as T[];
            
            // Get batch of IDs efficiently
            const itemsNeedingIds = itemsArray.filter(item => item.id === undefined);
            const newIds = itemsNeedingIds.length > 0 ? await self._getNextIds(name, itemsNeedingIds.length) : [];
            
            let idIndex = 0;
            const inserted = itemsArray.map(item => {
              const newItem = { ...item };
              if (newItem.id === undefined) {
                newItem.id = newIds[idIndex++];
              }
              return newItem;
            });
            
            arr.push(...inserted);
            await self._save(name, arr);
            return inserted;
          } else {
            const obj = data as Record<string, any>;
            (items as Record<string, any>[]).forEach(item => Object.assign(obj, item));
            await self._save(name, obj);
            return items;
          }
        });
      },

      bulkUpdate: async (updates: Array<{ id: number | string; data: Partial<T> }>): Promise<(T | null)[]> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name);
          if (!data) return updates.map(() => null);

          const results: (T | null)[] = [];

          if (Array.isArray(data)) {
            const arr = data as T[];
            
            // Create lookup map for better performance
            const itemMap = new Map();
            arr.forEach((item, index) => {
              itemMap.set((item as any).id, index);
            });
            
            updates.forEach(({ id, data: updateData }) => {
              const index = itemMap.get(id);
              if (index !== undefined) {
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
          
          await self._save(name, data);
          return results;
        });
      },

      bulkRemove: async (ids: (number | string)[]): Promise<boolean[]> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name);
          if (!data) return ids.map(() => false);
          
          let modified = false;

          if (Array.isArray(data)) {
            const idSet = new Set(ids);
            const originalData = data as T[];
            
            // Track which IDs were actually found
            const foundIds = new Set();
            originalData.forEach(item => {
              if (idSet.has((item as any).id)) {
                foundIds.add((item as any).id);
              }
            });
            
            // Filter out items to remove
            const newData = originalData.filter(item => !idSet.has((item as any).id));
            modified = newData.length !== originalData.length;
            
            if (modified) {
              await self._save(name, newData);
            }
            
            // Return results for each requested ID
            return ids.map(id => foundIds.has(id));
          } else {
            const results: boolean[] = [];
            ids.forEach(id => {
              if (_.has(data, id)) {
                _.unset(data, id);
                results.push(true);
                modified = true;
              } else {
                results.push(false);
              }
            });
            
            if (modified) {
              await self._save(name, data);
            }
            return results;
          }
        });
      },

      bulkUpsert: async (items: Array<{ query: any; data: Partial<T> }>): Promise<T[]> => {
        return self._withLock(name, async () => {
          const results: T[] = [];
          let data = await self._load<T>(name) ?? [];

          // Get IDs needed for new items in batch
          const newItems = items.filter(({ query, data: itemData }) => {
            if (Array.isArray(data)) {
              const id = (query as any)?.id;
              return id ? !_.find(data as T[], { id }) : !_.find(data as T[], query);
            }
            return false;
          });
          
          const newIds = newItems.length > 0 ? await self._getNextIds(name, newItems.length) : [];
          let idIndex = 0;

          for (const { query, data: itemData } of items) {
            if (Array.isArray(data)) {
              const arr = data as T[];
              const id = (query as any)?.id;
              const existing = id ? _.find(arr, { id }) : _.find(arr, query);

              if (existing) {
                Object.assign(existing, _.merge({}, existing, itemData));
                results.push(existing);
              } else {
                const newItem = { ...itemData } as T;
                if (newItem.id === undefined) {
                  newItem.id = newIds[idIndex++];
                }
                arr.push(newItem);
                results.push(newItem);
              }
            } else {
              // Upsert doesn't make logical sense for key-value objects, so we just merge.
              Object.assign(data, itemData);
              results.push(itemData as T);
            }
          }
          
          await self._save(name, data);
          return results;
        });
      },

      // ----- Utilities (Read Operations - No Locking Needed) -----
      keys: async (): Promise<(string | number)[]> => {
        try {
          const data = await self._load<T>(name);
          if (Array.isArray(data)) {
            return data.map((r: any) => r.id);
          }
          return Object.keys(data ?? {});
        } catch (error: any) {
          throw new Error(`Failed to get keys from collection "${name}": ${error.message}`);
        }
      },

      values: async (): Promise<T[] | any> => {
        try {
          return (await self._load<T>(name)) ?? [];
        } catch (error: any) {
          throw new Error(`Failed to get values from collection "${name}": ${error.message}`);
        }
      },

      first: async (): Promise<T | null> => {
        try {
          const data = await self._load<T>(name);
          return Array.isArray(data) && data.length ? data[0] : null;
        } catch (error: any) {
          throw new Error(`Failed to get first item from collection "${name}": ${error.message}`);
        }
      },

		 last: async (): Promise<T | null> => {
        try {
          const data = await self._load<T>(name);
          return Array.isArray(data) && data.length ? data[data.length - 1] : null;
        } catch (error: any) {
          throw new Error(`Failed to get last item from collection "${name}": ${error.message}`);
        }
      },

      // ----- Deep path helpers (Write Operations with Locking) -----
      getIn: async (pathStr: string, defaultValue?: any): Promise<any> => {
        try {
          const data = await self._load<T>(name);
          return _.get(data, pathStr, defaultValue);
        } catch (error: any) {
          throw new Error(`Failed to get path "${pathStr}" from collection "${name}": ${error.message}`);
        }
      },

      setIn: async (pathStr: string, value: any): Promise<boolean> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name) ?? {};
          _.set(data, pathStr, value);
          await self._save(name, data);
          return true;
        });
      },

      mergeIn: async (pathStr: string, value: any): Promise<boolean> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name) ?? {};
          const current = _.get(data, pathStr, {});
          _.set(data, pathStr, _.merge(current, value));
          await self._save(name, data);
          return true;
        });
      },

		 pushIn: async (pathStr: string, value: any): Promise<boolean> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name) ?? {};
          const arr = _.get(data, pathStr, []);
          if (!Array.isArray(arr)) throw new Error(`Path "${pathStr}" in collection "${name}" is not an array.`);
          arr.push(value);
          _.set(data, pathStr, arr);
          await self._save(name, data);
          return true;
        });
      },

      pullIn: async (pathStr: string, predicate: any): Promise<any[]> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name) ?? {};
          const arr = _.get(data, pathStr, []);
          if (!Array.isArray(arr)) throw new Error(`Path "${pathStr}" in collection "${name}" is not an array.`);
          const removed = _.remove(arr, (val: any) => {
            return typeof predicate === "function" ? predicate(val) : _.isMatch(val, predicate);
          });
          _.set(data, pathStr, arr);
          await self._save(name, data);
          return removed;
        });
      },

      deleteIn: async (pathStr: string): Promise<boolean> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name);
          if (!data) return false;
          if (_.unset(data, pathStr)) {
            await self._save(name, data);
            return true;
          }
          return false;
        });
      },

      updateIn: async (pathStr: string, updater: (value: any) => any): Promise<any> => {
        return self._withLock(name, async () => {
          let data = await self._load<T>(name) ?? {};
          const current = _.get(data, pathStr);
          const updated = updater(current);
          _.set(data, pathStr, updated);
          await self._save(name, data);
          return updated;
        });
      },
    };
  }
}
