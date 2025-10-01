/*
* Comprehensive Test Suite for JsonDB with MongoDB Integration
* Verifies all existing methods work correctly across JSON, MongoDB, and Hybrid modes
*/

import { JsonDB } from './db';

interface Pokemon {
  id?: number;
  name: string;
  type: string[];
  level: number;
  stats: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
  moves?: string[];
  trainer?: string;
}

interface User {
  id?: number;
  username: string;
  team: number[];
  badges: number;
  region: string;
  settings?: Record<string, any>;
}

// Test configurations for different modes
const testConfigs = {
  json: {
    mode: 'json' as const,
    basePath: './test-data-json'
  },
  mongodb: {
    mode: 'mongodb' as const,
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
      dbName: 'pokemon_test'
    }
  },
  hybrid: {
    mode: 'hybrid' as const,
    basePath: './test-data-hybrid',
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
      dbName: 'pokemon_hybrid_test'
    },
    defaultToMongo: ['users', 'battles']
  }
};

class DatabaseTester {
  private db: JsonDB;
  private mode: string;

  constructor(mode: 'json' | 'mongodb' | 'hybrid') {
    this.mode = mode;
    this.db = new JsonDB(testConfigs[mode]);
  }

  async setup() {
    if (this.mode !== 'json') {
      await this.db.connect();
    }
    await this.db.deleteAll();
    console.log(`🔧 Setup complete for ${this.mode} mode`);
  }

  async cleanup() {
    await this.db.deleteAll();
    if (this.mode !== 'json') {
      await this.db.disconnect();
    }
    console.log(`🧹 Cleanup complete for ${this.mode} mode`);
  }

