# Pokemon Showdown JsonDB API Usage Sheet

## Import Statement
```typescript
// Main import
import { JsonDB } from './impulse/db';

// Import types if needed
import type { CollectionData, PendingOperation } from './impulse/db';
```

## Overview
File-based JSON database with concurrent write safety, built around fs and lodash. Supports both array-based collections and key-value object storage.

## Database Initialization

### Creating Database Instance
```typescript
// Default path (./db)
const db = new JsonDB();

// Custom path
const db = new JsonDB('./my-database');

// Database automatically creates directory if it doesn't exist
```

### Accessing Collections
```typescript
// Collections are accessed as properties via Proxy
const users = db.users;     // Creates/accesses users collection
const posts = db.posts;     // Creates/accesses posts collection
const config = db.config;   // Creates/accesses config collection
```

## Collection Types

JsonDB supports two storage modes automatically determined by first operation:

### Array Mode
Collections storing objects with `id` properties
```typescript
interface User {
  id?: number;
  name: string;
  email: string;
  age: number;
}

const users = db.users;
```

### Object Mode
Collections storing key-value pairs
```typescript
const settings = db.settings;
// Stores as: { "theme": "dark", "language": "en" }
```

## Read Operations
*No locking needed - safe for concurrent reads*

### `get(query?): Promise<T[] | object>`
Retrieve data with optional filtering
```typescript
// Get all items
const allUsers = await db.users.get();

// Filter with lodash query object
const adults = await db.users.get({ age: 25 });
const activeUsers = await db.users.get({ status: 'active' });

// Filter with function predicate
const youngUsers = await db.users.get((user: User) => user.age < 30);

// For object collections
const allSettings = await db.settings.get();
```

### `findOne(query): Promise<T | null>`
Find single item matching query
```typescript
const user = await db.users.findOne({ email: 'john@example.com' });
const admin = await db.users.findOne({ role: 'admin' });
```

### `findById(id): Promise<T | null>`
Find item by ID (array mode only)
```typescript
const user = await db.users.findById(123);
```

### `exists(query): Promise<boolean>`
Check if matching data exists
```typescript
const userExists = await db.users.exists({ email: 'john@example.com' });
const hasAdmins = await db.users.exists({ role: 'admin' });
```

### `has(idOrKey): Promise<boolean>`
Check if ID or key exists
```typescript
// Array mode - check by ID
const hasUser = await db.users.has(123);

// Object mode - check by key
const hasTheme = await db.settings.has('theme');
```

### `count(query?): Promise<number>`
Count items matching query
```typescript
const totalUsers = await db.users.count();
const adultCount = await db.users.count({ age: 25 });
const settingsCount = await db.settings.count();
```

## Write Operations
*Automatically locked for concurrent safety*

### `insert(item, value?): Promise<any>`
Insert new data
```typescript
// Array mode - insert object with auto-generated ID
const newUser = await db.users.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 25
});
// Returns: { id: 1, name: 'John Doe', email: 'john@example.com', age: 25 }

// Array mode - insert with specific ID
const specificUser = await db.users.insert({
  id: 999,
  name: 'Jane Doe',
  email: 'jane@example.com',
  age: 30
});

// Object mode - insert key-value pair
await db.settings.insert('theme', 'dark');
await db.settings.insert('language', 'en');

// Object mode - insert multiple properties
await db.settings.insert({
  theme: 'dark',
  language: 'en',
  notifications: true
});
```

### `update(idOrKey, newData): Promise<T | null>`
Update existing data
```typescript
// Array mode - update by ID
const updated = await db.users.update(123, {
  name: 'John Smith',
  age: 26
});

// Object mode - update by key
const updatedTheme = await db.settings.update('theme', 'light');

// Partial updates (merged with existing data)
const partialUpdate = await db.users.update(123, { age: 27 });
```

### `remove(idOrKey): Promise<boolean>`
Remove data by ID or key
```typescript
// Array mode - remove by ID
const removed = await db.users.remove(123);

// Object mode - remove by key
const removedSetting = await db.settings.remove('theme');
```

