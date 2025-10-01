/*
* MongoDB Configuration Examples for JsonDB
* Copy this file and rename to db-config.ts for your setup
*/

import { JsonDB } from './db';

// ========== Configuration Examples ==========

// 1. JSON-only mode (original behavior)
export const jsonOnlyDB = new JsonDB({
  mode: 'json',
  basePath: './data'
});

// 2. MongoDB-only mode
export const mongoOnlyDB = new JsonDB({
  mode: 'mongodb',
  mongodb: {
    uri: 'mongodb+srv://username:password@cluster0.mongodb.net/?retryWrites=true&w=majority',
    dbName: 'pokemon_showdown',
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferMaxEntries: 0,
      retryWrites: true,
      w: 'majority'
    }
  }
});

// 3. Hybrid mode with smart fallbacks
export const hybridDB = new JsonDB({
  mode: 'hybrid',
  basePath: './data',
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster0.mongodb.net/',
    dbName: process.env.MONGODB_DB || 'pokemon_showdown'
  },
  // These collections will use MongoDB by default in hybrid mode
  defaultToMongo: ['users', 'battles', 'tournaments', 'leaderboard']
});

// 4. Development vs Production setup
const isDevelopment = process.env.NODE_ENV === 'development';

export const db = new JsonDB({
  mode: isDevelopment ? 'json' : 'hybrid',
  basePath: isDevelopment ? './dev-data' : './data',
  mongodb: isDevelopment ? undefined : {
    uri: process.env.MONGODB_URI!,
    dbName: process.env.MONGODB_DB || 'pokemon_showdown_prod',
    options: {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000
    }
  },
  defaultToMongo: ['users', 'battles', 'tournaments', 'stats']
});

// ========== Usage Examples ==========

export async function setupDatabase() {
  // Connect to MongoDB (only needed for mongodb/hybrid modes)
  await db.connect();
  
  console.log('Database connected!');
  console.log('Mode:', db.getConfig().mode);
  console.log('MongoDB connected:', db.isMongoConnected());
}

export async function exampleUsage() {
  await setupDatabase();

  // The API remains exactly the same regardless of storage backend!
  
  // Insert a Pokemon
  const pikachu = await db.pokemon.insert({
    name: 'Pikachu',
    type: ['Electric'],
    stats: { hp: 35, attack: 55, defense: 40 },
    level: 50
  });
  
  // Insert a user (will use MongoDB in hybrid mode if specified)
  const trainer = await db.users.insert({
    username: 'ash_ketchum',
    team: [pikachu.id],
    badges: 8,
    region: 'Kanto'
  });
  
  // Query works the same way
  const electricPokemon = await db.pokemon.get({ type: 'Electric' });
  const ashsTeam = await db.users.findOne({ username: 'ash_ketchum' });
  
  console.log('Electric Pokemon:', electricPokemon);
  console.log('Ash\'s data:', ashsTeam);
}

// ========== Migration Examples ==========

export async function migrateToMongoDB() {
  // Migrate all JSON data to MongoDB
  await db.migrateToMongoDB();
  
  // Or migrate specific collections only
  await db.migrateToMongoDB(['users', 'battles']);
}

export async function migrateToJSON() {
  // Backup MongoDB data to JSON files
  await db.migrateToJSON();
  
  // Or backup specific collections only
  await db.migrateToJSON(['users', 'pokemon']);
}

// ========== Environment Variables Setup ==========
/*
Create a .env file in your project root:

MONGODB_URI=mongodb+srv://username:password@cluster0.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=pokemon_showdown
NODE_ENV=production

For development, set:
NODE_ENV=development
*/

// ========== Error Handling ==========

export async function robustDatabaseSetup() {
  try {
    await db.connect();
    console.log('✅ Database connected successfully');
    
    if (db.isMongoConnected()) {
      console.log('✅ MongoDB is available');
    } else {
      console.log('⚠️  Using JSON fallback (MongoDB unavailable)');
    }
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    
    if (db.getConfig().mode === 'mongodb') {
      // MongoDB-only mode requires connection
      throw error;
    }
    
    // In hybrid mode, we can continue with JSON
    console.log('📁 Continuing with JSON-only mode');
  }
}

// ========== Graceful Shutdown ==========

export async function shutdownDatabase() {
  try {
    await db.disconnect();
    console.log('✅ Database disconnected successfully');
  } catch (error) {
    console.error('❌ Error during database shutdown:', error);
  }
}

// Setup process handlers for clean shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  await shutdownDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Received SIGTERM, shutting down...');
  await shutdownDatabase();
  process.exit(0);
});

export default db;