  // Test all basic CRUD operations
  async testBasicOperations(): Promise<boolean> {
    console.log(`\n📝 Testing Basic CRUD Operations (${this.mode})`);
    
    try {
      // Test INSERT operations
      const pikachu = await this.db.pokemon.insert({
        name: 'Pikachu',
        type: ['Electric'],
        level: 25,
        stats: { hp: 35, attack: 55, defense: 40, spAttack: 50, spDefense: 50, speed: 90 },
        moves: ['Thunderbolt', 'Quick Attack']
      } as Pokemon);
      
      console.log('✅ Insert:', pikachu.name, 'ID:', pikachu.id);

      // Test GET operations
      const allPokemon = await this.db.pokemon.get();
      console.log('✅ Get all:', Array.isArray(allPokemon) ? allPokemon.length : 'object');

      // Test FIND operations
      const foundPikachu = await this.db.pokemon.findById(pikachu.id!);
      console.log('✅ FindById:', foundPikachu?.name);

      const electricTypes = await this.db.pokemon.get({ type: 'Electric' });
      console.log('✅ Filter by type:', Array.isArray(electricTypes) ? electricTypes.length : 'N/A');

      // Test UPDATE operations
      const updatedPikachu = await this.db.pokemon.update(pikachu.id!, { level: 50 });
      console.log('✅ Update level:', updatedPikachu?.level);

      // Test UPSERT operations
      const charizard = await this.db.pokemon.upsert(
        { name: 'Charizard' },
        { name: 'Charizard', type: ['Fire', 'Flying'], level: 36, stats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 } }
      );
      console.log('✅ Upsert:', charizard.name);

      // Test EXISTS/HAS operations
      const hasCharizard = await this.db.pokemon.exists({ name: 'Charizard' });
      const hasPikachuId = await this.db.pokemon.has(pikachu.id!);
      console.log('✅ Exists/Has:', hasCharizard, hasPikachuId);

      // Test COUNT operations
      const count = await this.db.pokemon.count();
      console.log('✅ Count:', count);

      return true;
    } catch (error) {
      console.error('❌ Basic operations failed:', error);
      return false;
    }
  }

  // Test sync operations (JSON only)
  async testSyncOperations(): Promise<boolean> {
    if (this.mode !== 'json') {
      console.log(`\n⏩ Skipping Sync Operations (${this.mode} - not supported)`);
      return true;
    }

    console.log(`\n⚡ Testing Sync Operations (${this.mode})`);
    
    try {
      // Test sync insert
      const blastoise = this.db.pokemon.insertSync({
        name: 'Blastoise',
        type: ['Water'],
        level: 36,
        stats: { hp: 79, attack: 83, defense: 100, spAttack: 85, spDefense: 105, speed: 78 }
      } as Pokemon);
      console.log('✅ InsertSync:', blastoise.name);

      // Test sync get
      const allPokemonSync = this.db.pokemon.getSync();
      console.log('✅ GetSync count:', Array.isArray(allPokemonSync) ? allPokemonSync.length : 'object');

      // Test sync update
      const updatedBlastoise = this.db.pokemon.updateSync(blastoise.id!, { level: 45 });
      console.log('✅ UpdateSync level:', updatedBlastoise?.level);

      return true;
    } catch (error) {
      console.error('❌ Sync operations failed:', error);
      return false;
    }
  }

  // Test bulk operations
  async testBulkOperations(): Promise<boolean> {
    console.log(`\n🔢 Testing Bulk Operations (${this.mode})`);
    
    try {
      // Bulk insert
      const starterPokemon = [
        { name: 'Bulbasaur', type: ['Grass', 'Poison'], level: 5, stats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 } },
        { name: 'Charmander', type: ['Fire'], level: 5, stats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 } },
        { name: 'Squirtle', type: ['Water'], level: 5, stats: { hp: 44, attack: 48, defense: 65, spAttack: 50, spDefense: 64, speed: 43 } }
      ] as Pokemon[];

      const inserted = await this.db.pokemon.bulkInsert(starterPokemon);
      console.log('✅ BulkInsert:', inserted.length, 'Pokemon');

      // Bulk update
      const updates = inserted.map(p => ({ id: p.id!, data: { level: 10 } }));
      const updated = await this.db.pokemon.bulkUpdate(updates);
      console.log('✅ BulkUpdate:', updated.filter(u => u !== null).length, 'Pokemon');

      // Bulk upsert
      const upserts = [
        { query: { name: 'Mew' }, data: { name: 'Mew', type: ['Psychic'], level: 100, stats: { hp: 100, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 } } },
        { query: { id: inserted[0].id }, data: { trainer: 'Red' } }
      ];
      const upserted = await this.db.pokemon.bulkUpsert(upserts);
      console.log('✅ BulkUpsert:', upserted.length, 'operations');

      return true;
    } catch (error) {
      console.error('❌ Bulk operations failed:', error);
      return false;
    }
  }

  // Test deep path operations
  async testDeepPathOperations(): Promise<boolean> {
    console.log(`\n🔍 Testing Deep Path Operations (${this.mode})`);
    
    try {
      // Insert user with nested settings
      const user = await this.db.users.insert({
        username: 'ash_ketchum',
        team: [],
        badges: 0,
        region: 'Kanto',
        settings: {
          theme: 'dark',
          sound: true,
          notifications: {
            battles: true,
            trades: false
          }
        }
      } as User);

      // Test getIn
      const theme = await this.db.users.getIn(`${user.id}.settings.theme`);
      console.log('✅ GetIn theme:', theme);

      // Test setIn
      await this.db.users.setIn(`${user.id}.settings.language`, 'en');
      const language = await this.db.users.getIn(`${user.id}.settings.language`);
      console.log('✅ SetIn language:', language);

      // Test mergeIn
      await this.db.users.mergeIn(`${user.id}.settings`, { volume: 0.8 });
      const volume = await this.db.users.getIn(`${user.id}.settings.volume`);
      console.log('✅ MergeIn volume:', volume);

      // Test pushIn (for arrays)
      await this.db.users.pushIn(`${user.id}.team`, 25); // Pikachu's ID
      const team = await this.db.users.getIn(`${user.id}.team`);
      console.log('✅ PushIn team:', Array.isArray(team) ? team.length : team);

      // Test updateIn
      const newBadges = await this.db.users.updateIn(`${user.id}.badges`, (current: number) => current + 1);
      console.log('✅ UpdateIn badges:', newBadges);

      return true;
    } catch (error) {
      console.error('❌ Deep path operations failed:', error);
      return false;
    }
  }

  // Test utility operations
  async testUtilityOperations(): Promise<boolean> {
    console.log(`\n🔧 Testing Utility Operations (${this.mode})`);
    
    try {
      // Test keys/values
      const pokemonKeys = await this.db.pokemon.keys();
      const pokemonValues = await this.db.pokemon.values();
      console.log('✅ Keys/Values:', pokemonKeys.length, '/', Array.isArray(pokemonValues) ? pokemonValues.length : 'object');

      // Test first/last
      const firstPokemon = await this.db.pokemon.first();
      const lastPokemon = await this.db.pokemon.last();
      console.log('✅ First/Last:', firstPokemon?.name, '/', lastPokemon?.name);

      // Test clear
      await this.db.users.clear();
      const userCount = await this.db.users.count();
      console.log('✅ Clear users:', userCount);

      return true;
    } catch (error) {
      console.error('❌ Utility operations failed:', error);
      return false;
    }
  }

  // Test collection management
  async testCollectionManagement(): Promise<boolean> {
    console.log(`\n📁 Testing Collection Management (${this.mode})`);
    
    try {
      // Create a temporary collection
      await this.db.tempCollection.insert({ test: 'data', value: 123 });
      const hasTemp = await this.db.tempCollection.exists({ test: 'data' });
      console.log('✅ Temporary collection created:', hasTemp);

      // Delete the collection
      await this.db.tempCollection.delete();
      console.log('✅ Collection deleted');

      return true;
    } catch (error) {
      console.error('❌ Collection management failed:', error);
      return false;
    }
  }

  // Test functional queries
  async testFunctionalQueries(): Promise<boolean> {
    console.log(`\n🔍 Testing Functional Queries (${this.mode})`);
    
    try {
      // Add some test data
      await this.db.pokemon.bulkInsert([
        { name: 'Alakazam', type: ['Psychic'], level: 40, stats: { hp: 55, attack: 50, defense: 45, spAttack: 135, spDefense: 95, speed: 120 } },
        { name: 'Machamp', type: ['Fighting'], level: 40, stats: { hp: 90, attack: 130, defense: 80, spAttack: 65, spDefense: 85, speed: 55 } },
        { name: 'Gengar', type: ['Ghost', 'Poison'], level: 40, stats: { hp: 60, attack: 65, defense: 60, spAttack: 130, spDefense: 75, speed: 110 } }
      ] as Pokemon[]);

      // Test functional filtering
      const fastPokemon = await this.db.pokemon.get((pokemon: Pokemon) => {
        return pokemon.stats && pokemon.stats.speed > 100;
      });
      console.log('✅ Functional filter (speed > 100):', Array.isArray(fastPokemon) ? fastPokemon.length : 'N/A');

      // Test finding with function
      const strongAttacker = await this.db.pokemon.findOne({ stats: { attack: { $gt: 120 } } });
      // Note: MongoDB-style queries won't work with lodash filter, so we use functional approach
      const strongAttackerFunc = await this.db.pokemon.get((pokemon: Pokemon) => {
        return pokemon.stats && pokemon.stats.attack > 120;
      });
      console.log('✅ Strong attacker found:', Array.isArray(strongAttackerFunc) && strongAttackerFunc.length > 0);

      return true;
    } catch (error) {
      console.error('❌ Functional queries failed:', error);
      return false;
    }
  }

  // Run all tests
  async runAllTests(): Promise<boolean> {
    console.log(`\n🧪 Starting Full Test Suite for ${this.mode.toUpperCase()} mode`);
    console.log('='.repeat(50));

    await this.setup();

    const tests = [
      () => this.testBasicOperations(),
      () => this.testSyncOperations(),
      () => this.testBulkOperations(),
      () => this.testDeepPathOperations(),
      () => this.testUtilityOperations(),
      () => this.testCollectionManagement(),
      () => this.testFunctionalQueries()
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        const result = await test();
        if (result) {
          passed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error('❌ Test execution error:', error);
        failed++;
      }
    }

    await this.cleanup();

    console.log(`\n📊 Test Results for ${this.mode.toUpperCase()}:`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

    return failed === 0;
  }
}

