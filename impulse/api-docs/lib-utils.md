# Pokemon Showdown Utils API Usage Sheet

## Import Statement
```typescript
// Named imports (recommended)
import { 
  getString, escapeHTML, escapeRegex, stripHTML, 
  compare, sortBy, shuffle, randomElement,
  deepClone, deepFreeze, splitFirst, parseExactInt,
  clampIntRange, formatOrder, visualize, levenshtein,
  waitUntil, clearRequireCache, formatSQLArray,
  bufFromHex, bufReadHex, bufWriteHex, Multiset,
  html, escapeHTMLForceWrap, forceWrap
} from './lib/utils';

// Import all as Utils object (backward compatibility)
import { Utils } from './lib/utils';

// Import specific types
import type { Comparable } from './lib/utils';
```

## Overview
Miscellaneous utility functions with no dependencies, designed for wide project compatibility.

## String Utilities

### `getString(str: any): string`
Safely converts any value to string without crashing
```typescript
getString("hello")        // "hello"
getString(42)            // "42"
getString({})            // ""
getString(null)          // ""
getString(undefined)     // ""
```

### `escapeRegex(str: string): string`
Escapes regex special characters
```typescript
escapeRegex("hello[world]")  // "hello\\[world\\]"
escapeRegex("$100")          // "\\$100"
```

### `escapeHTML(str: string | number): string`
Escapes HTML characters and converts newlines to `<br />`
```typescript
escapeHTML("<script>")       // "&lt;script&gt;"
escapeHTML("Hello\nWorld")   // "Hello<br />World"
escapeHTML('"quotes"')       // "&quot;quotes&quot;"
```

### `stripHTML(htmlContent: string): string`
Removes all HTML tags from string
```typescript
stripHTML("<p>Hello <b>World</b></p>")  // "Hello World"
stripHTML("")                           // ""
```

### `html(strings: TemplateStringsArray, ...args: any): string`
Template tag for HTML escaping
```typescript
const name = "<script>";
html`Hello ${name}!`  // "Hello &lt;script&gt;!"
```

### `escapeHTMLForceWrap(text: string): string`
Combines HTML escaping with forced word wrapping
```typescript
escapeHTMLForceWrap("verylongwordwithoutbreaks<tag>")
// HTML-escaped with <wbr /> inserted for wrapping
```

### `forceWrap(text: string): string`
Inserts word break characters (U+200B) in long words
```typescript
forceWrap("superlongwordwithoutspaces")
// Inserts break hints every 10 chars at word boundaries
```

## Array Utilities

### `shuffle<T>(arr: T[]): T[]`
In-place Fisher-Yates shuffle
```typescript
const arr = [1, 2, 3, 4, 5];
shuffle(arr);  // arr is now randomly shuffled
```

### `randomElement<T>(arr: T[]): T`
Returns random element from array
```typescript
randomElement([1, 2, 3, 4])  // random number from array
randomElement(['a', 'b'])    // 'a' or 'b'
```

### `deepClone(obj: any): any`
Deep clones any object/array
```typescript
const original = {a: {b: [1, 2, 3]}};
const cloned = deepClone(original);
// cloned is completely independent copy
```

### `deepFreeze<T>(obj: T): T`
Recursively freezes object (handles circular references)
```typescript
const obj = {a: {b: 1}};
deepFreeze(obj);
// obj and obj.a are now frozen
```

## Comparison and Sorting

### `compare(a: Comparable, b: Comparable): number`
Smart comparator for mixed types
```typescript
// Numbers: low to high
compare(1, 2)        // -1
compare(-5, 3)       // -8

// Strings: A-Z case-insensitive
compare("apple", "banana")  // -1

// Booleans: true first
compare(true, false)  // -1

// Arrays: lexical comparison
compare([1, 2], [1, 3])  // -1

// Reverse with {reverse: value}
compare({reverse: "z"}, {reverse: "a"})  // -1 (z comes before a)
```

### `sortBy<T>(array: T[], callback?: (a: T) => Comparable): T[]`
Sorts array using compare logic
```typescript
// Sort numbers
sortBy([3, 1, 4, 1, 5])  // [1, 1, 3, 4, 5]

// Sort by callback
const users = [{name: "Bob", age: 30}, {name: "Alice", age: 25}];
sortBy(users, u => u.name)  // sorted by name A-Z
sortBy(users, u => u.age)   // sorted by age low-high
sortBy(users, u => {reverse: u.name})  // sorted by name Z-A
```

## String Parsing

### `splitFirst(str: string, delimiter: string | RegExp, limit = 1): string[]`
Splits string only at first N delimiters
```typescript
splitFirst("a b c d", " ")        // ["a", "b c d"]
splitFirst("a b c d", " ", 2)     // ["a", "b", "c d"]
splitFirst("a-b-c", /-/, 1)       // ["a", "b-c"]
```

