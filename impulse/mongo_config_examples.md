// config/config.js - Complete MongoDB Configuration Examples

// ============================================================
// OPTION 1: LOCAL DEVELOPMENT - Subprocess (RECOMMENDED)
// Automatically starts MongoDB when server starts
// ============================================================
exports.mongodb = {
	database: 'showdown_dev',
	maxPoolSize: 20,
	minPoolSize: 2,
	maxIdleTimeMS: 30000,
	subprocess: {
		enabled: true,
		mongodPath: 'mongod', // Use 'mongod' if in PATH, or '/usr/local/bin/mongod' for full path
		dbPath: './.mongodb-data', // Where MongoDB stores data
		port: 27017,
		logPath: './logs/mongodb.log',
		wiredTigerCacheSizeGB: 0.5, // Limit MongoDB memory to 512MB (good for development)
	},
};

// ============================================================
// OPTION 2: LOCAL DEVELOPMENT - Manual MongoDB
// You manually start MongoDB in a separate terminal
// ============================================================
exports.mongodb = {
	uri: 'mongodb://localhost:27017',
	database: 'showdown_dev',
	maxPoolSize: 20,
	minPoolSize: 2,
	maxIdleTimeMS: 30000,
	waitQueueTimeoutMS: 10000,
	serverSelectionTimeoutMS: 10000,
};

// ============================================================
// OPTION 3: PRODUCTION - MongoDB Atlas (Cloud)
// ============================================================
exports.mongodb = {
	uri: 'mongodb+srv://username:password@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority',
	database: 'showdown_prod',
	maxPoolSize: 80, // Higher for production
	minPoolSize: 5,
	maxIdleTimeMS: 30000,
	waitQueueTimeoutMS: 10000,
	serverSelectionTimeoutMS: 10000,
};

// ============================================================
// OPTION 4: PRODUCTION - Self-hosted MongoDB with Authentication
// ============================================================
exports.mongodb = {
	uri: 'mongodb://admin:SecurePassword123@your-server.com:27017/showdown_prod?authSource=admin',
	database: 'showdown_prod',
	maxPoolSize: 80,
	minPoolSize: 5,
	maxIdleTimeMS: 60000,
	waitQueueTimeoutMS: 15000,
	serverSelectionTimeoutMS: 15000,
};

// ============================================================
// OPTION 5: REPLICA SET (Production High Availability)
// ============================================================
exports.mongodb = {
	uri: 'mongodb://host1:27017,host2:27017,host3:27017/?replicaSet=rs0&retryWrites=true&w=majority',
	database: 'showdown_prod',
	maxPoolSize: 100,
	minPoolSize: 10,
	maxIdleTimeMS: 60000,
	waitQueueTimeoutMS: 15000,
	serverSelectionTimeoutMS: 15000,
};

// ============================================================
// OPTION 6: TESTING - Subprocess with Different Port
// Useful when you already have MongoDB running on 27017
// ============================================================
exports.mongodb = {
	database: 'showdown_test',
	maxPoolSize: 10,
	minPoolSize: 1,
	subprocess: {
		enabled: true,
		mongodPath: 'mongod',
		dbPath: './.mongodb-test-data',
		port: 27018, // Different port to avoid conflicts
		logPath: './logs/mongodb-test.log',
		wiredTigerCacheSizeGB: 0.25, // Even less memory for testing
	},
};

// ============================================================
// OPTION 7: DISABLED - No MongoDB
// ============================================================
exports.mongodb = null;
// or simply don't define exports.mongodb at all

// ============================================================
// OPTION 8: READ-ONLY MODE
// Connects but prevents any writes
// ============================================================
exports.mongodb = {
	uri: 'mongodb://localhost:27017',
	database: 'showdown_readonly',
	nodbwriting: true, // Disable all write operations
	maxPoolSize: 20,
	minPoolSize: 2,
};

// ============================================================
// QUICK REFERENCE GUIDE
// ============================================================

/*
SUBPROCESS OPTIONS:
- enabled: true/false - Enable subprocess mode
- mongodPath: Path to mongod binary (default: 'mongod')
- dbPath: Where to store data (default: './.mongodb-data')
- port: Port to run on (default: 27017)
- logPath: Where to write logs (default: './logs/mongodb.log')
- wiredTigerCacheSizeGB: Memory limit in GB (optional, default: MongoDB decides ~50% RAM)

CONNECTION POOL OPTIONS:
- maxPoolSize: Maximum connections (default: 80 for cloud, 20 for local)
- minPoolSize: Minimum ready connections (default: 5 for cloud, 2 for local)
- maxIdleTimeMS: Close idle connections after this (default: 30000ms = 30s)
- waitQueueTimeoutMS: Timeout waiting for connection (default: 10000ms = 10s)
- serverSelectionTimeoutMS: Timeout selecting server (default: 10000ms = 10s)

WHEN TO USE WHAT:
- Subprocess: Development, easy setup, auto-start/stop
- Manual localhost: Development, need to debug MongoDB separately
- Cloud (Atlas): Production, managed service
- Self-hosted: Production, full control
- Replica Set: Production, high availability
*/

// ============================================================
// RECOMMENDED CONFIGURATIONS BY ENVIRONMENT
// ============================================================

// Development (easiest):
exports.mongodb = {
	database: 'showdown_dev',
	subprocess: { enabled: true, wiredTigerCacheSizeGB: 0.5 },
};

// Staging:
exports.mongodb = {
	uri: 'mongodb://staging-server:27017',
	database: 'showdown_staging',
	maxPoolSize: 40,
};

// Production:
exports.mongodb = {
	uri: 'mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority',
	database: 'showdown_prod',
	maxPoolSize: 80,
	minPoolSize: 10,
};