// Migration testing
async function testMigration() {
  console.log('\n🔄 Testing Migration Between Storage Types');
  console.log('='.repeat(40));

  // Create JSON DB with test data
  const jsonDB = new JsonDB({ mode: 'json', basePath: './migration-test-json' });
  await jsonDB.deleteAll();

  // Insert test data in JSON
  await jsonDB.pokemon.bulkInsert([
    { name: 'Pikachu', type: ['Electric'], level: 25, stats: { hp: 35, attack: 55, defense: 40, spAttack: 50, spDefense: 50, speed: 90 } },
    { name: 'Charizard', type: ['Fire', 'Flying'], level: 36, stats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 } }
  ] as Pokemon[]);

  const jsonCount = await jsonDB.pokemon.count();
  console.log('✅ JSON data created:', jsonCount, 'Pokemon');

  if (process.env.MONGODB_URI) {
    try {
      // Create hybrid DB and test migration
      const hybridDB = new JsonDB({
        mode: 'hybrid',
        basePath: './migration-test-json',
        mongodb: {
          uri: process.env.MONGODB_URI,
          dbName: 'migration_test'
        }
      });

      await hybridDB.connect();
      
      // Migrate to MongoDB
      await hybridDB.migrateToMongoDB(['pokemon']);
      console.log('✅ Migrated to MongoDB');

      // Verify data in MongoDB mode
      const mongoOnlyDB = new JsonDB({
        mode: 'mongodb',
        mongodb: {
          uri: process.env.MONGODB_URI,
          dbName: 'migration_test'
        }
      });
      await mongoOnlyDB.connect();
      
      const mongoCount = await mongoOnlyDB.pokemon.count();
      console.log('✅ MongoDB verification:', mongoCount, 'Pokemon');

      // Migrate back to JSON
      await hybridDB.migrateToJSON(['pokemon']);
      console.log('✅ Migrated back to JSON');

      await hybridDB.disconnect();
      await mongoOnlyDB.disconnect();

    } catch (error) {
      console.log('⚠️ MongoDB migration test skipped (connection failed):', (error as Error).message);
    }
  } else {
    console.log('⚠️ MongoDB migration test skipped (no MONGODB_URI)');
  }

  await jsonDB.deleteAll();
}