### `upsert(query, newData): Promise<T>`
Insert if not exists, update if exists
```typescript
// Update existing or create new
const user = await db.users.upsert(
  { email: 'john@example.com' },
  { name: 'John Doe', age: 25 }
);

// Upsert by ID
const userById = await db.users.upsert(
  { id: 123 },
  { name: 'Updated Name', age: 30 }
);
```

### `clear(asObject?): Promise<boolean>`
Clear all data in collection
```typescript
// Clear to empty array (default)
await db.users.clear();

// Clear to empty object
await db.settings.clear(true);
```

### `delete(): Promise<boolean>`
Delete entire collection file
```typescript
await db.users.delete();  // Removes users.json file
```

## Batch Operations
*All batch operations are locked for safety*

### `bulkInsert(items): Promise<any[]>`
Insert multiple items at once
```typescript
// Array mode
const newUsers = await db.users.bulkInsert([
  { name: 'Alice', email: 'alice@example.com', age: 28 },
  { name: 'Bob', email: 'bob@example.com', age: 32 },
  { name: 'Charlie', email: 'charlie@example.com', age: 24 }
]);

// Object mode
const newSettings = await db.settings.bulkInsert([
  { theme: 'dark' },
  { language: 'es' },
  { notifications: false }
]);
```

### `bulkUpdate(updates): Promise<(T | null)[]>`
Update multiple items
```typescript
const updates = await db.users.bulkUpdate([
  { id: 1, data: { name: 'Alice Updated' } },
  { id: 2, data: { age: 33 } },
  { id: 999, data: { name: 'Non-existent' } }  // Returns null
]);
// Returns array with updated items or null for non-existent
```

### `bulkRemove(ids): Promise<boolean[]>`
Remove multiple items
```typescript
// Array mode
const removed = await db.users.bulkRemove([1, 2, 3, 999]);
// Returns [true, true, true, false] - indicates which were actually removed

// Object mode
const removedSettings = await db.settings.bulkRemove(['theme', 'language', 'nonexistent']);
```

### `bulkUpsert(items): Promise<T[]>`
Upsert multiple items
```typescript
const results = await db.users.bulkUpsert([
  { 
    query: { email: 'john@example.com' },
    data: { name: 'John Updated', age: 26 }
  },
  {
    query: { id: 999 },
    data: { name: 'New User', email: 'new@example.com', age: 22 }
  }
]);
```

## Utility Methods

### `keys(): Promise<(string | number)[]>`
Get all keys/IDs
```typescript
// Array mode - returns all IDs
const userIds = await db.users.keys();  // [1, 2, 3, 4]

// Object mode - returns all keys
const settingKeys = await db.settings.keys();  // ['theme', 'language', 'notifications']
```

### `values(): Promise<T[] | any>`
Get all values
```typescript
const allUsers = await db.users.values();
const allSettings = await db.settings.values();
```

### `first(): Promise<T | null>`
Get first item (array mode only)
```typescript
const firstUser = await db.users.first();
```

### `last(): Promise<T | null>`
Get last item (array mode only)
```typescript
const lastUser = await db.users.last();
```

## Deep Path Operations
*For nested object manipulation*

### `getIn(path, defaultValue?): Promise<any>`
Get value at nested path
```typescript
// Get nested property
const userName = await db.users.getIn('0.name');
const userAge = await db.users.getIn('0.profile.age', 0);

// Object mode
const darkMode = await db.settings.getIn('ui.theme.darkMode', false);
```

### `setIn(path, value): Promise<boolean>`
Set value at nested path
```typescript
// Set nested property
await db.users.setIn('0.profile.lastLogin', new Date());
await db.settings.setIn('ui.theme.darkMode', true);
```

### `mergeIn(path, value): Promise<boolean>`
Merge object at nested path
```typescript
await db.users.mergeIn('0.profile', {
  lastLogin: new Date(),
  loginCount: 5
});

await db.settings.mergeIn('ui.theme', {
  darkMode: true,
  primaryColor: '#blue'
});
```