### `parseExactInt(str: string): number`
Parses integer only if in normalized form
```typescript
parseExactInt("123")     // 123
parseExactInt("-45")     // -45
parseExactInt("007")     // NaN (not normalized)
parseExactInt("12.0")    // NaN (not integer)
parseExactInt(" 12 ")    // NaN (has whitespace)
```

## Number Utilities

### `formatOrder(place: number): string`
Converts numbers to ordinal strings
```typescript
formatOrder(1)   // "1st"
formatOrder(2)   // "2nd" 
formatOrder(3)   // "3rd"
formatOrder(4)   // "4th"
formatOrder(11)  // "11th"
formatOrder(21)  // "21st"
```

### `clampIntRange(num: any, min?: number, max?: number): number`
Forces value to be integer within range
```typescript
clampIntRange(5.7, 0, 10)      // 5
clampIntRange(-5, 0, 10)       // 0
clampIntRange(15, 0, 10)       // 10
clampIntRange("hello", 0, 10)  // 0
```

## Debug and Visualization

### `visualize(value: any, depth = 0): string`
Creates readable string representation of any value
```typescript
visualize({a: 1, b: [2, 3]})     // "{a: 1, b: [2, 3]}"
visualize(new Map([['a', 1]]))   // "Map (1) { \"a\" => 1 }"
visualize(new Set([1, 2, 3]))    // "Set (3) { 1, 2, 3 }"
visualize(undefined)             // "undefined"
visualize(null)                  // "null"
```

## Distance and Similarity

### `levenshtein(s: string, t: string, l: number): number`
Calculates Levenshtein distance between strings
```typescript
levenshtein("kitten", "sitting", 0)  // 3
levenshtein("hello", "world", 0)     // 4
levenshtein("abc", "def", 2)         // 3 (early exit if > l)
```

## Async Utilities

### `waitUntil(time: number): Promise<void>`
Waits until specific timestamp
```typescript
const futureTime = Date.now() + 5000;
await waitUntil(futureTime);  // waits 5 seconds
```

## Module Management

### `clearRequireCache(options?: { exclude?: string[] }): void`
Clears Node.js require cache (except node_modules by default)
```typescript
clearRequireCache();  // clears all except node_modules
clearRequireCache({ exclude: ['/lib/', '/dist/'] });
```

### `uncacheModuleTree(mod: NodeJS.Module, excludes: string[]): void`
Recursively uncaches module tree
```typescript
uncacheModuleTree(require.cache['/path/to/module'], ['/node_modules/']);
```

## SQL Utilities

### `formatSQLArray(arr: unknown[], args?: unknown[]): string`
Formats array for SQL IN clauses
```typescript
const values = [1, 2, 3];
const args = [];
const placeholder = formatSQLArray(values, args);
// placeholder: "?, ?, ?"
// args: [1, 2, 3]
```

## Buffer/Hex Utilities

### `bufFromHex(hex: string): Uint8Array`
Creates buffer from hex string
```typescript
bufFromHex("48656c6c6f")  // Uint8Array for "Hello"
```

### `bufWriteHex(buf: Uint8Array, hex: string, offset = 0): void`
Writes hex string to buffer at offset
```typescript
const buf = new Uint8Array(10);
bufWriteHex(buf, "48656c6c6f", 0);
```

### `bufReadHex(buf: Uint8Array, start = 0, end?: number): string`
Reads buffer as hex string
```typescript
const buf = new Uint8Array([72, 101, 108, 108, 111]);
bufReadHex(buf);  // "48656c6c6f"
```

## Data Structures

### `Multiset<T>`
Map-based multiset implementation
```typescript
const ms = new Multiset<string>();

// Add elements (increments count)
ms.add("apple");     // count: 1
ms.add("apple");     // count: 2

// Get count
ms.get("apple");     // 2
ms.get("banana");    // 0

// Remove elements (decrements count)
ms.remove("apple");  // count: 1, returns true
ms.remove("apple");  // count: 0, deletes key, returns true
ms.remove("apple");  // returns false (key doesn't exist)

// Standard Map methods work
ms.has("apple");     // false
ms.size;             // 0
```

## Type Definitions

### `Comparable`
Union type for values that can be compared
```typescript
type Comparable = number | string | boolean | Comparable[] | { reverse: Comparable };
```

## Backward Compatibility Export

All functions are also available via the `Utils` object:
```typescript
import { Utils } from './lib/utils';

Utils.getString("test");
Utils.escapeHTML("<div>");
Utils.compare(1, 2);
// etc.
```