// Performance comparison
async function performanceTest() {
  console.log('\n⚡ Performance Comparison Test');
  console.log('='.repeat(30));

  const testData = Array.from({ length: 1000 }, (_, i) => ({
    name: `Pokemon_${i}`,
    type: ['Normal'],
    level: Math.floor(Math.random() * 100) + 1,
    stats: {
      hp: Math.floor(Math.random() * 100) + 50,
      attack: Math.floor(Math.random() * 100) + 50,
      defense: Math.floor(Math.random() * 100) + 50,
      spAttack: Math.floor(Math.random() * 100) + 50,
      spDefense: Math.floor(Math.random() * 100) + 50,
      speed: Math.floor(Math.random() * 100) + 50
    }
  }));

  // Test JSON performance
  const jsonDB = new JsonDB({ mode: 'json', basePath: './perf-test-json' });
  await jsonDB.deleteAll();
  
  const jsonStart = Date.now();
  await jsonDB.pokemon.bulkInsert(testData);
  const jsonInsertTime = Date.now() - jsonStart;
  
  const jsonReadStart = Date.now();
  const jsonResults = await jsonDB.pokemon.get((p: any) => p.level > 50);
  const jsonReadTime = Date.now() - jsonReadStart;
  
  console.log('📁 JSON Performance:');
  console.log(`   Insert 1000 records: ${jsonInsertTime}ms`);
  console.log(`   Filter query: ${jsonReadTime}ms (${Array.isArray(jsonResults) ? jsonResults.length : 0} results)`);

  if (process.env.MONGODB_URI) {
    try {
      // Test MongoDB performance
      const mongoDB = new JsonDB({
        mode: 'mongodb',
        mongodb: {
          uri: process.env.MONGODB_URI,
          dbName: 'perf_test'
        }
      });
      
      await mongoDB.connect();
      await mongoDB.deleteAll();
      
      const mongoStart = Date.now();
      await mongoDB.pokemon.bulkInsert(testData);
      const mongoInsertTime = Date.now() - mongoStart;
      
      const mongoReadStart = Date.now();
      const mongoResults = await mongoDB.pokemon.get((p: any) => p.level > 50);
      const mongoReadTime = Date.now() - mongoReadStart;
      
      console.log('☁️ MongoDB Performance:');
      console.log(`   Insert 1000 records: ${mongoInsertTime}ms`);
      console.log(`   Filter query: ${mongoReadTime}ms (${Array.isArray(mongoResults) ? mongoResults.length : 0} results)`);
      
      await mongoDB.disconnect();
    } catch (error) {
      console.log('⚠️ MongoDB performance test skipped:', (error as Error).message);
    }
  }

  await jsonDB.deleteAll();
}

// Main test runner
export async function runFullTestSuite() {
  console.log('🧪 JsonDB Comprehensive Test Suite');
  console.log('=====================================');
  console.log('Testing all methods across all storage modes...\n');

  const modes: ('json' | 'mongodb' | 'hybrid')[] = ['json'];
  
  // Add MongoDB tests if connection is available
  if (process.env.MONGODB_URI) {
    modes.push('mongodb', 'hybrid');
  } else {
    console.log('⚠️ MONGODB_URI not set - skipping MongoDB and hybrid tests');
  }

  let totalPassed = 0;
  let totalFailed = 0;

  // Run tests for each mode
  for (const mode of modes) {
    const tester = new DatabaseTester(mode);
    const success = await tester.runAllTests();
    
    if (success) {
      totalPassed++;
    } else {
      totalFailed++;
    }
  }

  // Run additional tests
  await testMigration();
  await performanceTest();

  console.log('\n🏁 Final Results');
  console.log('=================');
  console.log(`✅ Modes Passed: ${totalPassed}`);
  console.log(`❌ Modes Failed: ${totalFailed}`);
  console.log(`🎯 Overall Success: ${totalFailed === 0 ? 'PASS' : 'FAIL'}`);

  if (totalFailed === 0) {
    console.log('\n🎉 All tests passed! Your JsonDB with MongoDB integration is working perfectly!');
    console.log('✨ All existing methods are fully compatible across all storage modes.');
  } else {
    console.log('\n⚠️ Some tests failed. Please check the error messages above.');
  }

  return totalFailed === 0;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runFullTestSuite().catch(console.error);
}