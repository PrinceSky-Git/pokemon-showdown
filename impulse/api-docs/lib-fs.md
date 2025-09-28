# Pokemon Showdown FS API Usage Sheet

## Overview
An abstraction layer around Node.js filesystem with Promise support, path resolution, and write protection for unit tests.

## Basic Usage
```typescript
import { FS } from './lib/fs';

// Create FSPath instance
const file = FS('path/to/file.txt');
```

## File Reading

### `read(options?)`
```typescript
await FS('file.txt').read()                    // string (utf8)
await FS('file.txt').read('ascii')             // string (ascii)
await FS('file.txt').read({ encoding: 'hex' }) // string (hex)
```

### `readSync(options?)`
```typescript
FS('file.txt').readSync()                    // string (utf8)
FS('file.txt').readSync('base64')            // string (base64)
FS('file.txt').readSync({ encoding: 'utf8' }) // string
```

### `readBuffer(options?)`
```typescript
await FS('file.txt').readBuffer()    // Buffer
await FS('file.txt').readBuffer({})  // Buffer with options
```

### `readBufferSync(options?)`
```typescript
FS('file.txt').readBufferSync()    // Buffer
FS('file.txt').readBufferSync({})  // Buffer with options
```

### `readIfExists()`
```typescript
await FS('file.txt').readIfExists()    // string or empty string if not exists
```

### `readIfExistsSync()`
```typescript
FS('file.txt').readIfExistsSync()    // string or empty string if not exists
```

## File Writing

### `write(data, options?)`
```typescript
await FS('file.txt').write('content')
await FS('file.txt').write(Buffer.from('content'))
await FS('file.txt').write('content', { encoding: 'utf8' })
```

### `writeSync(data, options?)`
```typescript
FS('file.txt').writeSync('content')
FS('file.txt').writeSync(Buffer.from('content'))
```

### `safeWrite(data, options?)`
Writes to temporary file then renames to avoid corruption
```typescript
await FS('file.txt').safeWrite('content')
await FS('file.txt').safeWrite(Buffer.from('content'))
```

### `safeWriteSync(data, options?)`
```typescript
FS('file.txt').safeWriteSync('content')
```

### `writeUpdate(dataFetcher, options?)`
Race-condition safe updates with optional throttling
```typescript
FS('file.txt').writeUpdate(() => getCurrentData())
FS('file.txt').writeUpdate(() => getData(), { throttle: 1000 }) // max once per second
```

### `append(data, options?)`
```typescript
await FS('file.txt').append('new content')
await FS('file.txt').append(Buffer.from('content'))
```

### `appendSync(data, options?)`
```typescript
FS('file.txt').appendSync('new content')
```

## File Operations

### `exists()`
```typescript
await FS('file.txt').exists()    // boolean
```

### `existsSync()`
```typescript
FS('file.txt').existsSync()    // boolean
```

### `copyFile(dest)`
```typescript
await FS('source.txt').copyFile('dest.txt')
```

### `rename(target)`
```typescript
await FS('old.txt').rename('new.txt')
```

### `renameSync(target)`
```typescript
FS('old.txt').renameSync('new.txt')
```

### `unlinkIfExists()`
```typescript
await FS('file.txt').unlinkIfExists()    // no error if file doesn't exist
```

### `unlinkIfExistsSync()`
```typescript
FS('file.txt').unlinkIfExistsSync()
```

### `symlinkTo(target)`
```typescript
await FS('link').symlinkTo('target')
```

### `symlinkToSync(target)`
```typescript
FS('link').symlinkToSync('target')
```

## Directory Operations

### `readdir()`
```typescript
await FS('directory').readdir()    // string[]
```

### `readdirSync()`
```typescript
FS('directory').readdirSync()    // string[]
```

### `readdirIfExists()`
```typescript
await FS('directory').readdirIfExists()    // string[] or empty array
```

### `readdirIfExistsSync()`
```typescript
FS('directory').readdirIfExistsSync()    // string[] or empty array
```

### `mkdir(mode?)`
```typescript
await FS('newdir').mkdir()           // default 0o755
await FS('newdir').mkdir(0o644)      // custom permissions
```

### `mkdirSync(mode?)`
```typescript
FS('newdir').mkdirSync()
FS('newdir').mkdirSync(0o644)
```

### `mkdirIfNonexistent(mode?)`
```typescript
await FS('dir').mkdirIfNonexistent()    // no error if exists
```

### `mkdirIfNonexistentSync(mode?)`
```typescript
FS('dir').mkdirIfNonexistentSync()
```

### `mkdirp(mode?)`
Creates directory and parent directories recursively
```typescript
await FS('path/to/deep/dir').mkdirp()
```

### `mkdirpSync(mode?)`
```typescript
FS('path/to/deep/dir').mkdirpSync()
```

### `rmdir(recursive?)`
```typescript
await FS('dir').rmdir()          // empty directory only
await FS('dir').rmdir(true)      // recursive removal
```

### `rmdirSync(recursive?)`
```typescript
FS('dir').rmdirSync(true)
```

## File Information

### `isFile()`
```typescript
await FS('path').isFile()    // boolean
```

### `isFileSync()`
```typescript
FS('path').isFileSync()    // boolean
```

### `isDirectory()`
```typescript
await FS('path').isDirectory()    // boolean
```

### `isDirectorySync()`
```typescript
FS('path').isDirectorySync()    // boolean
```

### `realpath()`
```typescript
await FS('symlink').realpath()    // resolved absolute path
```

### `realpathSync()`
```typescript
FS('symlink').realpathSync()    // resolved absolute path
```

## Streams

### `createReadStream()`
```typescript
const readStream = FS('file.txt').createReadStream()
// Returns FileReadStream extending ReadStream
```

### `createWriteStream(options?)`
```typescript
const writeStream = FS('file.txt').createWriteStream()
const writeStream = FS('file.txt').createWriteStream({ encoding: 'utf8' })
```

### `createAppendStream(options?)`
```typescript
const appendStream = FS('file.txt').createAppendStream()
```

## File Watching

### `onModify(callback)`
```typescript
FS('file.txt').onModify(() => {
    console.log('File modified!');
});
```

### `unwatch()`
```typescript
FS('file.txt').unwatch()    // Clear modification callbacks
```

## Utility Methods

### `parentDir()`
```typescript
const parent = FS('path/to/file.txt').parentDir()    // FSPath for 'path/to'
```

## Global Configuration
- `global.Config?.nofswriting` - When true, all write operations are disabled (for unit tests)

## Constants
- `FS.ROOT_PATH` - Base directory path
- `FS.FSPath` - FSPath class constructor
- `FS.FileReadStream` - FileReadStream class constructor

## Path Resolution
All paths are resolved relative to Pokemon Showdown's root directory. The library automatically handles path resolution and prevents access outside the project directory.