### `pushIn(path, value): Promise<boolean>`
Push to array at nested path
```typescript
await db.users.pushIn('0.tags', 'premium');
await db.settings.pushIn('recentFiles', '/path/to/file.txt');
```

### `pullIn(path, predicate): Promise<any[]>`
Remove from array at nested path
```typescript
// Remove by function
const removed = await db.users.pullIn('0.tags', (tag: string) => tag === 'expired');

// Remove by matching object
const removedItems = await db.users.pullIn('0.orders', { status: 'cancelled' });
```

### `deleteIn(path): Promise<boolean>`
Delete property at nested path
```typescript
await db.users.deleteIn('0.temporaryData');
await db.settings.deleteIn('cache.expiredEntries');
```

### `updateIn(path, updater): Promise<any>`
Update value at path using updater function
```typescript
// Increment counter
const newCount = await db.users.updateIn('0.loginCount', (count: number) => (count || 0) + 1);

// Transform data
const updated = await db.settings.updateIn('ui.recentFiles', (files: string[]) => 
  files.slice(-10)  // Keep only last 10 files
);
```

## Global Operations

### `deleteAll(): Promise<boolean>`
Delete all collection files
```typescript
await db.deleteAll();  // Removes all .json files in database directory
```

## File Storage Details

### File Structure
```
db/
├── users.json      # Array: [{"id":1,"name":"John"}, ...]
├── settings.json   # Object: {"theme":"dark","language":"en"}
├── posts.json      # Array: [{"id":1,"title":"Post 1"}, ...]
└── cache.json      # null or actual data
```

### Data Format Examples

#### Array Mode File (users.json)
```json
[
  {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "age": 25
  },
  {
    "id": 2,
    "name": "Jane Smith",
    "email": "jane@example.com", 
    "age": 30
  }
]
```

#### Object Mode File (settings.json)
```json
{
  "theme": "dark",
  "language": "en",
  "notifications": {
    "email": true,
    "push": false
  },
  "ui": {
    "sidebar": "collapsed",
    "fontSize": 14
  }
}
```

## Error Handling

### File System Errors
```typescript
try {
  const user = await db.users.insert({ name: 'John' });
} catch (error) {
  // Handle file system errors (permissions, disk space, etc.)
  console.error('Database error:', error);
}
```

### Data Validation
```typescript
try {
  // This will throw if path is not an array
  await db.users.pushIn('0.tags', 'newTag');
} catch (error) {
  console.error('Path is not an array:', error.message);
}
```

## Concurrency Safety

### Automatic Locking
All write operations are automatically locked per collection:
```typescript
// These operations on the same collection will be queued
Promise.all([
  db.users.insert({ name: 'User 1' }),
  db.users.insert({ name: 'User 2' }),
  db.users.update(1, { name: 'Updated' })
]);

// Operations on different collections run concurrently
Promise.all([
  db.users.insert({ name: 'John' }),
  db.settings.insert('theme', 'dark'),  // Different collection - runs in parallel
  db.posts.insert({ title: 'New Post' })
]);
```

### Lock Behavior
- Locks are per-collection (file-based)
- Read operations don't require locks
- Write operations are queued if lock exists
- Operations process in FIFO order
- Temporary files prevent data corruption

## Type Safety

### Generic Collections
```typescript
interface User {
  id?: number;
  name: string;
  email: string;
  age: number;
  profile?: {
    bio: string;
    avatar: string;
  };
}

interface Settings {
  theme: 'light' | 'dark';
  language: string;
  notifications: boolean;
}

// Type-safe collection access
const users = db.users as ReturnType<JsonDB['_makeCollection']<User>>;
const settings = db.settings as ReturnType<JsonDB['_makeCollection']<Settings>>;

// Now you get full TypeScript support
const user: User | null = await users.findById(1);
const theme: Settings | null = await settings.get();
```

## Performance Considerations

- Files are read/written for each operation (not in-memory)
- Automatic ID generation scans array for max ID
- Lodash operations may be slow on large datasets
- Consider periodic cleanup of deleted records
- Temporary files are used for atomic writes
- JSON serialization overhead for large objects