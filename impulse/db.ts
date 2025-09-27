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

  private async _ensureCollectionFile(collection: string) {
    const filePath = this._getFilePath(collection);
    try {
      await fsp.access(filePath);
    } catch {
      // If the file doesn't exist, create it with 'null' content.
      await fsp.writeFile(filePath, "null", "utf-8");
    }
  }

  private async _load<T>(collection: string): Promise<CollectionData<T>> {
    await this._ensureCollectionFile(collection);
    const raw = await fsp.readFile(this._getFilePath(collection), "utf-8");
    return raw && raw !== "null" ? JSON.parse(raw) : null;
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
    } catch (error) {
      // Clean up the temporary file if an error occurs to prevent clutter.
      await fsp.unlink(tempPath).catch(() => {});
      throw error; // Re-throw the error to be handled by the caller.
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
    } finally {
      // Always remove the lock when the operation is complete.
      this.locks.delete(lockKey);
    }
  }

  private async _processQueue(lockKey: string): Promise<void> {
    const queue = this.queues.get(lockKey);
    if (!queue || queue.length === 0) {
      return;
    }

    // Take the next operation from the queue.
    const next = queue.shift()!;
    
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
      const files = await fsp.readdir(this.basePath);
      const jsonFiles = files.filter(f => f.endsWith(".json"));
      for (const file of jsonFiles) {
        await fsp.unlink(path.join(this.basePath, file)).catch(() => {});
      }
      return true;
    });
  }

  // -------- Collection Factory --------
  private _makeCollection<T extends { id?: number }>(name: string) {
    const self = this;

    return {
      // ----- Retrieval (Read Operations - No Locking Needed) -----
      get: async (query?: object | ((item: T) => boolean)): Promise<T[] | object> => {
        const data = (await self._load<T>(name)) ?? [];
        if (Array.isArray(data)) {
          if (typeof query === "function") return data.filter(query);
          return query ? _.filter(data, query) : data;
        }
        return data;
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
        const data: any = await self._load<T>(name);
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
            const newItem = item as T;
            if (newItem.id === undefined) {
              newItem.id = arr.length ? (_.maxBy(arr, "id")?.id || 0) + 1 : 1;
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
          const filePath = self._getFilePath(name);
          await fsp.unlink(filePath).catch(() => {});
          return true;
        });
      },

      // ----- Batch Operations (Write with Locking) -----
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
            let nextId = arr.length ? (_.maxBy(arr, "id")?.id || 0) + 1 : 1;
            const inserted = (items as T[]).map(item => {
              const newItem = { ...item };
              if (newItem.id === undefined) (newItem as any).id = nextId++;
              arr.push(newItem);
              return newItem;
            });
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
            const originalLength = data.length;
            const idSet = new Set(ids);
            const newData = (data as T[]).filter(item => !idSet.has(item.id!));
            modified = newData.length !== originalLength;
            if (modified) await self._save(name, newData);
            // Return a result for each ID that was originally present.
            return ids.map(id => _.some(data as T[], { id }));
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
            if (modified) await self._save(name, data);
            return results;
          }
        });
      },

      bulkUpsert: async (items: Array<{ query: any; data: Partial<T> }>): Promise<T[]> => {
        return self._withLock(name, async () => {
          const results: T[] = [];
          let data = await self._load<T>(name) ?? [];

          for (const { query, data: itemData } of items) {
            if (Array.isArray(data)) {
              const arr = data as T[];
              const id = (query as any)?.id;
              const existing = id ? _.find(arr, { id }) : _.find(arr, query);

              if (existing) {
                Object.assign(existing, _.merge({}, existing, itemData));
                results.push(existing);
              } else {
                const newItem = itemData as T;
                if (newItem.id === undefined) {
                  newItem.id = arr.length ? (_.maxBy(arr, "id")?.id || 0) + 1 : 1;
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
        const data = await self._load<T>(name);
        if (Array.isArray(data)) {
          return data.map((r: any) => r.id);
        }
        return Object.keys(data ?? {});
      },

      values: async (): Promise<T[] | any> => {
        return (await self._load<T>(name)) ?? [];
      },

      first: async (): Promise<T | null> => {
        const data = await self._load<T>(name);
        return Array.isArray(data) && data.length ? data[0] : null;
      },

      last: async (): Promise<T | null> => {
        const data = await self._load<T>(name);
        return Array.isArray(data) && data.length ? data[data.length - 1] : null;
      },

      // ----- Deep path helpers (Write Operations with Locking) -----
      getIn: async (pathStr: string, defaultValue?: any): Promise<any> => {
        const data = await self._load<T>(name);
        return _.get(data, pathStr, defaultValue);
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
          if (!Array.isArray(arr)) throw new Error(`Path ${pathStr} is not an array.`);
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
          if (!Array.isArray(arr)) throw new Error(`Path ${pathStr} is not an array.`);
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
