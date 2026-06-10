const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const { registerSlowQueryMonitoring } = require('../utils/mongoose-slow-query');
const modelFactory = require('../models/model-factory');

class DatabaseManager {
  constructor() {
    this.connections = new Map(); // Store active connections
    this.inFlight = new Map(); // Dedupe concurrent createConnection for same dbName
    this.connectionMeta = new Map(); // dbName -> lastUsedAt ms
    this.mainDbName = 'ease_my_salon_main';
    this._defaultMainConnection = null;
    this.maxCachedTenants = parseInt(process.env.MONGO_MAX_CACHED_TENANTS, 10) || 50;
    this.tenantIdleMs = parseInt(process.env.MONGO_TENANT_IDLE_MS, 10) || 30 * 60 * 1000;
    const sweepMs = parseInt(process.env.MONGO_CONNECTION_SWEEP_MS, 10) || 10 * 60 * 1000;
    this._sweepTimer = setInterval(() => {
      void this._evictStaleConnections();
    }, sweepMs);
    if (typeof this._sweepTimer.unref === 'function') this._sweepTimer.unref();
    this.tenantPoolOptions = {
      maxPoolSize: parseInt(process.env.MONGO_TENANT_POOL_SIZE, 10) || 10,
      minPoolSize: parseInt(process.env.MONGO_TENANT_MIN_POOL, 10) || 1,
      socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS, 10) || 45000,
      serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_MS, 10) || 10000,
      // Railway closes idle sockets; keep pool sockets alive longer to avoid MongoNotConnectedError churn.
      maxIdleTimeMS: parseInt(process.env.MONGO_MAX_IDLE_MS, 10) || 120000,
      heartbeatFrequencyMS: parseInt(process.env.MONGO_HEARTBEAT_MS, 10) || 10000,
      monitorCommands: true,
    };
    this.mainPoolOptions = {
      maxPoolSize: parseInt(process.env.MONGO_MAIN_POOL_SIZE, 10) || 50,
      minPoolSize: parseInt(process.env.MONGO_MAIN_MIN_POOL, 10) || 5,
      socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS, 10) || 45000,
      serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_MS, 10) || 10000,
      maxIdleTimeMS: parseInt(process.env.MONGO_MAX_IDLE_MS, 10) || 120000,
      heartbeatFrequencyMS: parseInt(process.env.MONGO_HEARTBEAT_MS, 10) || 10000,
      monitorCommands: true,
    };
    this.healthPingIntervalMs =
      parseInt(process.env.MONGO_HEALTH_PING_INTERVAL_MS, 10) || 5000;

    const fullUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    
    logger.debug(`\n🔧 ===== DatabaseManager Initialization =====`);
    logger.debug(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.debug(`   Full URI: ${fullUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

    try {
      // Parse URI and remove any database name, preserve query parameters
      const [uriWithoutQuery, queryParams] = fullUri.split('?');
      const uriParts = uriWithoutQuery.split('/');
      
      logger.debug(`   URI parts count: ${uriParts.length}`);

      if (uriParts.length > 3) {
        // Has database name, remove it
        this.baseUri = uriParts.slice(0, -1).join('/');
        logger.debug(`   ✂️  Removed database name from URI`);
      } else {
        // No database name in URI
        this.baseUri = uriWithoutQuery;
        logger.debug(`   ℹ️  No database name to remove`);
      }

      // Preserve or add query parameters
      if (queryParams) {
        this.baseUri = `${this.baseUri}?${queryParams}`;
        logger.debug(`   ✅ Preserved query parameters`);
      } else {
        // If no query params exist, add authSource=admin for Railway MongoDB
        // This is needed because Railway MongoDB users are created in the admin database
        this.baseUri = `${this.baseUri}?authSource=admin`;
        logger.debug(`   ✅ Added authSource=admin for authentication`);
      }
    } catch (error) {
      logger.error('   ⚠️  Error parsing MONGODB_URI:', error.message);
      this.baseUri = fullUri.split('?')[0];
    }

    // Validate base URI
    if (!this.baseUri || this.baseUri === 'mongodb:' || this.baseUri === 'mongodb+srv:') {
      logger.warn('   ⚠️  Invalid base URI, using fallback');
      this.baseUri = 'mongodb://localhost:27017';
    }
    
    logger.debug(`   Base URI: ${this.baseUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    logger.debug(`✅ DatabaseManager initialized`);
    logger.debug(`==========================================\n`);
  }

  /**
   * Get database name for a business
   * @param {string} businessCode - The business code (e.g., "BIZ0001")
   * @returns {string} - Database name in format: ease_my_salon_{businessCode}
   */
  getDatabaseName(businessCode) {
    return `ease_my_salon_${businessCode}`;
  }

  _touchConnection(dbName) {
    this.connectionMeta.set(dbName, Date.now());
  }

  /**
   * Register mongoose default connection (from connectDB) as the main pool.
   * Avoids a second createConnection() to ease_my_salon_main.
   */
  adoptDefaultMainConnection(conn) {
    if (!conn || conn.readyState !== 1) return;
    const dbName = conn.db?.databaseName;
    if (dbName !== this.mainDbName) return;
    this.connections.set(this.mainDbName, conn);
    this._touchConnection(this.mainDbName);
    this._defaultMainConnection = conn;
    logger.debug('♻️  Adopted mongoose default connection as main DB pool');
  }

  getMainPoolOptions() {
    return { ...this.mainPoolOptions };
  }

  _clearConnectionArtifacts(connection) {
    if (!connection) return;
    modelFactory.clearModelsForConnection(connection);
    delete connection.modelsCache;
    delete connection.supplierPayableIndexRepairPromise;
    delete connection.ensureWalkInClientPromise;
    delete connection._lastHealthPing;
    delete connection._lastHealthOk;
  }

  _registerConnectionLifecycle(dbName, connection) {
    if (!connection || connection._lifecycleRegistered) return;
    connection._lifecycleRegistered = true;

    const dropFromCache = () => {
      const cached = this.connections.get(dbName);
      if (cached !== connection) return;
      this.connections.delete(dbName);
      this.connectionMeta.delete(dbName);
      this._clearConnectionArtifacts(connection);
      logger.warn('[db] dropped cached connection for %s after disconnect/close', dbName);
    };

    connection.on('disconnected', dropFromCache);
    connection.on('close', dropFromCache);
    connection.on('error', (err) => {
      logger.warn('[db] connection error for %s: %s', dbName, err.message);
    });
  }

  async _pingConnection(connection) {
    if (!connection || connection.readyState !== 1 || !connection.db) {
      return false;
    }
    try {
      await connection.db.admin().command({ ping: 1 });
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Cached ping so hot paths do not admin-ping on every request. */
  async _ensureHealthy(dbName, connection) {
    if (!connection || connection.readyState !== 1) {
      return false;
    }
    const now = Date.now();
    if (
      connection._lastHealthPing &&
      now - connection._lastHealthPing < this.healthPingIntervalMs &&
      connection._lastHealthOk
    ) {
      return true;
    }
    const ok = await this._pingConnection(connection);
    connection._lastHealthPing = now;
    connection._lastHealthOk = ok;
    if (!ok) {
      logger.warn('[db] health ping failed for %s (readyState=%s)', dbName, connection.readyState);
    }
    return ok;
  }

  async _closeOne(dbName) {
    const conn = this.connections.get(dbName);
    if (conn && conn !== this._defaultMainConnection) {
      try {
        await conn.close();
      } catch (_) {}
    }
    this._clearConnectionArtifacts(conn);
    this.connections.delete(dbName);
    this.connectionMeta.delete(dbName);
  }

  async _evictStaleConnections() {
    const now = Date.now();
    for (const [dbName, conn] of this.connections.entries()) {
      if (conn.readyState !== 1) {
        await this._closeOne(dbName);
      }
    }
    for (const dbName of [...this.connections.keys()]) {
      if (dbName === this.mainDbName) continue;
      const last = this.connectionMeta.get(dbName) || 0;
      if (now - last > this.tenantIdleMs) {
        await this._closeOne(dbName);
      }
    }
    while (this.connections.size > this.maxCachedTenants) {
      let oldestName = null;
      let oldestTime = Infinity;
      for (const dbName of this.connections.keys()) {
        if (dbName === this.mainDbName) continue;
        const t = this.connectionMeta.get(dbName) || 0;
        if (t < oldestTime) {
          oldestTime = t;
          oldestName = dbName;
        }
      }
      if (!oldestName) break;
      await this._closeOne(oldestName);
    }
  }

  /**
   * Get or create a database connection for a business
   * @param {string} businessIdOrCode - The business code (preferred) or ObjectId
   * @param {object} mainConnection - Optional main database connection to look up business code
   * @returns {Promise<mongoose.Connection>} - Database connection
   */
  async getConnection(businessIdOrCode, mainConnection = null) {
    if (!businessIdOrCode) {
      throw new Error('Business ID or code is required');
    }

    logger.debug(`\n🔍 ===== Getting Business Database Connection =====`);
    logger.debug(`   Input: ${businessIdOrCode}`);

    // Determine if input is a business code (starts with letters) or ObjectId (hex string)
    const isBusinessCode = /^[A-Z]/.test(businessIdOrCode);
    let businessCode = businessIdOrCode;

    logger.debug(`   Type: ${isBusinessCode ? 'Business Code' : 'ObjectId'}`);

    // If ObjectId provided, try to look up business code
    if (!isBusinessCode && mainConnection) {
      try {
        logger.debug(`   🔍 Looking up business code for ObjectId...`);
        const Business = mainConnection.model('Business', require('../models/Business').schema);
        const business = await Business.findById(businessIdOrCode).select('code');
        
        if (business && business.code) {
          businessCode = business.code;
          logger.debug(`   ✅ Found business code: ${businessCode}`);
        } else {
          logger.warn(`   ⚠️  Business found but no code! Will use ObjectId for database name.`);
          businessCode = businessIdOrCode;
        }
      } catch (error) {
        logger.error(`   ❌ Failed to lookup business code:`, error.message);
        logger.warn(`   ⚠️  Falling back to ObjectId for database name`);
        businessCode = businessIdOrCode;
      }
    }

    const dbName = this.getDatabaseName(businessCode);

    const existing = this.connections.get(dbName);
    if (existing) {
      if (await this._ensureHealthy(dbName, existing)) {
        this._touchConnection(dbName);
        logger.debug(`   ♻️  Reusing existing connection: ${dbName}`);
        logger.debug(`================================================\n`);
        return existing;
      }
      logger.warn(`   ⚠️  Stale connection for ${dbName}; reconnecting`);
      await this._closeOne(dbName);
    }

    if (this.inFlight.has(dbName)) {
      return this.inFlight.get(dbName);
    }

    const uri = this.baseUri.includes('?')
      ? this.baseUri.replace('?', `/${dbName}?`)
      : `${this.baseUri}/${dbName}`;

    const connectPromise = this._openConnection(dbName, uri, this.tenantPoolOptions);
    this.inFlight.set(dbName, connectPromise);
    try {
      const connection = await connectPromise;
      this.connections.set(dbName, connection);
      this._touchConnection(dbName);
      logger.debug(`✅ Connected to business database: ${dbName}`);
      logger.debug(`================================================\n`);
      return connection;
    } finally {
      this.inFlight.delete(dbName);
    }
  }

  async _openConnection(dbName, uri, poolOptions) {
    logger.debug(`   🔗 Creating new database connection`);
    logger.debug(`   Database Name: ${dbName}`);
    logger.debug(`   URI: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

    let connection;
    try {
      connection = mongoose.createConnection(uri, poolOptions);
      await connection.asPromise();
      registerSlowQueryMonitoring(connection);

      if (connection.readyState !== 1) {
        throw new Error(`Connection not ready. State: ${connection.readyState}`);
      }

      const actualDbName = connection.db.databaseName;
      if (actualDbName !== dbName) {
        await connection.close();
        throw new Error(`Database creation failed: expected ${dbName} but got ${actualDbName}`);
      }
      this._registerConnectionLifecycle(dbName, connection);
      return connection;
    } catch (error) {
      logger.error(`   ❌ Connection failed:`, error.message);
      if (connection) {
        try {
          await connection.close();
        } catch (_) {}
      }
      throw new Error(`Failed to connect to ${dbName}: ${error.message}`);
    }
  }

  /**
   * Get the main database connection (for businesses, users, admins)
   * @returns {Promise<mongoose.Connection>} - Main database connection
   */
  async getMainConnection() {
    const mainDbName = this.mainDbName;

    if (mongoose.connection.readyState === 1) {
      const defaultDb = mongoose.connection.db?.databaseName;
      if (defaultDb === mainDbName) {
        this.adoptDefaultMainConnection(mongoose.connection);
        return mongoose.connection;
      }
    }

    const existing = this.connections.get(mainDbName);
    if (existing) {
      if (await this._ensureHealthy(mainDbName, existing)) {
        this._touchConnection(mainDbName);
        logger.debug(`♻️  Reusing existing main database connection`);
        return existing;
      }
      logger.warn(`⚠️  Stale main connection; reconnecting`);
      await this._closeOne(mainDbName);
    }

    if (this.inFlight.has(mainDbName)) {
      return this.inFlight.get(mainDbName);
    }

    logger.debug(`\n🔗 Connecting to main database: ${mainDbName}`);
    const uri = this.baseUri.includes('?')
      ? this.baseUri.replace('?', `/${mainDbName}?`)
      : `${this.baseUri}/${mainDbName}`;

    const connectPromise = this._openConnection(mainDbName, uri, this.mainPoolOptions);
    this.inFlight.set(mainDbName, connectPromise);
    try {
      const connection = await connectPromise;
      this.connections.set(mainDbName, connection);
      this._touchConnection(mainDbName);
      logger.debug(`✅ Connected to main database: ${mainDbName}\n`);
      return connection;
    } finally {
      this.inFlight.delete(mainDbName);
    }
  }

  /**
   * Close a specific business database connection
   * @param {string} businessCode - The business code (e.g., "BIZ0001")
   */
  async closeConnection(businessCode) {
    const dbName = this.getDatabaseName(businessCode);
    if (this.connections.has(dbName)) {
      await this.connections.get(dbName).close();
      this.connections.delete(dbName);
      logger.debug(`🔌 Closed connection to: ${dbName}`);
    }
  }

  /**
   * Delete a business database completely
   * @param {string} businessCode - The business code (e.g., "BIZ0001")
   * @returns {Promise<boolean>} - True if deleted successfully
   */
  async deleteDatabase(businessCode) {
    try {
      const dbName = this.getDatabaseName(businessCode);
      
      logger.debug(`\n🗑️  Deleting business database: ${dbName}`);
      
      // Close connection if open
      if (this.connections.has(dbName)) {
        await this.closeConnection(businessCode);
      }
      
      // Get main connection to access admin commands
      const mainConnection = await this.getMainConnection();
      
      // Use the database connection to drop it
      const dbToDelete = mainConnection.useDb(dbName);
      await dbToDelete.dropDatabase();
      
      logger.debug(`✅ Deleted business database: ${dbName}\n`);
      return true;
    } catch (error) {
      logger.error(`❌ Error deleting database ${businessCode}:`, error.message);
      throw error;
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections() {
    if (this._sweepTimer) {
      clearInterval(this._sweepTimer);
      this._sweepTimer = null;
    }
    logger.debug(`\n🔌 Closing all database connections...`);
    for (const dbName of [...this.connections.keys()]) {
      await this._closeOne(dbName);
      logger.debug(`   Closed: ${dbName}`);
    }
    this.inFlight.clear();
    logger.debug(`✅ All connections closed\n`);
  }

  /**
   * Get all active connections
   * @returns {Array} - List of active database names
   */
  getActiveConnections() {
    return Array.from(this.connections.keys());
  }
}

// Export singleton instance
module.exports = new DatabaseManager();
